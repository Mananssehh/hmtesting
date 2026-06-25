
CREATE OR REPLACE FUNCTION public.upgrade_anonymous_profile(p_nickname text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid  uuid := auth.uid();
  _nick text;
  _p    public.profiles;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  _nick := nullif(btrim(coalesce(p_nickname, '')), '');
  IF _nick IS NOT NULL THEN
    IF length(_nick) < 2 OR length(_nick) > 24 THEN
      RAISE EXCEPTION 'nickname_length';
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);

  IF _nick IS NOT NULL THEN
    INSERT INTO public.profiles (id, nickname, points)
    VALUES (_uid, _nick, 15)
    ON CONFLICT (id) DO UPDATE
      SET nickname   = EXCLUDED.nickname,
          updated_at = now()
    RETURNING * INTO _p;
  ELSE
    INSERT INTO public.profiles (id, nickname, points)
    VALUES (_uid, 'Guest', 15)
    ON CONFLICT (id) DO UPDATE
      SET updated_at = now()
    RETURNING * INTO _p;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'off', true);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'guest')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object(
    'id', _p.id,
    'nickname', _p.nickname,
    'points', _p.points,
    'is_premium', _p.is_premium,
    'is_public', _p.is_public,
    'created_at', _p.created_at,
    'updated_at', _p.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upgrade_anonymous_profile(text) TO authenticated;
