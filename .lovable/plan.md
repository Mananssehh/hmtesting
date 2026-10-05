# DECKS Analytics — Revised Audit and Staged Plan (rev 2, no implementation)

This plan comes from read-only review only. Nothing has been implemented, migrated, deployed or published. Gate 1 (writing and testing locally) starts only after you approve this plan.

## A. Audit summary (unchanged findings, plus new facts)

- `/dj/:id/analytics` (`Analytics.tsx`) does all of its counting in the browser. Several labels are wrong:
  - "Tips (pts)" shows boosts, not tips.
  - "Most played artist" is really the most requested artist.
  - "Most active guest" is grouped by nickname.
  - Peak hour uses the viewer's timezone.
  - The CSVs repeat the same numbers.
- How request statuses change today (new reads):
  - **DJ:** direct table update (`DJEventManage.tsx` lines 216, 219).
  - **Guest:** the `remove_my_song_request` function, or a direct update through the guest's own soft-remove policy.
  - **Bridge / now-playing:** the server key updates `played` (`now-playing-ingest`).
- **DJs also hard-delete requests** (`DJEventManage.tsx` lines 290, 639), so those requests leave no trace today.
- No existing write path records who acted or why. Status values today: pending, approved, playing, played, skipped, removed.

## 1. Request status history — recommendation

| | Nullable timestamp columns | Append-only `song_request_status_events` |
|---|---|---|
| Repeated transitions (playing to approved to playing) | Overwritten | Every step kept |
| Who acted | Not captured | Captured |
| Reason | One overwriteable field | One per transition |
| Survives DJ hard delete | No | Yes, with no foreign key, plus a delete event |

**Recommended: append-only table.** Columns:
- id, song_request_id (uuid, no foreign key), event_id
- from_status (nullable for creation), to_status (text; adds the extra value `deleted`)
- acted_by_user_id
- actor_type: guest | dj | system | admin
- reason_code: a fixed list, nullable; for example `guest_cancelled`, `dj_rejected`, `dj_duplicate`, `dj_inappropriate`, `dj_not_available`, `system_event_ended`, `system_bridge_played`
- occurred_at

A database trigger on song_requests runs after every insert, status change and delete, and works out the actor itself:
- **No signed-in user:** `system`, or `system_bridge_played` when the new status is played.
- **The requester:** `guest`, with reason `guest_cancelled` when the new status is removed.
- **The event's DJ:** `dj`.
- **An admin acting directly:** `admin`.

Clients cannot write to the table. The trigger never blocks the queue: if logging fails, it raises a warning and the queue change still goes through.

**DJ reasons:** the trigger records the actor for every change. Specific DJ reasons (rejected vs duplicate) need the DJ screen to send them, which would change the live moderation path. That is **deferred to a separately approved phase**. Until then, DJ removals record `reason_code = null` and the screens show them as "removed by DJ (reason not recorded)".

## 2. Removed requests and request-to-play

**Request-to-play** = played ÷ (requests − requests removed by the guest).
- DJ removals and deletions stay in the denominator.
- System removals are shown separately.

The metric is labelled accurate only for requests created after the trigger goes live. For older events it shows "estimated: removal actor not recorded".

## 3. Search funnel

The funnel has three stages, each counted separately:

```text
search_performed  ->  result_selected  ->  request_created
```

- **Search:** music-search makes a random `search_event_id` (uuid) for each search. It returns this id with the results and stores the row through a server-only database function.
- **Selection:** when the guest picks a result, the client calls `mark_search_selected(search_event_id)`.
- **Request created:** after `request_song` succeeds, the client calls `link_search_request(search_event_id, song_request_id)`. This is a separate function, so `request_song` and the live request path are not touched.
- **Ownership checks:** the link function checks that the caller requested that song (`requested_by = auth.uid()`). It also recomputes the caller's pseudonym (section 4) and checks it matches the search row before linking. Linking is one-time and only allowed within 30 minutes of the search.
- **Safety:** the id alone reveals nothing and works only for the guest who made the search.
- **Reliable, nonblocking write:** the search function hands the database write to `EdgeRuntime.waitUntil(...)`, which keeps it running after the response is sent. Failures are logged and never fail the search.

