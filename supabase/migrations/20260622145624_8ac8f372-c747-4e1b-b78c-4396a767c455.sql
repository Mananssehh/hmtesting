-- Robust profile upsert for the calling user. Used by the guest join flow to
-- guarantee a profile row exists (handle_new_user occasionally leaves it
-- missing for anonymous sign-ins) and to apply the nickname the guest typed.
CREATE OR REPLACE FUNCTION public.ensure_profile(p_nickname text)
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
  IF _nick IS NULL THEN
    RAISE EXCEPTION 'nickname_required';
  END IF;
  IF length(_nick) < 2 OR length(_nick) > 24 THEN
    RAISE EXCEPTION 'nickname_length';
  END IF;

  -- Bypass the protect_profile_sensitive_columns guard so the nickname
  -- update lands even when called outside the usual client path.
  PERFORM set_config('app.bypass_profile_guard', 'on', true);

  INSERT INTO public.profiles (id, nickname, points)
  VALUES (_uid, _nick, 15)
  ON CONFLICT (id) DO UPDATE
    SET nickname   = EXCLUDED.nickname,
        updated_at = now()
  RETURNING * INTO _p;

  PERFORM set_config('app.bypass_profile_guard', 'off', true);

  -- Make sure the guest role exists too (handle_new_user normally does this,
  -- but we guard against the same trigger gap).
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

REVOKE ALL ON FUNCTION public.ensure_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_profile(text) TO authenticated;

-- Backfill: any auth user that somehow has no profile row gets one now so
-- existing affected guests stop showing as "Guest" on revisit.
INSERT INTO public.profiles (id, nickname, points)
SELECT u.id, 'Guest', 15
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
