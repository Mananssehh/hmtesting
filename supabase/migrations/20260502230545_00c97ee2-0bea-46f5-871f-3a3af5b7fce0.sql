-- Replace previous demo helpers with a richer multi-code system
DROP FUNCTION IF EXISTS public.ensure_demo_event();
DROP FUNCTION IF EXISTS public.reset_demo_event();

CREATE OR REPLACE FUNCTION public.ensure_demo_event(_code text)
RETURNS public.events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _demo_dj_id uuid := '00000000-0000-0000-0000-0000000000d1';
  _event public.events;
  _code_upper text := upper(_code);
BEGIN
  IF _code_upper NOT IN ('DEMO123','EMPTY123','PAUSED123','ENDED123','MOD123') THEN
    RAISE EXCEPTION 'Unknown demo code';
  END IF;

  SELECT * INTO _event FROM public.events WHERE room_code = _code_upper LIMIT 1;
  IF _event.id IS NOT NULL THEN
    RETURN _event;
  END IF;

  IF _code_upper = 'DEMO123' THEN
    INSERT INTO public.events (dj_id, name, venue, dj_name, room_code, is_active, requests_status, allow_explicit, require_approval, cooldown_seconds, rules_text)
    VALUES (_demo_dj_id, '[DEMO] Saturday Night', 'Club Neon', 'DJ Demo', 'DEMO123', true, 'live', true, false, 10, 'Welcome to the demo room — request, vote, boost!')
    RETURNING * INTO _event;

    INSERT INTO public.song_requests (event_id, requester_name, title, artist, album, status, upvotes, downvotes, boost, explicit) VALUES
      (_event.id, 'NeonRider',   'Strobe',                 'Deadmau5',             'For Lack of a Better Name', 'playing',  22, 1, 30, false),
      (_event.id, 'BassQueen',   'One More Time',          'Daft Punk',            'Discovery',                 'approved', 18, 0, 10, false),
      (_event.id, 'DiscoDuke',   'Levels',                 'Avicii',               'True',                      'pending',  16, 2,  5, false),
      (_event.id, 'MidnightMia', 'Titanium',               'David Guetta',         'Nothing but the Beat',      'pending',  12, 1,  0, false),
      (_event.id, 'PulseKid',    'Animals',                'Martin Garrix',        'Gold Skies',                'pending',  10, 3,  0, false),
      (_event.id, 'StrobeSam',   'Wake Me Up',             'Avicii',               'True',                      'pending',   8, 0,  0, false),
      (_event.id, 'VinylVee',    'Don''t You Worry Child', 'Swedish House Mafia',  'Until Now',                 'pending',   6, 1,  0, false),
      (_event.id, 'GlowPilot',   'Clarity',                'Zedd',                 'Clarity',                   'pending',   4, 0,  0, false);

  ELSIF _code_upper = 'EMPTY123' THEN
    INSERT INTO public.events (dj_id, name, venue, dj_name, room_code, is_active, requests_status, allow_explicit, require_approval, cooldown_seconds, rules_text)
    VALUES (_demo_dj_id, '[DEMO] Empty Room', 'Test Venue', 'DJ Demo', 'EMPTY123', true, 'live', true, false, 10, 'Empty event — be the first to request a song!')
    RETURNING * INTO _event;

  ELSIF _code_upper = 'PAUSED123' THEN
    INSERT INTO public.events (dj_id, name, venue, dj_name, room_code, is_active, requests_status, allow_explicit, require_approval, cooldown_seconds, rules_text)
    VALUES (_demo_dj_id, '[DEMO] Paused Room', 'Test Venue', 'DJ Demo', 'PAUSED123', true, 'paused', true, false, 10, 'The DJ has paused requests.')
    RETURNING * INTO _event;

    INSERT INTO public.song_requests (event_id, requester_name, title, artist, status, upvotes, downvotes, boost, explicit) VALUES
      (_event.id, 'EarlyBird', 'Midnight City', 'M83', 'playing', 14, 0, 0, false),
      (_event.id, 'Kai',       'Get Lucky',     'Daft Punk', 'pending', 9, 1, 0, false);

  ELSIF _code_upper = 'ENDED123' THEN
    INSERT INTO public.events (dj_id, name, venue, dj_name, room_code, is_active, requests_status, allow_explicit, require_approval, cooldown_seconds, rules_text)
    VALUES (_demo_dj_id, '[DEMO] Ended Room', 'Test Venue', 'DJ Demo', 'ENDED123', false, 'ended', true, false, 10, 'This event has ended. Thanks for coming!')
    RETURNING * INTO _event;

    INSERT INTO public.song_requests (event_id, requester_name, title, artist, status, upvotes, downvotes, boost, explicit) VALUES
      (_event.id, 'Lana',  'Closing Time',   'Semisonic',  'played', 30, 0, 20, false),
      (_event.id, 'Theo',  'Sandstorm',      'Darude',     'played', 25, 1, 10, false),
      (_event.id, 'Ivy',   'Around the World','Daft Punk', 'played', 18, 0,  0, false);

  ELSIF _code_upper = 'MOD123' THEN
    INSERT INTO public.events (dj_id, name, venue, dj_name, room_code, is_active, requests_status, allow_explicit, require_approval, cooldown_seconds, rules_text)
    VALUES (_demo_dj_id, '[DEMO] Moderation Test', 'Test Venue', 'DJ Demo', 'MOD123', true, 'live', false, true, 30, 'Strict moderation: explicit blocked, approval required, cooldown 30s.')
    RETURNING * INTO _event;

    INSERT INTO public.event_blocklist (event_id, kind, value) VALUES
      (_event.id, 'artist',  'Banned Artist'),
      (_event.id, 'keyword', 'badword'),
      (_event.id, 'song',    'Forbidden Track');

    INSERT INTO public.song_requests (event_id, requester_name, title, artist, status, upvotes, downvotes, boost, explicit) VALUES
      (_event.id, 'CarefulCat', 'Sunset Lover', 'Petit Biscuit', 'pending', 5, 0, 0, false);
  END IF;

  RETURN _event;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_demo_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _codes text[] := ARRAY['DEMO123','EMPTY123','PAUSED123','ENDED123','MOD123'];
  _c text;
  _id uuid;
BEGIN
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
$$;

GRANT EXECUTE ON FUNCTION public.ensure_demo_event(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_demo_events() TO authenticated;