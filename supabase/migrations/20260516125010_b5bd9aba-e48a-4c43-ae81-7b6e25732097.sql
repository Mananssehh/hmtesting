-- Bridge pairing codes for Decks Bridge app
CREATE TABLE public.bridge_pairing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  event_id uuid NOT NULL,
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  claimed_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bridge_pairing_codes_event ON public.bridge_pairing_codes(event_id);
CREATE INDEX idx_bridge_pairing_codes_expires ON public.bridge_pairing_codes(expires_at);

ALTER TABLE public.bridge_pairing_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DJ views own pairing codes"
  ON public.bridge_pairing_codes FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.events e
    WHERE e.id = bridge_pairing_codes.event_id AND e.dj_id = auth.uid()));

CREATE POLICY "DJ deletes own pairing codes"
  ON public.bridge_pairing_codes FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.events e
    WHERE e.id = bridge_pairing_codes.event_id AND e.dj_id = auth.uid()));

-- RPC: generate a short numeric pairing code, expires in 5 min.
CREATE OR REPLACE FUNCTION public.generate_bridge_pairing_code(_event_id uuid)
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_owner boolean;
  _code text;
  _expires timestamptz := now() + interval '5 minutes';
  _attempts int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.events WHERE id = _event_id AND dj_id = _uid) INTO _is_owner;
  IF NOT _is_owner THEN RAISE EXCEPTION 'Not the DJ for this event'; END IF;

  -- Ensure integration row exists
  INSERT INTO public.event_integrations (event_id, source_type)
  SELECT _event_id, 'bridge'
  WHERE NOT EXISTS (SELECT 1 FROM public.event_integrations WHERE event_id = _event_id);

  -- Invalidate any prior unclaimed codes for this event
  DELETE FROM public.bridge_pairing_codes
    WHERE event_id = _event_id AND claimed_at IS NULL;

  -- Cleanup expired codes globally
  DELETE FROM public.bridge_pairing_codes
    WHERE expires_at < now() - interval '1 hour';

  LOOP
    _attempts := _attempts + 1;
    _code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    BEGIN
      INSERT INTO public.bridge_pairing_codes (code, event_id, created_by, expires_at)
        VALUES (_code, _event_id, _uid, _expires);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF _attempts > 8 THEN RAISE EXCEPTION 'Could not allocate pairing code'; END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT _code, _expires;
END;
$$;

-- RPC: regenerate ingest_token for a DJ's event (rotates credentials).
CREATE OR REPLACE FUNCTION public.regenerate_ingest_token(_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_owner boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.events WHERE id = _event_id AND dj_id = _uid) INTO _is_owner;
  IF NOT _is_owner THEN RAISE EXCEPTION 'Not the DJ for this event'; END IF;

  INSERT INTO public.event_integrations (event_id, source_type, ingest_token)
    VALUES (_event_id, 'bridge', encode(extensions.gen_random_bytes(24), 'hex'))
    ON CONFLICT DO NOTHING;

  UPDATE public.event_integrations
    SET ingest_token = encode(extensions.gen_random_bytes(24), 'hex'),
        updated_at = now()
    WHERE event_id = _event_id;

  -- Invalidate all pairing codes for this event
  DELETE FROM public.bridge_pairing_codes WHERE event_id = _event_id;
END;
$$;