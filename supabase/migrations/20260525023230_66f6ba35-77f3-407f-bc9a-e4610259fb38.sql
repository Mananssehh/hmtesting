
-- Index to speed up profile-based scans
CREATE INDEX IF NOT EXISTS idx_profiles_is_public ON public.profiles(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_points_tx_user_created ON public.points_transactions(user_id, created_at) WHERE amount > 0;
CREATE INDEX IF NOT EXISTS idx_song_requests_requested_by_created ON public.song_requests(requested_by, created_at) WHERE requested_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_participants_user_joined ON public.event_participants(user_id, joined_at);

CREATE OR REPLACE FUNCTION public.get_user_global_rank(_user_id uuid, _period text DEFAULT 'all', _role_filter text DEFAULT 'all')
RETURNS TABLE(user_id uuid, nickname text, is_dj boolean, global_score integer, rank integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      coalesce(sum(sr1.upvotes),0)::int as upvotes,
      coalesce(sum(sr1.boost),0)::int as boosts
    from public.song_requests sr1
    where sr1.requested_by is not null and sr1.created_at >= _since
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
  djs as (
    select ur.user_id as uid from public.user_roles ur where ur.role = 'dj'
  ),
  base as (
    select p.id as uid, p.nickname,
      exists(select 1 from djs d where d.uid = p.id) as is_dj_flag,
      coalesce(pts.pts, case when _period = 'all' then p.points else 0 end)::int as points_val,
      coalesce(sr.upvotes, 0)::int as upv,
      coalesce(sr.boosts, 0)::int as bst,
      coalesce(ep.events, 0)::int as evs
    from public.profiles p
    left join sr on sr.uid = p.id
    left join ep on ep.uid = p.id
    left join pts on pts.uid = p.id
    where p.is_public = true
  ),
  scored as (
    select b.uid, b.nickname, b.is_dj_flag,
      (b.points_val + b.upv + b.bst * 2 + b.evs * 5)::int as score
    from base b
    where (_role_filter = 'all'
           or (_role_filter = 'dj' and b.is_dj_flag)
           or (_role_filter = 'guest' and not b.is_dj_flag))
  ),
  ranked as (
    select s.uid, s.nickname, s.is_dj_flag, s.score,
      (rank() over (order by s.score desc))::int as rnk
    from scored s
  )
  select r.uid, r.nickname, r.is_dj_flag, r.score, r.rnk
  from ranked r
  where r.uid = _user_id;
end;
$$;
