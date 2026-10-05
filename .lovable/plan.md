# DECKS Analytics — Audit and Staged Plan (no implementation yet)

Everything below comes from a read-only review of the current code and the production policy list. Nothing was changed. Implementation, migrations and publishing each need a separate approval.

## 1. Current analytics audit

The only analytics screen is `/dj/:id/analytics` (owner-guarded). It loads raw rows and does all of its counting in the browser.

| Shown today | Source | Problem found |
|---|---|---|
| Guests | event_participants count | OK |
| Requests | song_requests rows | Includes removed requests |
| Votes | votes count for request ids | Sends every request id in one URL, so large events can fail |
| "Tips (pts)" | sum of song_requests.boost | Mislabelled: these are boost points, not money tips. Real tips (dj_tips) are not shown anywhere |
| Points spent | points_transactions type=spent | OK |
| Most played artist | request count by artist | Actually counts the most requested artist, not plays |
| Most active guest | grouped by requester_name | Wrong when guests share a nickname (nicknames are display-only and not unique) |
| Peak hour | created_at hour | Uses the viewer's local timezone, not the event's |
| Top guests | earned points | Counts starter and join points, not engagement |
| Top requested / Top tipped | score / boost | "Tipped" is boosts, not tips |

CSV exports copy the same browser numbers, so they share every bug above (for example, the summary CSV's "Total tips (pts)" is actually boosts).

## 2. Reusable source data (no duplication)

- **events:** dj, name, free-text venue, created_at, ended_at, status, archived_at
- **song_requests:** track ids, platform, title, artist, album, art, explicit, status, created_at, played_at, queue_position, votes, boost
- **votes, event_participants (joined_at, last_seen_at), points_transactions, boost_purchases**
- **dj_tips:** gross, platform fee, net, status, refunds, event, request, song snapshot
- **song_metadata:** search cache only. It holds no per-user search history.

## 3. Missing data

- **Request status timestamps:** no approved_at, skipped_at, rejected_at or removed_at, and no DJ action reason. Only played_at exists.
- **Status vocabulary:** stored values are pending/approved/playing/played/skipped/removed. There is no separate rejected or cancelled. They would be added as a derived mapping, without changing the stored enum.
- **Venue / Club Room:** no table exists; venue is free text. Venue analytics stays blocked until the Club Room system is approved.
- **Genre:** not captured. Leave it out until a licensed, reliable source is chosen.
- **Search conversion and no-result searches:** no search events are recorded. This needs a new, minimal, pseudonymous search log written by the search function.
- **City / market:** not captured. Leave it out.

## 4. Proposed additive migration (staged only)

1. Add nullable `approved_at`, `skipped_at`, `removed_at` and `dj_action_reason` (a fixed list) to song_requests. A trigger fills them only when the status changes. No backfill; older events show "not recorded".
2. Add a `search_events` table: id, event_id, hashed user, result_count, chose_result, created_at. No query text and no IP. Kept for 90 days.
3. Add owner-scoped read-only functions: `get_event_recap(event_id)`, `get_dj_analytics(from, to)`, `get_admin_analytics(from, to)`. Each one checks ownership or the admin role inside the function. Clients get execute rights only on these; PUBLIC and anonymous access are removed.
4. Add supporting indexes on song_requests(event_id, status), votes(song_request_id) and dj_tips(event_id, status).
5. No recap snapshots for now. The source tables already keep their song details, and tips keep their own song details at payment time.

## 5. Access rules

- Existing table policies stay as they are.
- The new functions return results only to the event owner (DJ functions) or to the admin role (admin function, aggregates only).
- Guests and anonymous visitors are denied.
- Guest-level rows use a pseudonymous id. A nickname appears only through the existing event-scoped nickname lookup.
- Results never include email addresses, payment ids, IP addresses or private profiles.

## 6. Dashboard wireframe

```text
Event Recap  [Requests CSV] [Top guests CSV] [Summary CSV] [Songs CSV]
+--------+--------+--------+--------+
| Guests |Requests| Played | Play % |
| Votes  | Boosts |Tips $  |Avg wait|
+--------+--------+--------+--------+
| Top songs | Top artists (played) | Peak hour (event tz) |
| Most active guest (by id, nickname if allowed) | Timeline |

DJ Analytics (/dj/analytics)
[date range]  Events | Guests reached | Requests | Played
Play / Skip / Removed rates | Avg response time | Returning guests
Revenue by event (gross, refunds, DJ net) | Trend chart

Admin (/admin/analytics, admin role only)
Active DJs | Events | Guests | Requests | Successful tips | DECKS revenue
Payment failure rate | Search -> request conversion | Trends
```

## 7. Metric definitions

- **Request-to-play %:** played ÷ requests that were not removed by the guest
- **Average wait:** average of (played_at − created_at) over played requests
- **Average response time:** average of (first of approved/played/skipped/removed time − created_at); only events after the migration
- **Successful tips:** sum of gross − refunded where status = succeeded. Pending, expired and failed tips are excluded.
- **DJ / DECKS amounts:** dj_tips net / platform fee as stored. The 70/30 split is never recalculated.
- **Returning guest rate:** this DJ's guests who joined at least 2 of the DJ's events ÷ the DJ's unique guests
- **Peak hour:** busiest request hour in the event's timezone; UTC is shown until a timezone is stored
- **Search conversion:** searches where a result was chosen ÷ searches

Tips and boosts never affect queue order; analytics only reads data.

## 8. Testing plan

- **Isolated test database, access checks:** DJ A cannot read DJ B's data. A guest cannot run any analytics function. Admin-only functions reject non-admins.
- **Data checks:** timestamp trigger behaviour for each status change; duplicate votes and requests are not double counted; refunded, failed, expired and pending tips are excluded.
- **App tests:** each metric calculation; CSV totals match dashboard totals.
- **Regression:** existing event entry, song request and boost tests still pass; joining, requesting, voting and moderation are not touched.

## 9. Performance risks

- Recap functions run only when the analytics page opens, never on the live request path.
- The new trigger only sets a timestamp on status change, which adds negligible cost.
- The search log adds one insert per search, done in the background so a failure never blocks search.
- Revisit if an event passes about 5,000 requests.

## 10. Rollback

- Fixes go forward only. New columns and the search table stay unused if the screens are pulled back.
- To roll back the screens, revert the frontend and remove client access to the new functions.
- No existing data is modified at any point.

## 11. Files that would change

**Staged (outside the live migrations folder):**
- `supabase/analytics-staged/01_request_timestamps.sql`
- `supabase/analytics-staged/02_search_events.sql`
- `supabase/analytics-staged/03_analytics_rpcs.sql`
- `supabase/analytics-staged/fixture/*` (isolated database tests)

**Frontend (not published until approved):**
- `src/pages/Analytics.tsx` (switch to the recap function; fix labels, artist, guest and timezone bugs)
- `src/lib/analytics.ts` and `src/lib/analytics.test.ts` (new)
- `src/pages/DJAnalytics.tsx` (new), `src/pages/AdminAnalytics.tsx` (new), `src/App.tsx` (routes)

**Search logging:**
- `supabase/functions/music-search/index.ts` (one background insert; deployment needs separate approval)

**Not touched:** Stripe, sign-in, existing access policies, the join function, request submission and queue order.

## Proposed gates

1. **Gate 1:** write and test the staged SQL and frontend changes locally only.
2. **Gate 2:** apply the migrations (requires the database migration process decision).
3. **Gate 3:** publish the frontend and deploy the search function.

**Venue analytics:** deferred until the Club Room system exists.
