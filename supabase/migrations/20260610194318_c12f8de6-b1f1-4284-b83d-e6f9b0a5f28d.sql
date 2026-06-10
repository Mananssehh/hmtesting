
-- Replace claim_dj_role with a no-arg self-serve version
DROP FUNCTION IF EXISTS public.claim_dj_role(text);
DROP FUNCTION IF EXISTS public.create_dj_invite_code(int, timestamptz);
DROP TABLE IF EXISTS public.dj_invite_codes CASCADE;

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
    VALUES (_uid, 'dj') ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.dj_role_claims (user_id, success) VALUES (_uid, true);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_dj_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_dj_role() TO authenticated;

-- Tighten events INSERT policy: must be the dj_id AND hold the dj role
DROP POLICY IF EXISTS "DJs can create events" ON public.events;
CREATE POLICY "DJs can create events"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = dj_id AND public.has_role(auth.uid(), 'dj'::app_role));
