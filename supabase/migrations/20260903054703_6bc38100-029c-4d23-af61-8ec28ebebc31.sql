-- D3: profile privacy hardening
DROP POLICY IF EXISTS "Public profiles are viewable by anyone" ON public.profiles;

DROP VIEW IF EXISTS public.public_profiles;

CREATE OR REPLACE FUNCTION public.get_public_nicknames(_user_ids uuid[])
RETURNS TABLE(id uuid, nickname text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _ids uuid[];
BEGIN
  IF _user_ids IS NULL OR array_length(_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT u) INTO _ids
  FROM unnest(_user_ids) AS u
  WHERE u IS NOT NULL;

  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF array_length(_ids, 1) > 500 THEN
    RAISE EXCEPTION 'too_many_ids: maximum 500 user ids per request'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT p.id, p.nickname
  FROM public.profiles p
  WHERE p.id = ANY(_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_nicknames(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_nicknames(uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_nicknames(uuid[]) TO anon, authenticated;