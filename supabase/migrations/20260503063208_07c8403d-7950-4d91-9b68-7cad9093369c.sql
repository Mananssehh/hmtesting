CREATE OR REPLACE FUNCTION public.claim_dj_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'dj')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_dj_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_dj_role() TO authenticated;