
-- 1. Event moderation settings
alter table public.events
  add column if not exists allow_explicit boolean not null default true,
  add column if not exists require_approval boolean not null default false,
  add column if not exists cooldown_seconds integer not null default 30,
  add column if not exists rules_text text;

-- 2. Blocklist table
create table if not exists public.event_blocklist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('artist','song','keyword')),
  value text not null,
  created_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists idx_event_blocklist_event on public.event_blocklist(event_id);
create index if not exists idx_event_blocklist_value on public.event_blocklist(lower(value));

alter table public.event_blocklist enable row level security;

drop policy if exists "Anyone can view blocklist" on public.event_blocklist;
create policy "Anyone can view blocklist" on public.event_blocklist for select using (true);

drop policy if exists "DJ manages blocklist insert" on public.event_blocklist;
create policy "DJ manages blocklist insert" on public.event_blocklist for insert
  with check (exists (select 1 from public.events e where e.id = event_id and e.dj_id = auth.uid()));

drop policy if exists "DJ manages blocklist delete" on public.event_blocklist;
create policy "DJ manages blocklist delete" on public.event_blocklist for delete
  using (exists (select 1 from public.events e where e.id = event_id and e.dj_id = auth.uid()));

-- 3. Banned guests table
create table if not exists public.event_banned_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists idx_event_banned_event on public.event_banned_guests(event_id);

alter table public.event_banned_guests enable row level security;

drop policy if exists "DJ views bans" on public.event_banned_guests;
create policy "DJ views bans" on public.event_banned_guests for select
  using (exists (select 1 from public.events e where e.id = event_id and e.dj_id = auth.uid())
         or auth.uid() = user_id);

drop policy if exists "DJ inserts bans" on public.event_banned_guests;
create policy "DJ inserts bans" on public.event_banned_guests for insert
  with check (exists (select 1 from public.events e where e.id = event_id and e.dj_id = auth.uid()));

drop policy if exists "DJ deletes bans" on public.event_banned_guests;
create policy "DJ deletes bans" on public.event_banned_guests for delete
  using (exists (select 1 from public.events e where e.id = event_id and e.dj_id = auth.uid()));

-- 4. Tighten song_requests insert policy to honor moderation
drop policy if exists "Authenticated users can create song requests" on public.song_requests;
create policy "Authenticated users can create song requests" on public.song_requests
  for insert
  with check (
    auth.uid() is not null
    and auth.uid() = requested_by
    and exists (
      select 1 from public.events e
      where e.id = event_id
        and e.requests_status = 'live'
        and (e.allow_explicit or coalesce(song_requests.explicit, false) = false)
    )
    and not exists (
      select 1 from public.event_banned_guests b
      where b.event_id = song_requests.event_id and b.user_id = auth.uid()
    )
    and not exists (
      select 1 from public.event_blocklist bl
      where bl.event_id = song_requests.event_id
        and (
          (bl.kind = 'artist'  and lower(bl.value) = lower(song_requests.artist)) or
          (bl.kind = 'song'    and lower(bl.value) = lower(song_requests.title)) or
          (bl.kind = 'keyword' and (
              lower(song_requests.title)  like '%' || lower(bl.value) || '%' or
              lower(song_requests.artist) like '%' || lower(bl.value) || '%'))
        )
    )
  );
