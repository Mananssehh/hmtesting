-- 1. Events INSERT now requires DJ role
DROP POLICY IF EXISTS "DJs can create events" ON public.events;
CREATE POLICY "DJs can create events" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = dj_id AND public.has_role(auth.uid(), 'dj'::app_role));

-- 2. Hide ingest_token from direct client reads; expose via RPC to owning DJ only
REVOKE SELECT (ingest_token) ON public.event_integrations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_ingest_token(_event_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_owner boolean;
  _token text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.events WHERE id = _event_id AND dj_id = _uid) INTO _is_owner;
  IF NOT _is_owner THEN
    RAISE EXCEPTION 'Not the DJ for this event';
  END IF;

  SELECT ingest_token INTO _token
  FROM public.event_integrations
  WHERE event_id = _event_id;

  IF _token IS NULL THEN
    INSERT INTO public.event_integrations (event_id, source_type)
    VALUES (_event_id, 'manual')
    ON CONFLICT DO NOTHING;
    SELECT ingest_token INTO _token
    FROM public.event_integrations
    WHERE event_id = _event_id;
  END IF;

  RETURN _token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ingest_token(uuid) TO authenticated;

-- 3. Explicit deny INSERT on bridge_pairing_codes (only the SECURITY DEFINER RPC creates them)
DROP POLICY IF EXISTS "No client inserts (RPC only)" ON public.bridge_pairing_codes;
CREATE POLICY "No client inserts (RPC only)" ON public.bridge_pairing_codes
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- 4. Stop broadcasting sensitive profile columns over realtime
ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles (id, nickname, is_public, updated_at);

-- 5. Pin search_path on remaining email helper functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;