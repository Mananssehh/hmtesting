CREATE OR REPLACE FUNCTION public.generate_bridge_pairing_code(_event_id uuid)
 RETURNS TABLE(code text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WHERE NOT EXISTS (SELECT 1 FROM public.event_integrations ei WHERE ei.event_id = _event_id);

  -- Invalidate any prior unclaimed codes for this event
  DELETE FROM public.bridge_pairing_codes bpc
    WHERE bpc.event_id = _event_id AND bpc.claimed_at IS NULL;

  -- Cleanup expired codes globally
  DELETE FROM public.bridge_pairing_codes bpc
    WHERE bpc.expires_at < now() - interval '1 hour';

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
$function$;