-- D3 (narrow correction): owner profile writes require SELECT privilege when done
-- directly against the table (UPDATE ... WHERE reads columns). Client roles must
-- never hold SELECT on public.profiles, so owner writes go through a definer RPC.
CREATE OR REPLACE FUNCTION public.update_my_profile(_nickname text DEFAULT NULL, _is_public boolean DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid  uuid := auth.uid();
  _nick text;
  _p    public.profiles;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  _nick := nullif(btrim(coalesce(_nickname, '')), '');
  IF _nick IS NOT NULL AND (length(_nick) < 2 OR length(_nick) > 24) THEN
    RAISE EXCEPTION 'nickname_length' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles p
     SET nickname   = coalesce(_nick, p.nickname),
         is_public  = coalesce(_is_public, p.is_public),
         updated_at = now()
   WHERE p.id = _uid
   RETURNING * INTO _p;

  IF _p.id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
  END IF;

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

REVOKE ALL ON FUNCTION public.update_my_profile(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_profile(text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, boolean) TO authenticated;