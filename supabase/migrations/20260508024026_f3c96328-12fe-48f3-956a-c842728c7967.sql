create table if not exists public.now_playing (
  id uuid primary key default gen_random_uuid(),
  event_id uuid unique not null references public.events(id) on delete cascade,
  title text not null,
  artist text,
  album_art text,
  source text default 'manual',
  status text not null default 'playing',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.now_playing enable row level security;

create policy "Anyone can view now playing"
  on public.now_playing for select
  using (true);

create policy "DJ can insert now playing"
  on public.now_playing for insert
  with check (exists (select 1 from public.events e where e.id = now_playing.event_id and e.dj_id = auth.uid()));

create policy "DJ can update now playing"
  on public.now_playing for update
  using (exists (select 1 from public.events e where e.id = now_playing.event_id and e.dj_id = auth.uid()));

create policy "DJ can delete now playing"
  on public.now_playing for delete
  using (exists (select 1 from public.events e where e.id = now_playing.event_id and e.dj_id = auth.uid()));

alter publication supabase_realtime add table public.now_playing;
alter table public.now_playing replica identity full;