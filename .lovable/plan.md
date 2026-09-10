# Event Creation / Identity / Rotation / Reopen — Design Contract (no implementation)

Evidence gathered read-only on clean HEAD. Nothing was edited, deployed, migrated or rotated.

## 1. Writer inventory (current state)

Table privileges (`pg_class.relacl` on `public.events`): `anon = awdDxtm` (INSERT/UPDATE/DELETE, no SELECT), `authenticated = arwdDxtm`, `service_role = arwdDxtm`. No column-level grants exist, so any column-level GRANT added later is additive only and does not narrow the table-level grant.

RLS policies on `events`:
- `DJs can create events` — INSERT, authenticated, CHECK `auth.uid()=dj_id AND has_role(uid,'dj')`. Room code is client-supplied. Open bypass.
- `DJs manage their own events` — UPDATE, role PUBLIC, USING `auth.uid()=dj_id`, **no WITH CHECK**. Owner may change `room_code`, `dj_id`, `is_active`, `requests_status`, `ended_at`, `archived_at`. Open bypass.
- `DJs delete their own events` — DELETE, PUBLIC, `auth.uid()=dj_id`.
- `events_select_owner` / `events_select_member` (D5A) — unchanged by this work.

Writers:

| Writer | Columns written | Caller role | Authorization | Breaks under enforcement? |
|---|---|---|---|---|
| `public.create_event` RPC (SECURITY DEFINER, `search_path=''`) | dj_id, name, venue, dj_name, room_code (CSPRNG 6/32), is_active, allow_explicit, require_approval, cooldown_seconds, rules_text | authenticated DJ | `has_role(uid,'dj')`, dj_id forced to `auth.uid()` | No — becomes the only creation path |
| `DJDashboard.tsx:87` / `Archive.tsx:65` | via RPC | DJ | RPC | No |
| `DJDashboard.tsx:129` (End/Reopen toggle) | `requests_status` only | authenticated DJ, direct PATCH | UPDATE policy | **Yes — must move to RPCs** |
| `DJEventManage.tsx:326` (live/paused/ended) | `requests_status` | DJ direct PATCH | UPDATE policy | **Yes for ended→live; pause/resume-within-live must keep working** |
| `ModerationDialog.tsx:80` | event-config fields (allow_explicit, require_approval, cooldown_seconds, rules_text, name/venue) | DJ direct PATCH | UPDATE policy | No — stays allowed |
| Trigger `set_event_ended_at` (BEFORE UPDATE) | `ended_at` | derived | n/a | Retained, subordinated to lifecycle RPC |
| Trigger `sync_event_active` (BEFORE UPDATE) | `is_active` | derived | n/a | Retained; this is the field that silently reopens today |
| `bridge-event-snapshot`, `stripe-webhook`, `tip-create-checkout`, `mcp`/`list-my-events`, `RouteGuards`, `Profile`, `Analytics`, `Archive` | read-only on events (`room_code` read by Bridge snapshot, tip checkout URLs, webhook email) | service role / caller JWT | n/a | No writes; rotation-sensitive (§6) |

No Edge Function or Bridge path writes event identity columns.

## 2. Enforcement mechanism (selected)

Chosen: **column-scoped UPDATE grants + immutable-field trigger + mandatory SECURITY DEFINER lifecycle RPCs.** WITH CHECK alone is rejected: it cannot express "this column did not change", and PUBLIC-role policies still admit `anon`.

1. `REVOKE INSERT, UPDATE, DELETE ON public.events FROM anon;`
   `REVOKE INSERT, UPDATE, DELETE ON public.events FROM authenticated;`
   `GRANT UPDATE (name, venue, dj_name, allow_explicit, require_approval, cooldown_seconds, rules_text) ON public.events TO authenticated;`
   `GRANT SELECT ON public.events TO authenticated;` (D5A SELECT policies unchanged.) `service_role` keeps `ALL`.