## 4. Search privacy and retention

- **Stored per row:** id, event_id, guest_pseudonym, result_count, provider, selected_at, song_request_id, created_at. **No query text and no IP address.**
- **Pseudonym:** `hmac(sha256, user_id || ':' || event_id, analytics_pepper)`.
  - The pepper is a 32-byte random secret kept in Vault, readable only by the database owner.
  - The pseudonym is computed inside the server-only logging function, never in the browser.
  - Because it is scoped to one event, it can't follow a guest across events.
  - It can't be reversed without the pepper.
- **Retention:**
  - A database function `purge_search_events()` deletes rows older than 90 days. Only the database owner can run it.
  - A daily scheduled job (03:15 UTC) calls it; the same scheduler already runs the email queue.
  - The migration adds both the function and the job, plus a no-public-access check.
  - **Test:** insert rows 89 and 91 days old into the test database, run the purge, and confirm only the 91-day row is gone. Also confirm guests can't run the purge.
- **Pepper rotation:** rotating the pepper makes earlier pseudonyms impossible to link (stated as accepted).

## 5. Returning guests

These are calculated only inside `get_dj_analytics()` from existing participation records (event_participants by user). The function returns only `unique_guests`, `returning_guests` and `returning_rate`. No guest ids go to the browser.

## 6. Timezone

- Add a nullable `events.timezone` text field.
- A trigger checks the value against Postgres's list of real timezone names; invalid names are rejected.
- The DJ's browser fills it in when an event is created (`Intl.DateTimeFormat().resolvedOptions().timeZone`). It is saved through the DJ's existing permission to update their own events. The event-creation function is not changed.
- Events without a timezone use UTC and are labelled "(UTC)". The viewer's timezone is never used.

## 7. Function security (every analytics function)

Template:

```sql
create function public.get_event_recap(_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not exists (select 1 from public.events e where e.id=_event_id and e.dj_id=_uid)
    then raise exception 'not_found' using errcode='P0002'; end if;
  ... aggregates only ...
end $$;
revoke all on function public.get_event_recap(uuid) from public, anon;
grant execute on function public.get_event_recap(uuid) to authenticated;
```

| Function | Who can run it | Authorization check |
|---|---|---|
| get_event_recap(uuid) | signed-in users | Caller owns the event |
| get_event_request_rows(uuid) (for the CSV) | signed-in users | Caller owns the event |
| get_dj_analytics(from, to) | signed-in users | Only the caller's own events |
| get_admin_analytics(from, to) | signed-in users | Caller is an admin, checked directly (below) |
| mark_search_selected, link_search_request | signed-in users | Pseudonym and ownership match |
| log_search_event(user_id, ...) | server key only | Called by music-search after verifying the user |
| purge_search_events() | database owner only | Scheduled job |

- **Admin check:** reads the role table for the caller directly (`user_id = auth.uid() and role = 'admin'`). It does not use `has_role`.
- **Returned data:** counts, sums, song and artist text, and nicknames only through the existing event-scoped nickname lookup.
- **Never returned:** user ids, emails, payment ids or private profile fields.
- **Guest identifiers in results:** most-active-guest rows use a per-response label (Guest 1, 2...) unless a nickname is shown.

## 8. Metric definitions

