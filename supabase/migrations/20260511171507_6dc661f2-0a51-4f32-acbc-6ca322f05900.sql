
-- 1. Composite index for queue ranking
CREATE INDEX IF NOT EXISTS idx_song_requests_queue_ranking
  ON public.song_requests (event_id, status, boost DESC, upvotes DESC);

-- 2. Lock down demo RPCs
REVOKE EXECUTE ON FUNCTION public.ensure_demo_event(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_demo_event(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reset_demo_events() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.reset_demo_events()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _codes text[] := ARRAY['DEMO123','EMPTY123','PAUSED123','ENDED123','MOD123'];
  _c text;
  _id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'dj'::app_role) THEN
    RAISE EXCEPTION 'Only DJs can reset demo events';
  END IF;
  FOREACH _c IN ARRAY _codes LOOP
    SELECT id INTO _id FROM public.events WHERE room_code = _c;
    IF _id IS NOT NULL THEN
      DELETE FROM public.song_requests WHERE event_id = _id;
      DELETE FROM public.event_blocklist WHERE event_id = _id;
      DELETE FROM public.event_banned_guests WHERE event_id = _id;
      DELETE FROM public.events WHERE id = _id;
    END IF;
    PERFORM public.ensure_demo_event(_c);
  END LOOP;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.reset_demo_events() TO authenticated;

-- 3. DJ invite code system
CREATE TABLE IF NOT EXISTS public.dj_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  uses_remaining int NOT NULL DEFAULT 1,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
ALTER TABLE public.dj_invite_codes ENABLE ROW LEVEL SECURITY;
-- No public access; only the SECURITY DEFINER claim function reads/writes.

CREATE TABLE IF NOT EXISTS public.dj_role_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false
);
ALTER TABLE public.dj_role_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own claims" ON public.dj_role_claims
  FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_dj_role_claims_user_time
  ON public.dj_role_claims (user_id, attempted_at DESC);

DROP FUNCTION IF EXISTS public.claim_dj_role();
DROP FUNCTION IF EXISTS public.claim_dj_role(text);

CREATE OR REPLACE FUNCTION public.claim_dj_role(_invite_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _attempts int;
  _row public.dj_invite_codes%ROWTYPE;
  _code text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.has_role(_uid, 'dj'::app_role) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO _attempts FROM public.dj_role_claims
    WHERE user_id = _uid AND attempted_at > now() - interval '1 hour';
  IF _attempts >= 5 THEN
    RAISE EXCEPTION 'Too many attempts. Please wait an hour before trying again.';
  END IF;

  _code := trim(coalesce(_invite_code, ''));
  IF length(_code) = 0 THEN
    INSERT INTO public.dj_role_claims (user_id, success) VALUES (_uid, false);
    RAISE EXCEPTION 'Invite code required';
  END IF;

  SELECT * INTO _row FROM public.dj_invite_codes
    WHERE upper(code) = upper(_code) FOR UPDATE;

  IF _row.id IS NULL
     OR _row.uses_remaining <= 0
     OR (_row.expires_at IS NOT NULL AND _row.expires_at < now()) THEN
    INSERT INTO public.dj_role_claims (user_id, success) VALUES (_uid, false);
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  UPDATE public.dj_invite_codes
    SET uses_remaining = uses_remaining - 1
    WHERE id = _row.id;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (_uid, 'dj') ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.dj_role_claims (user_id, success) VALUES (_uid, true);
END;
$function$;
REVOKE ALL ON FUNCTION public.claim_dj_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_dj_role(text) TO authenticated;

INSERT INTO public.dj_invite_codes (code, uses_remaining)
  VALUES ('DECKS-LAUNCH', 100)
  ON CONFLICT (code) DO NOTHING;

-- 4. Blocklist normalization
CREATE OR REPLACE FUNCTION public.normalize_text(_t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT regexp_replace(lower(coalesce(_t, '')), '[^a-z0-9]+', '', 'g')
$function$;

DROP POLICY IF EXISTS "Authenticated users can create song requests" ON public.song_requests;
CREATE POLICY "Authenticated users can create song requests"
ON public.song_requests
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND auth.uid() = requested_by
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = song_requests.event_id
      AND e.requests_status = 'live'
      AND (e.allow_explicit OR COALESCE(song_requests.explicit, false) = false)
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.event_banned_guests b
    WHERE b.event_id = song_requests.event_id
      AND b.user_id = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.event_blocklist bl
    WHERE bl.event_id = song_requests.event_id
      AND (
        (bl.kind = 'artist'  AND public.normalize_text(bl.value) = public.normalize_text(song_requests.artist))
        OR (bl.kind = 'song'    AND public.normalize_text(bl.value) = public.normalize_text(song_requests.title))
        OR (bl.kind = 'keyword' AND (
              public.normalize_text(song_requests.title)  LIKE '%' || public.normalize_text(bl.value) || '%'
           OR public.normalize_text(song_requests.artist) LIKE '%' || public.normalize_text(bl.value) || '%'
        ))
      )
  )
  AND public.recent_request_count(
        event_id,
        COALESCE((SELECT cooldown_seconds FROM public.events WHERE id = song_requests.event_id), 0)
      ) = 0
);
