
-- Remove leaked invite code and rotate
DELETE FROM public.dj_invite_codes WHERE code = 'DECKS-LAUNCH';

DO $$
DECLARE
  _new_code text := 'DECKS-' || upper(encode(extensions.gen_random_bytes(8), 'hex'));
BEGIN
  INSERT INTO public.dj_invite_codes (code, uses_remaining) VALUES (_new_code, 100);
  RAISE NOTICE 'New DJ invite code (store privately): %', _new_code;
END $$;

-- Admin-only RPC to mint future invite codes
CREATE OR REPLACE FUNCTION public.create_dj_invite_code(_uses int DEFAULT 1, _expires_at timestamptz DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _code text;
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins may create invite codes';
  END IF;
  IF _uses IS NULL OR _uses < 1 OR _uses > 1000 THEN
    RAISE EXCEPTION 'uses must be between 1 and 1000';
  END IF;
  _code := 'DECKS-' || upper(encode(extensions.gen_random_bytes(8), 'hex'));
  INSERT INTO public.dj_invite_codes (code, uses_remaining, expires_at, created_by)
    VALUES (_code, _uses, _expires_at, _uid);
  RETURN _code;
END $$;
REVOKE ALL ON FUNCTION public.create_dj_invite_code(int, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_dj_invite_code(int, timestamptz) TO authenticated;

-- Admin-only SELECT for invite codes
DROP POLICY IF EXISTS "Admins view invite codes" ON public.dj_invite_codes;
CREATE POLICY "Admins view invite codes"
  ON public.dj_invite_codes FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Lock down error_logs
DROP POLICY IF EXISTS "Anyone can insert error logs" ON public.error_logs;
DROP POLICY IF EXISTS "DJs can view error logs" ON public.error_logs;
DROP POLICY IF EXISTS "DJs can update error logs" ON public.error_logs;

CREATE POLICY "Owners or admins view error logs"
  ON public.error_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users insert their own error logs"
  ON public.error_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Admins update error logs"
  ON public.error_logs FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
