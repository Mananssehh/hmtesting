# D5A / D5B Revised Contract (no implementation)

Scope: close anonymous enumeration of events, room codes, song requests, requester IDs and now-playing rows, while preserving QR/code joining, DJ tools, Bridge, analytics, archive and MCP. Duplicate-song work is split out as D5B.

## Corrections applied to the previous contract
- `room_code_available` is removed from the design entirely. Nothing may probe whether a code exists.
- Event creation becomes a DJ-only atomic RPC that generates and reserves the code server-side.
- Event lookup + participant creation collapse into a single atomic join boundary.
- Join is rate limited by both account and IP; because Postgres cannot see the real client IP reliably, the join boundary ships as an Edge Function wrapping a Postgres RPC.

---

## D5A-1 Secure creation boundary

```sql
create or replace function public.create_event(
  _name text, _venue text default null, _dj_name text default null,
  _allow_explicit boolean default true, _require_approval boolean default false,
  _cooldown_seconds integer default 0, _rules_text text default null
) returns table (id uuid, room_code text, name text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$ ... $$;
```

Rules: caller must be authenticated and hold `dj` role (`public.has_role(auth.uid(),'dj')`); `dj_id` forced to `auth.uid()`; code generated inside the function from `extensions.gen_random_bytes` over a 32-char unambiguous alphabet, 6 chars; insert retried on `unique_violation` up to 10 times; never selects or returns any other event's code; no dynamic SQL.

Grants: `revoke execute on function public.create_event(...) from public, anon; grant execute ... to authenticated;`

Frontend: `src/pages/DJDashboard.tsx` and `src/pages/Archive.tsx` drop `generateRoomCode` + `select("id").eq("room_code", ...)` probing and call the RPC. `src/lib/roomCode.ts` is deleted. Custom DJ-chosen codes are dropped from the create form (they leak collision information); if the product needs them, they go through the same RPC with a `_preferred_code` argument that returns a generic "couldn't use that code" result.

## D5A-2 Atomic join boundary

Postgres RPC:

```sql
create or replace function public.join_event_by_code(_code text, _nickname text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$ ... $$;
```

Behaviour, in order:
1. `auth.uid()` null -> `{"ok":false,"reason":"unavailable"}`.
2. Normalize: trim, strip whitespace, uppercase; reject anything outside `^[A-Z0-9]{5,10}$`.
3. Exact match on `public.events.room_code`; require `is_active` and `requests_status <> 'ended'`.
4. Reject if a row exists in `public.event_banned_guests` for (event, caller).
5. Upsert only the caller's `public.event_participants` row (`on conflict (event_id,user_id) do update set last_seen_at = now()`), so re-entry is idempotent and the existing join trigger cannot double-award points.
6. Return allowlist only: `{ok:true, event:{id, name, venue, dj_name, room_code, requests_status, allow_explicit, require_approval, cooldown_seconds, rules_text}}`. No `dj_id`, no internal timestamps.
7. Every failure path in 2-4 returns the identical `{"ok":false,"reason":"unavailable"}`.

Grants: revoke from public/anon, grant execute to `authenticated` and `service_role`.

Edge Function `join-event` (`verify_jwt = false`, validates the JWT in code):
- Reads bearer JWT, rejects missing/invalid.
- Rate limits before touching the event: per account 10 join attempts / 10 min, per IP (`x-forwarded-for` first hop) 30 / 10 min, recorded in the existing `public.rate_limit_logs` with `endpoint = 'join-event'`; counting uses service role. Over limit -> HTTP 429 with a generic message.
- Calls `join_event_by_code` with the caller's JWT so `auth.uid()` is the caller.
- Logs failed attempts (success flag) for brute-force visibility; never echoes whether the code exists.

Frontend: `src/pages/Join.tsx` replaces its `events` select + limit logic ordering with `supabase.functions.invoke("join-event")` after anonymous sign-in and `ensure_profile`. `src/pages/EventPage.tsx` replaces its direct `events` lookup by `room_code` with the same call (idempotent, so refresh/back works). Guest-join-limit gating stays client-side ahead of the call, unchanged.

Preserved flow: scan/enter code -> anonymous sign-in (if needed) -> `ensure_profile` -> `join-event` -> event page -> Realtime.

## D5A-3 Replacement RLS

Helper (avoids recursive policy evaluation — `SECURITY DEFINER`, so it does not re-enter the policies of the tables it reads):

```sql
create or replace function public.is_event_member(_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.event_participants p
                 where p.event_id = _event_id and p.user_id = auth.uid())
     and not exists (select 1 from public.event_banned_guests b
                 where b.event_id = _event_id and b.user_id = auth.uid());
$$;

create or replace function public.is_event_owner(_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e
                 where e.id = _event_id and e.dj_id = auth.uid());
$$;
```