2. Drop `DJs can create events` (INSERT) and `DJs delete their own events`. Replace the UPDATE policy with `events_update_settings` — TO authenticated, USING `dj_id = auth.uid()`, WITH CHECK `dj_id = auth.uid()`.
3. Trigger `events_identity_immutable` (BEFORE UPDATE, no security definer, plain `RAISE`): rejects any change to `id`, `dj_id`, `room_code`, `created_at`, and rejects a change of `requests_status`/`is_active`/`ended_at`/`archived_at` **from ended to non-ended**, unless the statement runs inside an approved rotation. Approval is detected structurally, never by a GUC or session flag: the RPCs set `is_active/room_code` while running as the definer role, and the trigger allows the transition only when `current_setting('role')`-independent check `session_user`/`current_user = 'postgres'` (definer owner) holds. Client PostgREST callers are `authenticator → anon/authenticated`, which can never reach that `current_user`, and `SET ROLE` is not grantable to them.
4. Result: a raw PostgREST client cannot (a) INSERT an event at all (no privilege, no policy), (b) UPDATE `room_code`/`dj_id`/`id`/`created_at` (no column privilege + trigger), (c) set `is_active` directly (no column privilege), (d) reopen via `requests_status`/`ended_at`/`archived_at` (no column privilege on those either — they are excluded from the GRANT list), (e) find an alternative lifecycle field, because every derived field is off the allowed column list.

Pause/resume **within** a non-ended event therefore also moves to an RPC: `set_requests_status(_event_id, _status)` (owner-only, definer, rejects `'ended'`→handled by `end_event`, rejects reopening from ended).

## 3. RPC contracts

All: `SECURITY DEFINER`, `SET search_path=''`, fully qualified, no dynamic SQL, `SELECT ... FOR UPDATE` on the event row, generic `{"ok":false,"reason":"unavailable"}` for both not-found and not-owner, `REVOKE EXECUTE FROM public, anon; GRANT EXECUTE TO authenticated`.

