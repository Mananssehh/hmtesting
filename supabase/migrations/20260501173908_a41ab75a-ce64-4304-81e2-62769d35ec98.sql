
-- ============================================================
-- Phase 2: Points/Rewards, Boost, Leaderboard infrastructure
-- ============================================================

-- 1. Transaction type enum
do $$ begin
  create type public.point_tx_type as enum ('earned', 'spent', 'manual_adjustment');
exception when duplicate_object then null; end $$;

-- 2. points_transactions table
create table if not exists public.points_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_id uuid references public.events(id) on delete set null,
  song_request_id uuid references public.song_requests(id) on delete set null,
  amount integer not null,
  type public.point_tx_type not null,
  reason text not null default '',
  created_by uuid,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_pt_user on public.points_transactions(user_id, created_at desc);
create index if not exists idx_pt_event on public.points_transactions(event_id, created_at desc);

alter table public.points_transactions enable row level security;

drop policy if exists "Users view their own transactions" on public.points_transactions;
create policy "Users view their own transactions"
  on public.points_transactions for select
  using (auth.uid() = user_id);

drop policy if exists "DJ views transactions for their event" on public.points_transactions;
create policy "DJ views transactions for their event"
  on public.points_transactions for select
  using (
    event_id is not null
    and exists (select 1 from public.events e where e.id = event_id and e.dj_id = auth.uid())
  );
-- inserts/updates only via SECURITY DEFINER functions; no direct write policy needed

-- 3. event_participants table (track who joined for "join" reward)
create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null,
  nickname text not null default 'Guest',
  joined_at timestamp with time zone not null default now(),
  unique (event_id, user_id)
);

create index if not exists idx_ep_event on public.event_participants(event_id);

alter table public.event_participants enable row level security;

drop policy if exists "Anyone can view participants" on public.event_participants;
create policy "Anyone can view participants"
  on public.event_participants for select using (true);

drop policy if exists "Users insert their own participation" on public.event_participants;
create policy "Users insert their own participation"
  on public.event_participants for insert
  with check (auth.uid() = user_id);

-- 4. Core award function (SECURITY DEFINER, atomic)
create or replace function public.award_points(
  _user_id uuid,
  _event_id uuid,
  _amount integer,
  _type public.point_tx_type,
  _reason text default '',
  _song_request_id uuid default null,
  _created_by uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _amount = 0 then return; end if;
  update public.profiles
    set points = greatest(0, points + _amount),
        updated_at = now()
    where id = _user_id;
  insert into public.points_transactions (user_id, event_id, song_request_id, amount, type, reason, created_by)
    values (_user_id, _event_id, _song_request_id, _amount, _type, coalesce(_reason, ''), _created_by);
end;
$$;

-- 5. Boost RPC: spends points, increments boost, logs transaction
create or replace function public.boost_request(
  _song_request_id uuid,
  _amount integer
) returns public.song_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  _user uuid := auth.uid();
  _balance integer;
  _req public.song_requests;
begin
  if _user is null then raise exception 'Not authenticated'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Invalid boost amount'; end if;

  select points into _balance from public.profiles where id = _user;
  if _balance is null then raise exception 'Profile missing'; end if;
  if _balance < _amount then raise exception 'Insufficient points'; end if;

  select * into _req from public.song_requests where id = _song_request_id;
  if _req.id is null then raise exception 'Song not found'; end if;

  update public.profiles set points = points - _amount, updated_at = now() where id = _user;

  update public.song_requests
    set boost = boost + _amount
    where id = _song_request_id
    returning * into _req;

  insert into public.points_transactions (user_id, event_id, song_request_id, amount, type, reason)
    values (_user, _req.event_id, _song_request_id, -_amount, 'spent', 'Boost', null);

  return _req;
end;
$$;

-- 6. DJ manual award RPC: awards points to a guest, with permission check
create or replace function public.dj_award_points(
  _event_id uuid,
  _user_id uuid,
  _amount integer,
  _reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _dj uuid := auth.uid();
  _is_owner boolean;
begin
  if _dj is null then raise exception 'Not authenticated'; end if;
  select exists (select 1 from public.events where id = _event_id and dj_id = _dj) into _is_owner;
  if not _is_owner then raise exception 'Not the DJ for this event'; end if;
  if _amount is null or _amount = 0 then raise exception 'Amount required'; end if;

  perform public.award_points(_user_id, _event_id, _amount, 'manual_adjustment', coalesce(_reason, 'DJ adjustment'), null, _dj);
end;
$$;

-- 7. Trigger: award points when a song request is created (+5)
create or replace function public.on_song_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.requested_by is not null then
    perform public.award_points(new.requested_by, new.event_id, 5, 'earned', 'Song requested', new.id, null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_song_request_insert on public.song_requests;
create trigger trg_song_request_insert
  after insert on public.song_requests
  for each row execute function public.on_song_request_insert();

-- 8. Trigger: award points when status changes to approved/playing/played
create or replace function public.on_song_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _delta integer := 0;
  _reason text := '';
begin
  if new.status = old.status then return new; end if;
  if new.requested_by is null then return new; end if;

  if new.status = 'approved' and old.status <> 'approved' then
    _delta := 3; _reason := 'Request approved';
  elsif new.status = 'playing' and old.status <> 'playing' then
    _delta := 5; _reason := 'Now playing';
  elsif new.status = 'played' and old.status <> 'played' then
    _delta := 2; _reason := 'Played';
  end if;

  if _delta <> 0 then
    perform public.award_points(new.requested_by, new.event_id, _delta, 'earned', _reason, new.id, null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_song_request_status on public.song_requests;
create trigger trg_song_request_status
  after update of status on public.song_requests
  for each row execute function public.on_song_request_status_change();

-- 9. Trigger: award/refund points on votes received (+1 per net upvote)
create or replace function public.on_vote_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _req public.song_requests;
  _delta integer := 0;
  _row record;
begin
  _row := coalesce(new, old);
  select * into _req from public.song_requests where id = _row.song_request_id;
  if _req.id is null or _req.requested_by is null then return null; end if;
  -- Don't reward self-votes (auto-upvote on own request)
  if _req.requested_by = _row.user_id then return null; end if;

  if tg_op = 'INSERT' then
    _delta := case when new.value = 1 then 1 else 0 end;
  elsif tg_op = 'DELETE' then
    _delta := case when old.value = 1 then -1 else 0 end;
  elsif tg_op = 'UPDATE' then
    _delta := case
      when old.value <> 1 and new.value = 1 then 1
      when old.value = 1 and new.value <> 1 then -1
      else 0 end;
  end if;

  if _delta <> 0 then
    perform public.award_points(_req.requested_by, _req.event_id, _delta,
      case when _delta > 0 then 'earned' else 'spent' end,
      'Upvote received', _req.id, null);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_vote_change_points on public.votes;
create trigger trg_vote_change_points
  after insert or update or delete on public.votes
  for each row execute function public.on_vote_change();

-- 10. Trigger: award join bonus (+2) on first participation
create or replace function public.on_event_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_points(new.user_id, new.event_id, 2, 'earned', 'Joined event', null, null);
  return new;
end;
$$;

drop trigger if exists trg_event_join on public.event_participants;
create trigger trg_event_join
  after insert on public.event_participants
  for each row execute function public.on_event_join();

-- 11. Allow users to update their own profile nickname (already covered by existing UPDATE policy: auth.uid() = id)

-- 12. Give existing users a starter balance so they can boost (one-time top-up if zero)
update public.profiles set points = 50 where points = 0;
