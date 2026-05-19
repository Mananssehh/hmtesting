
-- Simplify points: every positive action = +1, boosts no longer deduct points

CREATE OR REPLACE FUNCTION public.on_song_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if new.requested_by is not null then
    perform public.award_points(new.requested_by, new.event_id, 1, 'earned', 'Song requested', new.id, null);
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.on_song_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if new.status = old.status then return new; end if;
  if new.requested_by is null then return new; end if;

  -- Only award on played (single +1). Approval/playing no longer grant points.
  if new.status = 'played' and old.status <> 'played' then
    perform public.award_points(new.requested_by, new.event_id, 1, 'earned', 'Track played', new.id, null);
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.on_event_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  perform public.award_points(new.user_id, new.event_id, 1, 'earned', 'Joined event', null, null);
  return new;
end;
$$;

-- Boosts no longer deduct user points (separate boost credits in future)
CREATE OR REPLACE FUNCTION public.boost_request(_song_request_id uuid, _amount integer)
RETURNS song_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  _user uuid := auth.uid();
  _req public.song_requests;
begin
  if _user is null then raise exception 'Not authenticated'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Invalid boost amount'; end if;

  select * into _req from public.song_requests where id = _song_request_id;
  if _req.id is null then raise exception 'Song not found'; end if;

  update public.song_requests
    set boost = boost + _amount
    where id = _song_request_id
    returning * into _req;

  -- Record boost event for history (zero-amount, doesn't affect balance)
  insert into public.points_transactions (user_id, event_id, song_request_id, amount, type, reason, created_by)
    values (_user, _req.event_id, _song_request_id, 0, 'spent', 'Boost (credits)', null);

  return _req;
end;
$$;
