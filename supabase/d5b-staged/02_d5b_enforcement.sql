-- D5B Stage A - Migration 2: final enforcement cutover.
-- STAGED ONLY. Applied in Stage A to the disposable local fixture only.
-- Apply in production only after Migration 1 is live and the frontend using
-- public.request_song has been published and verified.

set local lock_timeout = '5s';

-- 1. Retire the title/artist-based duplicate rule.
drop index if exists public.song_requests_unique_active;

-- 2. Close the direct client insert path; request creation goes through the RPC.
revoke insert on public.song_requests from anon;
revoke insert on public.song_requests from authenticated;
drop policy if exists "Authenticated users can create song requests" on public.song_requests;

-- 3. Vote writes must be the caller's own row AND inside an event the caller
--    owns or is a valid (non-banned) participant of.
drop policy if exists "Authenticated users can vote" on public.votes;
drop policy if exists "Users can change their own vote" on public.votes;
drop policy if exists "Users can remove their own vote" on public.votes;

create policy "votes_insert_scoped" on public.votes
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.song_requests sr
      where sr.id = votes.song_request_id
        and (public.is_event_owner(sr.event_id) or public.is_event_member(sr.event_id))
    )
  );

create policy "votes_update_scoped" on public.votes
  for update to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.song_requests sr
      where sr.id = votes.song_request_id
        and (public.is_event_owner(sr.event_id) or public.is_event_member(sr.event_id))
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.song_requests sr
      where sr.id = votes.song_request_id
        and (public.is_event_owner(sr.event_id) or public.is_event_member(sr.event_id))
    )
  );

create policy "votes_delete_scoped" on public.votes
  for delete to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.song_requests sr
      where sr.id = votes.song_request_id
        and (public.is_event_owner(sr.event_id) or public.is_event_member(sr.event_id))
    )
  );

-- Vote SELECT policies, the unique (song_request_id, user_id) constraint,
-- DJ moderation policies, service-role access and all D5A SELECT policies are
-- intentionally left unchanged.
