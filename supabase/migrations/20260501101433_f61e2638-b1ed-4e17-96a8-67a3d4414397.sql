-- Enable anonymous sign-ins via auth config later; here we set up schema.

-- ROLES
create type public.app_role as enum ('dj', 'guest');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null default 'guest',
  created_at timestamptz not null default now(),
  unique(user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users can view their own roles"
  on public.user_roles for select
  using (auth.uid() = user_id);

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Guest',
  points integer not null default 0,
  is_premium boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile + default guest role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', 'Guest'));
  insert into public.user_roles (user_id, role) values (new.id, 'guest');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- EVENTS
create table public.events (
  id uuid primary key default gen_random_uuid(),
  dj_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  venue text,
  dj_name text not null,
  room_code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "Anyone can view events"
  on public.events for select using (true);

create policy "DJs can create events"
  on public.events for insert with check (auth.uid() = dj_id);

create policy "DJs manage their own events"
  on public.events for update using (auth.uid() = dj_id);

create policy "DJs delete their own events"
  on public.events for delete using (auth.uid() = dj_id);

-- SONG REQUESTS
create type public.request_status as enum ('pending','approved','playing','played','skipped','removed');

create table public.song_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  requester_name text not null default 'Guest',
  title text not null,
  artist text not null,
  album_art text,
  external_url text,
  status request_status not null default 'pending',
  boost integer not null default 0,
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.song_requests enable row level security;

create policy "Anyone can view song requests"
  on public.song_requests for select using (true);

create policy "Authenticated users can create song requests"
  on public.song_requests for insert with check (auth.uid() is not null and auth.uid() = requested_by);

create policy "DJ owners can update song requests"
  on public.song_requests for update
  using (exists (select 1 from public.events e where e.id = song_requests.event_id and e.dj_id = auth.uid()));

create policy "DJ owners can delete song requests"
  on public.song_requests for delete
  using (exists (select 1 from public.events e where e.id = song_requests.event_id and e.dj_id = auth.uid()));

-- VOTES
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  song_request_id uuid not null references public.song_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  unique(song_request_id, user_id)
);

alter table public.votes enable row level security;

create policy "Anyone can view votes"
  on public.votes for select using (true);

create policy "Authenticated users can vote"
  on public.votes for insert with check (auth.uid() = user_id);

create policy "Users can change their own vote"
  on public.votes for update using (auth.uid() = user_id);

create policy "Users can remove their own vote"
  on public.votes for delete using (auth.uid() = user_id);

-- Trigger to keep upvotes/downvotes counters synced
create or replace function public.sync_vote_counts()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.song_request_id, old.song_request_id);
  update public.song_requests sr
  set
    upvotes = (select count(*) from public.votes v where v.song_request_id = target_id and v.value = 1),
    downvotes = (select count(*) from public.votes v where v.song_request_id = target_id and v.value = -1)
  where sr.id = target_id;
  return null;
end;
$$;

create trigger votes_sync_after
  after insert or update or delete on public.votes
  for each row execute function public.sync_vote_counts();

-- Realtime
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.song_requests;
alter publication supabase_realtime add table public.votes;