
-- Lock down internal helpers from anon/authenticated callers
revoke all on function public.award_points(uuid, uuid, integer, public.point_tx_type, text, uuid, uuid) from public, anon, authenticated;

-- DJ award & boost: only authenticated callers
revoke all on function public.dj_award_points(uuid, uuid, integer, text) from public, anon;
grant execute on function public.dj_award_points(uuid, uuid, integer, text) to authenticated;

revoke all on function public.boost_request(uuid, integer) from public, anon;
grant execute on function public.boost_request(uuid, integer) to authenticated;