`rotate_event_room_code(_event_id uuid) → jsonb` — owner-only; lock row; generate 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` via `extensions.gen_random_bytes(6)`; retry on `unique_violation` up to 10 then fail `could_not_allocate_room_code`; assert new ≠ current; touch nothing but `room_code`; return `{ok, event_id, room_code}`. Abuse limit: max 5 successful rotations per event per rolling hour, recorded in `rate_limit_logs` with `endpoint='rotate_event_room_code'`; over limit → `{"ok":false,"reason":"rate_limited"}`.

`reopen_event(_event_id uuid) → jsonb` — owner-only; `FOR UPDATE` lock taken **before** reading lifecycle state, so a second concurrent call blocks and then observes the already-reopened row and returns `{ok:true, outcome:'already_open', room_code}` without rotating. If genuinely ended: rotate the code and set `requests_status='live'`, `is_active=true`, `ended_at=NULL`, `archived_at=NULL` **in one UPDATE statement**, so no instant exists where the event is live under the old code. Participants, requests, votes, tips, Bridge rows are untouched (all keyed by `event_id`).

`end_event(_event_id uuid)` — owner-only; sets `requests_status='ended'`; existing triggers derive `ended_at`/`is_active`. Existing triggers are **retained**; `sync_event_active`'s ended→live branch becomes unreachable from clients and is kept only as a definer-side safety net, so lifecycle authority is single-sourced in the RPCs.

## 4. Creation enforcement

Exactly the statements in §2.1–2.2. `create_event` already requires an authenticated `dj`-role caller and forces `dj_id := auth.uid()`; it never accepts a client code, so custom codes cannot reappear. Dependencies affected by removing direct INSERT: none in `src/` (both create paths already use the RPC), none in Edge Functions, none in Vitest suites; `supabase/d5b-staged/*` is unaffected.

## 5. Frontend impact (change required)

The Reopen button (`DJDashboard.tsx:129`, `DJEventManage.tsx:326`) PATCHes `requests_status` and returns no row, so it cannot learn a rotated code; local state is set optimistically and `EventQR` renders the stale `event.room_code`. A stale dashboard tab would keep printing a dead QR. Required edits: `src/pages/DJDashboard.tsx`, `src/pages/DJEventManage.tsx` (call `reopen_event` / `set_requests_status` / `end_event`, adopt the returned code, refetch the event), plus a confirmation dialog warning that old links and printed QR codes stop working, and a manual "Rotate code" action. This requires a frontend publish and triggers the agreed bundle-verification rule.

## 6. Rotation safeguards

Participants stay members by `event_id`; nothing about membership breaks. Broken by rotation: printed QR/short links, guests refreshing an old `/join?code=` URL (they get the generic unavailable answer), stale dashboard tabs, Bridge snapshot output (self-heals on next snapshot), and Stripe `success_url`/`cancel_url` built from `room_code` in `tip-create-checkout:250` — an in-flight session would land on a dead event URL after payment (payment itself still succeeds; the tip is keyed by `event_id`).

Preconditions before any live rotation: no song request/vote in the last 15 minutes; no Bridge heartbeat in the last 15 minutes; no unexpired pending Checkout Session for the event; DJ informed and ready to replace links/QR; old→new state recorded privately (hashes only, never the old code in chat or logs). No alias for the old code — that would preserve the vulnerability.

## 7. Ended events

After enforcement: ended rows keep their stored legacy code; `join_event_by_code` already refuses when `is_active` is false or `requests_status='ended'`, so the old code cannot join; no REST path can flip those fields (no column privilege, trigger backstop); the only reopen route rotates first, inside one statement. Therefore ended legacy rows need no mass rotation — **no blocker**.

## 8. Staged rollout (separate approvals)

- **Stage 1 (additive):** create the three RPCs + immutable trigger, no privilege/policy change. Old frontend keeps working. Tests only.
- **Stage 2 (frontend):** publish the RPC-based dashboard + rotation warning; verify new bundle hash. Old cached tabs still use direct PATCH (still permitted) — nothing fails.
- **Stage 3 (enforcement):** apply the REVOKE/GRANT/policy changes. Transitional window: a cached pre-Stage-2 tab's End/Reopen click fails with a permission error and a toast; no silent data change, no partial lifecycle state. Create is already RPC-only in every shipped bundle.
- **Stage 4 (verification):** re-run all bypass probes signed in as a DJ and as anon.
- **Stage 5 (per-event remediation):** only after separate, explicit, per-event human approval.

## 9. Per-event decision matrix (18 active + 4 ended; no codes shown)

Rule set as specified: confirmed project test → end/archive eligible after explicit approval; owner-confirmed finished real event → end/archive eligible; still-needed real event → rotation with DJ coordination; uncertain → no action; already-ended legacy → retain.

| Event ID | Name | DJ | Created | P/R/Tips | Last activity | Class | Recommended |
|---|---|---|---|---|---|---|---|
| 5db11939-fad2-44b9-9cfd-661e01716318 | Nicholas Putnam585 | 0498cbcf | 08-19 | 3/1/17 | 08-19 | uncertain (synthetic-looking, has tips) | no action until clarified |
| 9b4dafae-7269-4f0b-a903-f0c780cdeb83 | A Class Package | d2f8ec78 | 08-18 | 10/1/27 | 08-18 | uncertain | no action |
| ff6d933c-6f54-4617-bc7f-d04f5d23c977 | Baili Breeding Ground | d2f8ec78 | 08-18 | 4/1/2 | 08-18 | uncertain | no action |
| d07b4081-32c3-47e4-953e-d4fa5fccdebc | Outdoor Scenery Farm | d2f8ec78 | 08-18 | 16/2/108 | 08-18 | uncertain | no action |
| bfa5f13b-2b81-4079-9685-fcacf4e9e9dc | My awesome Roblox store | d2f8ec78 | 08-18 | 3/1/0 | 08-18 | uncertain | no action |
| 8fa7e989-ad2d-4f19-a75a-560e2f6a0ff1 | Outdoor Scenery Club | 0498cbcf | 08-17 | 13/1/81 | 08-17 | uncertain | no action |
| acdc1157-0dd9-48bc-ad66-a861bf93c0d6 | Lindsay Hendricks | 0498cbcf | 08-17 | 11/1/45 | 08-17 | uncertain | no action |
| b6012b00-b800-4a73-a6b0-b7ed3bf357e6 | Nicholas Putnam | 0498cbcf | 08-17 | 5/5/7 | 08-17 | uncertain | no action |
| 3cb90a18-997b-49a7-8cfb-2e6fb055bb34 | FINAL TEST POP OUT | 04332ab5 | 07-23 | 1/1/0 | 07-23 | probable project test | end/archive after explicit approval |
| 663c8530-e06b-4ec4-b2ef-7c851e8a4313 | PRE SET TEST | 9897367d | 07-11 | 3/12/0 | 07-11 | probable project test (5-char code) | end/archive after explicit approval |
| 51570708-3771-4603-93da-3376a1112e78 | KWAKU | 1f70626a | 07-08 | 6/9/2 | 07-22 | real, owner has tips | rotate with DJ coordination if still needed |
| 0aacddf7-8b2a-4aa9-8321-737ccaecfc6a | DJ ZEE-K X MHIZ PROD REQUEST LIST | b059ed6b | 06-28 | 3/5/0 | 07-08 | real | rotate with DJ coordination if still needed |
| c8f23fd6-32a2-479d-9890-3d711961c6d0 | Work5tation | c3efc441 | 06-22 | 2/4/0 | 06-22 | uncertain (project-owner account) | no action until clarified |
| 6e3252d6-bc74-4736-951c-3c862d81d921 | sunday morning | 214b2bb7 | 05-19 | 13/12/0 | 07-30 | real | rotate with DJ coordination if still needed |
| 256c971d-43f6-467f-9c9b-cee8134b4fad | MANANSSEH | f231ad12 | 05-16 | 34/17/0 | 06-26 | real, 9-char name-correlated code (weakest) | priority rotation with DJ coordination |
| b38b77bf-fbd0-4464-a500-b830484680f8 | Testing | e74563d5 | 05-09 | 2/0/0 | none | probable test | end/archive after explicit approval |
| 6e32a758-2f53-4d0d-91f7-37c9b2c343a7 | String | 210a27ef | 05-09 | 0/0/0 | none | probable test | end/archive after explicit approval |
| 6620af42-ca2b-493b-9e95-f4eb898082f2 | Testing 101 | 80a3d85d | 05-08 | 0/0/0 | none | probable test | end/archive after explicit approval |
| ce726041-c8f2-4a6f-8129-f065d3c3bd1d | D5B STAGE C TEST | c3efc441 | 09-08 | 3/1/0 | ended | project fixture, already ended | retain |
| b39df681-bc1f-4130-9e2b-39d4360f0c74 | TONI PARTY | 04332ab5 | 07-18 | 32/42/0 | ended | legacy real, ended | retain |
| 0cdfc5f3-72f1-4c87-85e9-61206ce7f4d6 | Birthday party | 04332ab5 | 07-11 | 33/47/0 | ended | legacy real, ended | retain |
| d63e5896-b36b-40c0-84e4-fe829bb0c54b | MhizProd | 1f70626a | 06-06 | 26/15/8 | ended | legacy real, ended, has tips | retain |

Every rotation candidate carries the §6 preconditions. Nothing is ended automatically on inactivity.

## 10. Tests (Stage 1 unless noted)

Isolated Postgres tests: direct INSERT denied (anon + DJ); `create_event` succeeds for a DJ; guest/non-DJ creation denied; UPDATE denied on each of `id`, `dj_id`, `room_code`, `created_at`, `is_active`, `requests_status`, `ended_at`, `archived_at`; allowed settings UPDATE still succeeds; raw PATCH of `requests_status` cannot reopen; `reopen_event` rotates before live (single statement, no intermediate state observable); repeated reopen is idempotent (`already_open`, same code); two concurrent reopens → exactly one new code; rotation owner-only; concurrent rotations preserve uniqueness; new ≠ old; forced 10-collision path fails cleanly with no partial write; participants/requests/votes/tips still attached after rotation; ended weak code cannot join; reopened event accepts only the new code; banned guests still blocked; D5A privacy probes and D5B index/trigger/RPC unchanged; Bridge snapshot, tip checkout, archive/analytics still resolve.

Stage 2 adds Vitest coverage for the reopen/rotate handlers and the stale-code warning. Every stage ends with typecheck, full Vitest, Deno tests, production build.

## 11. Rollback

Additive RPCs/trigger: droppable. Frontend: republish the prior bundle. Enforcement: restore the prior grants/policies (widening only, never re-adding client-chosen codes). Ending a live event: reversible only through `reopen_event`, which rotates. Rotation: **forward-only — a rotated weak code is never restored.**

## 12. IP probe

Stays a separate approval track under the stated conditions (≥256-bit token, temporary Edge secret, never committed/logged, temporary `verify_jwt=false` scoped to the probe, uniform auth failures, POST + `Cache-Control: no-store`, no database client, deleted with its config entry and secret immediately after verification). Not deployed under this contract.
