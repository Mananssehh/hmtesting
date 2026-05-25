create or replace function public.get_global_leaderboard(
  _period text default 'all',
  _role_filter text default 'all',
  _limit int default 100
) returns table (
  user_id uuid,
  nickname text,
  is_dj boolean,
  points int,
  total_requests int,
  total_upvotes int,
  total_boosts int,
  events_joined int,
  top_song jsonb,
  global_score int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _since timestamptz;
begin
  _since := case _period
    when 'week' then now() - interval '7 days'
    when 'month' then now() - interval '30 days'
    else 'epoch'::timestamptz
  end;

  return query
  with sr as (
    select requested_by as uid,
      count(*)::int as requests,
      coalesce(sum(upvotes),0)::int as upvotes,
      coalesce(sum(boost),0)::int as boosts
    from public.song_requests
    where requested_by is not null
      and created_at >= _since
    group by requested_by
  ),
  ep as (
    select user_id as uid, count(distinct event_id)::int as events
    from public.event_participants
    where joined_at >= _since
    group by user_id
  ),
  pts as (
    select user_id as uid, coalesce(sum(amount),0)::int as pts
    from public.points_transactions
    where amount > 0 and created_at >= _since
    group by user_id
  ),
  topsong as (
    select distinct on (requested_by)
      requested_by as uid,
      jsonb_build_object('id', id, 'title', title, 'artist', artist, 'album_art', album_art) as top_song
    from public.song_requests
    where requested_by is not null
      and created_at >= _since
    order by requested_by, (upvotes - downvotes + boost) desc, created_at desc
  ),
  djs as (
    select user_id as uid from public.user_roles where role = 'dj'
  ),
  base as (
    select p.id as uid, p.nickname,
      exists(select 1 from djs d where d.uid = p.id) as is_dj_flag,
      coalesce(pts.pts, case when _period = 'all' then p.points else 0 end)::int as points_val,
      coalesce(sr.requests, 0)::int as req,
      coalesce(sr.upvotes, 0)::int as upv,
      coalesce(sr.boosts, 0)::int as bst,
      coalesce(ep.events, 0)::int as evs,
      topsong.top_song
    from public.profiles p
    left join sr on sr.uid = p.id
    left join ep on ep.uid = p.id
    left join pts on pts.uid = p.id
    left join topsong on topsong.uid = p.id
    where p.is_public = true
  )
  select
    b.uid,
    b.nickname,
    b.is_dj_flag,
    b.points_val,
    b.req,
    b.upv,
    b.bst,
    b.evs,
    b.top_song,
    (b.points_val + b.upv + b.bst * 2 + b.evs * 5)::int as score
  from base b
  where (_role_filter = 'all'
         or (_role_filter = 'dj' and b.is_dj_flag)
         or (_role_filter = 'guest' and not b.is_dj_flag))
    and (b.req > 0 or b.upv > 0 or b.bst > 0 or b.evs > 0 or b.points_val > 0)
  order by score desc, b.nickname asc
  limit _limit;
end;
$$;

grant execute on function public.get_global_leaderboard(text, text, int) to anon, authenticated;