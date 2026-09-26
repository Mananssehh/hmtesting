-- DECKS join boundary — Migration A: add service_role-only trusted join function.
-- STAGED ONLY. Not in supabase/migrations/. Apply only after approval AND M0
-- migration-channel selection. Nothing existing changes: the old
-- public.join_event_by_code(text,text) keeps its body and ACL.
-- Baseline: old function OID 22819, md5(prosrc) 586bc3dd220d6d2babf0678618be653b.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.join_event_by_code_trusted(
  _user_id  uuid,
  _code     text,
  _nickname text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid    uuid := _user_id;
  _norm   text;
  _ev     public.events;
  _nick   text;
  _denied constant jsonb := jsonb_build_object('ok', false, 'reason', 'unavailable');
BEGIN
  IF _uid IS NULL THEN
    RETURN _denied;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _uid) THEN
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

REVOKE ALL ON FUNCTION public.join_event_by_code_trusted(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_event_by_code_trusted(uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
