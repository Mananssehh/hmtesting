# Next build sequence

Three deliverables, shipped in order. Each is independently mergeable.

---

## 1. Reporting System (Trust & Safety)

Close the enforcement gap behind the Trust & Safety page. Guests can flag bad actors; DJs see reports for their events; admins see everything.

### Database (`reports` table)

```text
reports
  id            uuid pk
  reporter_id   uuid  (auth.uid)
  event_id      uuid  nullable (null for nickname/profile reports)
  target_type   text  check in ('request','user','nickname')
  target_id     uuid  (song_request.id OR profile.id)
  reason        text  check in ('inappropriate','harassment','spam','copyright','other')
  details       text  nullable, max 500 chars
  status        text  default 'open'  ('open','reviewing','resolved','dismissed')
  resolution    text  nullable
  created_at    timestamptz
  updated_at    timestamptz
  resolved_at   timestamptz nullable
  resolved_by   uuid nullable
```

RLS:
- INSERT: authenticated, `reporter_id = auth.uid()`, rate-limited via trigger (max 10/hour/user).
- SELECT: reporter sees own; event DJ sees reports on their event; admin sees all (`has_role(auth.uid(),'admin')`).
- UPDATE: event DJ updates `status` + `resolution` for their event's reports; admin updates anything.
- No DELETE for users (admin only).

Indexes: `(event_id, status)`, `(target_type, target_id)`, `(reporter_id, created_at)`.

GRANTs: `SELECT, INSERT, UPDATE` to authenticated; `ALL` to service_role.

### UI

- **`ReportDialog.tsx`** — reusable modal: reason radio group + optional details textarea + submit. Props: `targetType`, `targetId`, `eventId?`.
- **Report entry points**:
  - `SongRequestCard.tsx` — overflow menu "Report request" (guest side).
  - `NowPlayingDisplay.tsx` — overflow "Report current track" (guest side, when source is guest request).
  - `PublicProfile.tsx` — "Report user" / "Report nickname" buttons.
- **DJ view**: new section in `DJEventManage.tsx` ("Reports" tab/card) listing open reports for the event with a status dropdown and a quick-action ("Remove request", "Ban guest" — reusing existing flows).
- **Admin view**: lightweight `/admin/reports` page (admin-only route) — list all, filter by status. Keep minimal.

### Acceptance

- Guest can report a request, nickname, or user; sees toast and cannot submit duplicates within 60s.
- DJ sees open report count badge on event manage page.
- Updating status logs `resolved_at` + `resolved_by` via trigger.

---

## 2. Activity Ledger UI

Surface `points_transactions` (already populated) as a clean, scannable history. No schema changes.

### Where

New tab inside `src/pages/Profile.tsx` → "Activity" (alongside existing "Recent activity"), OR a dedicated `/profile/activity` route. Pick the tab to keep nav flat.

### Data

Single query against `points_transactions` joined with `song_requests` (for title/artist) and `events` (for event name), filtered to `auth.uid()`, paginated (50 per page, "Load more").

### Row format

```text
+15  Starter points                                        Today, 9:14 AM
+1   Joined "Friday Night @ Capitol"                       Yesterday, 11:02 PM
+1   Requested "Tumo Weto" — Mavo                          Yesterday, 11:04 PM
-5   Boosted "How" — Lil Baby                              Yesterday, 11:18 PM
+5   Refunded — request removed                            Yesterday, 11:25 PM
```

- Green for `+`, red for `-`, muted for refunds.
- Running balance shown in header (current `profile.points`) + delta for current view.
- Filters: All / Earned / Spent / Refunded.
- Empty state copy: "No activity yet. Join an event to earn points."

### Acceptance

- Every row has a reason and a human timestamp.
- Clicking a row with `song_request_id` jumps to that event page (when not archived).
- Loads under 300ms for typical balances (<500 rows).

---

## 3. `purchase_consents` table (Stripe foundation)

Pure plumbing. No UI yet — the checkout acknowledgement modal lands in the P1 Stripe build.

### Schema

```text
purchase_consents
  id            uuid pk
  user_id       uuid  (auth.uid)
  version       text  not null    -- e.g. 'v1-2026-06-07'
  accepted_at   timestamptz default now()
  ip            inet  nullable
  user_agent    text  nullable
  unique (user_id, version)
```

RLS:
- INSERT: authenticated, `user_id = auth.uid()`.
- SELECT: own rows only; admin sees all via `has_role`.
- No UPDATE / DELETE.

GRANTs: `SELECT, INSERT` to authenticated; `ALL` to service_role.

Constant `CURRENT_CONSENT_VERSION = 'v1-2026-06-07'` exported from `src/lib/consent.ts` so the future checkout modal and any server-side Stripe edge function reference the same value. Bumping the constant re-prompts users.

### Acceptance

- Migration applies cleanly.
- Helper `recordConsent(version)` in `src/lib/consent.ts` ready for the future checkout modal to call.

---

## Out of scope (this build)

- Checkout acknowledgement modal UI (waits for Stripe enable).
- Boost caps, Turnstile, account deletion, data export, cookie banner — all tracked in `.lovable/plan.md`.
- Search audit — manual QA pass, no code.
- Real-world DJ stress test — operational, not code.

## Build order in one pass

1. Migration: `reports` + `purchase_consents` (single migration, separate sections).
2. `ReportDialog.tsx` + wire into the three entry points.
3. DJ reports section in `DJEventManage.tsx`.
4. Admin reports page + route.
5. Activity Ledger tab in Profile.
6. `src/lib/consent.ts` helper.

Approve to build all three in sequence.
