CREATE OR REPLACE FUNCTION public.boost_request(_song_request_id uuid, _amount integer)
 RETURNS song_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  insert into public.points_transactions (user_id, event_id, song_request_id, amount, type, reason, created_by)
    values (_user, _req.event_id, _song_request_id, -_amount, 'spent', 'Boost', null);

  return _req;
end;
$function$;