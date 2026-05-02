-- Lifecycle
alter table public.events
  add column if not exists requests_status text not null default 'live'
    check (requests_status in ('live','paused','ended')),
  add column if not exists archived_at timestamptz;

-- When DJ ends the event, also flip is_active off (kept for backward compat)
create or replace function public.sync_event_active()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.requests_status = 'ended' then
    new.is_active := false;
  elsif old.requests_status = 'ended' and new.requests_status <> 'ended' then
    new.is_active := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_event_active on public.events;
create trigger trg_sync_event_active
  before update on public.events
  for each row execute function public.sync_event_active();

-- Anti-duplicate (case-insensitive) for active requests in same event
create unique index if not exists song_requests_unique_active
  on public.song_requests (event_id, lower(title), lower(artist))
  where status <> 'removed';

-- Rate-limit helper (used client-side as a soft check; RLS still applies)
create or replace function public.recent_request_count(_event_id uuid, _seconds integer default 30)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.song_requests
  where event_id = _event_id
    and requested_by = auth.uid()
    and created_at > now() - make_interval(secs => _seconds)
$$;

-- Tighten INSERT policy: block when requests aren't live
drop policy if exists "Authenticated users can create song requests" on public.song_requests;
create policy "Authenticated users can create song requests"
on public.song_requests for insert
with check (
  auth.uid() is not null
  and auth.uid() = requested_by
  and exists (
    select 1 from public.events e
    where e.id = song_requests.event_id
      and e.requests_status = 'live'
  )
);

-- Allow DJs to update their event lifecycle is already covered by existing UPDATE policy.
