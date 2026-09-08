-- Helper: is the caller the owner of this event?
CREATE OR REPLACE FUNCTION public.is_event_owner(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id AND e.dj_id = auth.uid()
  );
$$;

-- Helper: is the caller a non-banned participant of this event?
CREATE OR REPLACE FUNCTION public.is_event_member(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_participants p
    WHERE p.event_id = _event_id AND p.user_id = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.event_banned_guests b
    WHERE b.event_id = _event_id AND b.user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_event_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_event_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_event_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_event_member(uuid) TO authenticated, service_role;

-- Atomic, DJ-only event creation with server-side room code reservation
CREATE OR REPLACE FUNCTION public.create_event(
  _name text,
  _venue text DEFAULT NULL,
  _dj_name text DEFAULT NULL,
  _allow_explicit boolean DEFAULT true,
  _require_approval boolean DEFAULT false,
  _cooldown_seconds integer DEFAULT 0,
  _rules_text text DEFAULT NULL
)
RETURNS TABLE (id uuid, room_code text, name text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _code text;
  _bytes bytea;
  _i int;
  _attempt int := 0;
  _row public.events;
  _clean_name text;
  _clean_dj text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(_uid, 'dj'::public.app_role) THEN
    RAISE EXCEPTION 'not_a_dj' USING ERRCODE = '42501';
  END IF;

  _clean_name := nullif(btrim(coalesce(_name, '')), '');
  IF _clean_name IS NULL OR length(_clean_name) > 80 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  _clean_dj := nullif(btrim(coalesce(_dj_name, '')), '');
  IF _clean_dj IS NULL THEN
    SELECT p.nickname INTO _clean_dj FROM public.profiles p WHERE p.id = _uid;
    _clean_dj := coalesce(nullif(btrim(coalesce(_clean_dj, '')), ''), 'DJ');
  END IF;
  IF length(_clean_dj) > 60 THEN
    RAISE EXCEPTION 'invalid_dj_name' USING ERRCODE = '22023';
  END IF;

  IF _cooldown_seconds IS NULL OR _cooldown_seconds < 0 OR _cooldown_seconds > 3600 THEN
    RAISE EXCEPTION 'invalid_cooldown' USING ERRCODE = '22023';
  END IF;

  LOOP
    _attempt := _attempt + 1;
    _bytes := extensions.gen_random_bytes(6);
    _code := '';
    FOR _i IN 0..5 LOOP
      _code := _code || substr(_alphabet, (get_byte(_bytes, _i) % 32) + 1, 1);
    END LOOP;

    BEGIN
      INSERT INTO public.events (
        dj_id, name, venue, dj_name, room_code, is_active,
        allow_explicit, require_approval, cooldown_seconds, rules_text
      )
      VALUES (
        _uid, _clean_name, nullif(btrim(coalesce(_venue, '')), ''), _clean_dj, _code, true,
        coalesce(_allow_explicit, true), coalesce(_require_approval, false),
        _cooldown_seconds, nullif(btrim(coalesce(_rules_text, '')), '')
      )
      RETURNING * INTO _row;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF _attempt >= 10 THEN
        RAISE EXCEPTION 'could_not_allocate_room_code' USING ERRCODE = '55000';
      END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT _row.id, _row.room_code, _row.name, _row.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_event(text, text, text, boolean, boolean, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_event(text, text, text, boolean, boolean, integer, text) TO authenticated;

-- Atomic join boundary: validate code, event state, ban status, and create/reuse membership
CREATE OR REPLACE FUNCTION public.join_event_by_code(_code text, _nickname text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _norm text;
  _ev public.events;
  _nick text;
  _denied constant jsonb := jsonb_build_object('ok', false, 'reason', 'unavailable');
BEGIN
  IF _uid IS NULL THEN
    RETURN _denied;
  END IF;

  _norm := upper(regexp_replace(coalesce(_code, ''), '\s+', '', 'g'));
  IF _norm !~ '^[A-Z0-9]{5,10}$' THEN
    RETURN _denied;
  END IF;

  SELECT * INTO _ev FROM public.events e WHERE e.room_code = _norm;
  IF _ev.id IS NULL OR _ev.is_active IS NOT TRUE OR _ev.requests_status = 'ended' THEN
    RETURN _denied;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_banned_guests b
    WHERE b.event_id = _ev.id AND b.user_id = _uid
  ) THEN
    RETURN _denied;
  END IF;

  _nick := nullif(btrim(coalesce(_nickname, '')), '');
  IF _nick IS NULL THEN
    SELECT p.nickname INTO _nick FROM public.profiles p WHERE p.id = _uid;
  END IF;
  _nick := coalesce(nullif(btrim(coalesce(_nick, '')), ''), 'Guest');
  IF length(_nick) > 24 THEN
    _nick := substr(_nick, 1, 24);
  END IF;

  INSERT INTO public.event_participants (event_id, user_id, nickname)
  VALUES (_ev.id, _uid, _nick)
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET last_seen_at = now(), nickname = EXCLUDED.nickname;

  RETURN jsonb_build_object(
    'ok', true,
    'event', jsonb_build_object(
      'id', _ev.id,
      'name', _ev.name,
      'venue', _ev.venue,
      'dj_name', _ev.dj_name,
      'room_code', _ev.room_code,
      'requests_status', _ev.requests_status,
      'allow_explicit', _ev.allow_explicit,
      'require_approval', _ev.require_approval,
      'cooldown_seconds', _ev.cooldown_seconds,
      'rules_text', _ev.rules_text
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_event_by_code(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_event_by_code(text, text) TO authenticated, service_role;