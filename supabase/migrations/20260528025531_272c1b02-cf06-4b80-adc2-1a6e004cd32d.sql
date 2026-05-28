
-- 1) Drop global leaderboard functions (no longer used in MVP)
DROP FUNCTION IF EXISTS public.get_global_leaderboard(text, text, integer);
DROP FUNCTION IF EXISTS public.get_user_global_rank(uuid, text, text);

-- 2) Make boost_request actually deduct points atomically
CREATE OR REPLACE FUNCTION public.boost_request(_song_request_id uuid, _amount integer)
RETURNS public.song_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _user uuid := auth.uid();
  _req public.song_requests;
  _balance int;
begin
  if _user is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Invalid boost amount' using errcode = '22023'; end if;
  if _amount > 10000 then raise exception 'Boost too large' using errcode = '22023'; end if;

  select * into _req from public.song_requests where id = _song_request_id for update;
  if _req.id is null then raise exception 'Request not found' using errcode = 'P0002'; end if;

  if _req.status in ('played'::request_status, 'skipped'::request_status, 'removed'::request_status) then
    raise exception 'Cannot boost this request' using errcode = '22023';
  end if;

  -- Lock + check balance
  select points into _balance from public.profiles where id = _user for update;
  if _balance is null or _balance < _amount then
    raise exception 'Insufficient points' using errcode = 'P0001';
  end if;

  -- Deduct points (records a points_transactions row)
  perform public.award_points(
    _user, _req.event_id, -_amount,
    'spent'::public.point_tx_type,
    'Boost (credits)', _song_request_id, null
  );

  -- Increase boost
  update public.song_requests
    set boost = boost + _amount
    where id = _song_request_id
    returning * into _req;

  return _req;
end;
$function$;

-- 3) Refund boost spend when guest removes their own pending request
CREATE OR REPLACE FUNCTION public.remove_my_song_request(_song_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _req public.song_requests;
  _earned int := 0;
  _spent int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _req FROM public.song_requests WHERE id = _song_request_id FOR UPDATE;
  IF _req.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF _req.requested_by IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'You can only remove your own requests';
  END IF;

  IF _req.status <> 'pending'::request_status THEN
    RAISE EXCEPTION 'This request can''t be removed anymore';
  END IF;

  -- Refund positive earnings tied to this request
  SELECT COALESCE(SUM(pt.amount), 0) INTO _earned
  FROM public.points_transactions pt
  WHERE pt.song_request_id = _song_request_id
    AND pt.user_id = _uid
    AND pt.amount > 0;

  IF _earned > 0 THEN
    PERFORM public.award_points(
      _uid, _req.event_id, -_earned,
      'refunded'::public.point_tx_type,
      'Request removed by user',
      _song_request_id, _uid
    );
  END IF;

  -- Refund boost spend (negative transactions tied to this request)
  SELECT COALESCE(-SUM(pt.amount), 0) INTO _spent
  FROM public.points_transactions pt
  WHERE pt.song_request_id = _song_request_id
    AND pt.user_id = _uid
    AND pt.amount < 0
    AND pt.type = 'spent';

  IF _spent > 0 THEN
    PERFORM public.award_points(
      _uid, _req.event_id, _spent,
      'refunded'::public.point_tx_type,
      'Boost refunded (request removed)',
      _song_request_id, _uid
    );
  END IF;

  -- Soft-delete: keep row so cooldown still applies
  UPDATE public.song_requests
    SET status = 'removed'::request_status
    WHERE id = _song_request_id;
END;
$function$;