Policies (drop the `USING (true)` public SELECT policies; keep existing write/moderation policies untouched):

```sql
-- events
create policy events_select_owner on public.events for select to authenticated
  using (dj_id = auth.uid());
create policy events_select_member on public.events for select to authenticated
  using (public.is_event_member(id));

-- song_requests
create policy song_requests_select_scoped on public.song_requests for select to authenticated
  using (public.is_event_owner(event_id) or public.is_event_member(event_id));

-- now_playing
create policy now_playing_select_scoped on public.now_playing for select to authenticated
  using (public.is_event_owner(event_id) or public.is_event_member(event_id));
```

Also `revoke select on public.events, public.song_requests, public.now_playing from anon;`

Role matrix: owner DJ — full read/moderate on own events; participant — read own joined event only; participant of another event — denied; non-owner DJ — denied (no DJ-wide read); banned guest — `is_event_member` false, so event, requests and now-playing all close immediately, and the join boundary refuses re-entry; after an event ends — participant membership persists, so guests keep read access to their history (their `points_transactions` and profile activity are unaffected either way), and the DJ keeps archive/analytics through owner access; service role and Bridge (`bridge-event-snapshot`, `now-playing-ingest`, tips/webhooks) bypass RLS unchanged.

Realtime: postgres_changes runs each row through RLS as the subscribing user. Owners and participants keep receiving `events`, `song_requests` and `now_playing` events; anonymous/unauthorized sockets simply receive nothing. No channel code changes needed in `EventPage.tsx`, `DJEventManage.tsx`, `useNowPlaying.ts`.

## D5A-4 MCP audit

Route: Edge Function `mcp` (`supabase/functions/mcp/index.ts`, generated from `src/lib/mcp/*`), OAuth issuer auth, calls Supabase with the caller's JWT under the publishable key — so it is subject to the same RLS as the app. Tools and tables: `list_my_events` (events, filtered `dj_id = user`), `list_event_requests` (song_requests), `get_now_playing` (now_playing), `list_recent_tips` (dj_tips, unchanged by D5). Required user type: DJ owner. Under the new policies all four continue to work for owners and additionally stop returning other DJs' events. It stays on caller-JWT access; no service-role switch. Tests: owner sees own events/requests/now-playing; a second DJ's `list_event_requests` on the first DJ's `event_id` returns empty; an anonymous guest token gets only their joined event.

## D5A-5 Tests

Anonymous REST: `GET /rest/v1/events|song_requests|now_playing` return zero rows. Guest: join by valid code works; invalid/inactive/ended/banned all return the identical denial; joined guest reads only their event's requests and now-playing; second event is invisible. Owner: create event via RPC (unique code under 50 concurrent calls), manage, moderate, archive, analytics, CSV export. Non-owner DJ blocked. Realtime: request insert, vote, now-playing update all propagate to a joined guest and to the owner. Bridge snapshot and ingest unchanged. Rate limits: 11th account attempt and 31st IP attempt in the window return 429. Regression: D1-D4 suites plus existing Vitest suite.

## D5A-6 Staged rollout and rollback

1. Migration A: add `create_event`, `join_event_by_code`, `is_event_member`, `is_event_owner` and grants. No policy changes — nothing breaks.
2. Deploy `join-event` Edge Function.
3. Publish frontend using the new interfaces.
4. Verify DJ creation and guest joining on production.
5. Migration B: drop the public SELECT policies, add the scoped policies, revoke `anon`.
6. Verify anonymous enumeration returns zero rows.
7. Verify participant, owner, Realtime, Bridge, archive, analytics and MCP paths.

Rollback is forward-only: if step 5 breaks a legitimate path, fix by widening the specific policy (for example adding an owner clause) — never by restoring `USING (true)`. Steps 1-4 are additive and safely revertible on their own.

## D5B (separate, later)

Before any index: fresh read-only measurement of conflicts on current rows. Then define — provider-ID matching (`source_platform` + `source_song_id`), null-ID fallback and its collision risk, which statuses count as active (`pending`, `approved`, `playing`), whether remixes/live versions are distinct, concurrent-request behaviour, and the UX for a duplicate (vote the existing request vs. a plain "already in the queue"). The current partial unique title/artist index is reviewed at that point. No index is created until compatibility is proven or a cleanup plan is separately approved.

## Open product decisions
- Do DJs keep the option to choose a custom room code?
- Should ended-event history remain readable to guests indefinitely, or expire?
- Exact rate-limit numbers for busy real-world venues (many guests behind one venue NAT could share an IP — the per-IP limit may need to be higher or venue-aware).
