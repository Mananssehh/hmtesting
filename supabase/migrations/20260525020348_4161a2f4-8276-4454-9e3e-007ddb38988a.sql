CREATE OR REPLACE FUNCTION public.get_global_leaderboard(_period text DEFAULT 'all'::text, _role_filter text DEFAULT 'all'::text, _limit integer DEFAULT 100)
 RETURNS TABLE(user_id uuid, nickname text, is_dj boolean, points integer, total_requests integer, total_upvotes integer, total_boosts integer, events_joined integer, top_song jsonb, global_score integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select sr1.requested_by as uid,
      count(*)::int as requests,
      coalesce(sum(sr1.upvotes),0)::int as upvotes,
      coalesce(sum(sr1.boost),0)::int as boosts
    from public.song_requests sr1
    where sr1.requested_by is not null
      and sr1.created_at >= _since
    group by sr1.requested_by
  ),
  ep as (
    select ep1.user_id as uid, count(distinct ep1.event_id)::int as events
    from public.event_participants ep1
    where ep1.joined_at >= _since
    group by ep1.user_id
  ),
  pts as (
    select pt.user_id as uid, coalesce(sum(pt.amount),0)::int as pts
    from public.points_transactions pt
    where pt.amount > 0 and pt.created_at >= _since
    group by pt.user_id
  ),
  topsong as (
    select distinct on (sr2.requested_by)
      sr2.requested_by as uid,
      jsonb_build_object('id', sr2.id, 'title', sr2.title, 'artist', sr2.artist, 'album_art', sr2.album_art) as top_song
    from public.song_requests sr2
    where sr2.requested_by is not null
      and sr2.created_at >= _since
    order by sr2.requested_by, (sr2.upvotes - sr2.downvotes + sr2.boost) desc, sr2.created_at desc
  ),
  djs as (
    select ur.user_id as uid from public.user_roles ur where ur.role = 'dj'
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
$function$;