- **Unique guest:** a distinct participant user in the event, excluding the DJ.
- **Most active guest:** the participant user with the most requests that weren't removed by the guest. Ties go to whoever requested first. Shown by nickname, never grouped by nickname.
- **Active DJ:** a user with the DJ role who owns at least one event with at least one request in the period.
- **Payment failure rate:** failed ÷ (succeeded + failed) tips in the period. Expired and pending tips are excluded and reported separately.
- **Result-selection rate:** searches with a selected result ÷ searches performed.
- **Search-to-request rate:** searches linked to a successfully created request ÷ searches performed. Only this is called conversion.
- **Partial refunds:** net tip = gross − refunded.
- **Platform revenue after refunds:**
  - Per succeeded tip: platform_fee × (gross − refunded) ÷ gross, using the stored fee.
  - The 70/30 split is never recalculated or changed.

## 9. Routes and screens

- **No new DJ analytics page.** Upgrade the existing `/dj/:id/analytics` screen for the per-event recap.
- **DJ trends across events:** add a summary panel to the existing DJ dashboard (`/dj`), with no new route. Existing links (DJ event management, Archive) are kept.
- **One new page:** `/admin/analytics`, admin-only. No admin analytics screen exists to upgrade, which justifies adding one.

## 10. CSV security

- Update `src/lib/csv.ts` so any value starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`. Existing quoting stays.
- CSV data comes from the same owner-checked functions as the screens.
- **Tests:** formula-injection cases; another DJ's event is rejected; CSV totals match the recap totals.

## 11. Performance testing

- **Test data:** an isolated database with realistic data, about 500 events, 50k requests, 150k votes, 20k participants, 5k tips and 200k search rows.
- **Query plans:** run `EXPLAIN (ANALYZE, BUFFERS)` for each function and record the plans and timings.
- **Indexes:** add each index only when a recorded plan shows it is needed. Candidates:
  - song_request_status_events(event_id, occurred_at)
  - search_events(event_id, created_at)
  - search_events(created_at) for the purge
- **Concurrency:** 20 to 50 analytics requests at once against the test database while requests and votes are being written; measure any slowdown on the request path.
- **500-user search burst:** a staging run once a staging environment is approved. Until then this test is **blocked**: there is no separate staging environment, and production testing is not authorized.
- **Scope:** these tests cover analytics and search logging only. **They do not certify DECKS as a whole for 500 simultaneous users.**

## 12. Rollback procedure

1. Revoke execute on all analytics functions from signed-in users; the screens fall back to "unavailable".
2. Disable the history trigger (`alter table public.song_requests disable trigger song_request_status_history`).
3. Revert the frontend to the previous published build.
4. Stop search logging: redeploy music-search without the logging call, or set the `analytics_search_logging=false` switch it checks.
5. Keep all collected history and search rows. Deleting them needs separate approval; the 90-day purge keeps running unless it is unscheduled.
6. Reversible steps: drop the trigger and functions; leave the tables and the timezone field in place, marked deprecated.

## Files that would change

**Staged only, under `supabase/analytics-staged/`:**
- `01_status_history.sql`
- `02_event_timezone.sql`
- `03_search_events_and_purge.sql`
- `04_analytics_functions.sql`
- `fixture/` (test database, access matrix, performance data, `EXPLAIN` outputs)

**Frontend:**
- `src/pages/Analytics.tsx`
- `src/pages/DJDashboard.tsx` (summary panel)
- `src/pages/AdminAnalytics.tsx` (new)
- `src/App.tsx` (admin route)
- `src/lib/analytics.ts` and its test
- `src/lib/csv.ts` and its test
- the event-creation screen (fills in the timezone)
- the request sheet in `src/pages/EventPage.tsx` (calls the selection and link functions after success only)

**Edge Function:** `supabase/functions/music-search/index.ts`. The change is staged and deployed only with approval.

**Not touched:** Stripe, sign-in, existing access policies, join-event, `request_song`, queue order, DJ moderation writes.

## Gates

1. **Gate 1:** write and test the staged SQL and app changes locally, in the isolated test database.
2. **Gate 2:** apply the migrations. This needs the database migration process decided first.
3. **Gate 3:** deploy music-search and publish the frontend.
4. **Later, separate approval:** DJ reason codes in moderation; the staging 500-user burst test.
