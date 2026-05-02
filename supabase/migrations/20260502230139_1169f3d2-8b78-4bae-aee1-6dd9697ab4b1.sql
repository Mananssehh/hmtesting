-- Demo event support: stable DEMO123 event with seeded songs

CREATE OR REPLACE FUNCTION public.ensure_demo_event()
RETURNS public.events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _demo_dj_id uuid := '00000000-0000-0000-0000-0000000000d1';
  _event public.events;
BEGIN
  SELECT * INTO _event FROM public.events WHERE room_code = 'DEMO123' LIMIT 1;

  IF _event.id IS NULL THEN
    INSERT INTO public.events (dj_id, name, venue, dj_name, room_code, is_active, requests_status, allow_explicit, require_approval, cooldown_seconds, rules_text)
    VALUES (_demo_dj_id, 'Demo Night @ Club Neon', 'Club Neon', 'DJ Demo', 'DEMO123', true, 'live', true, false, 10, 'This is a demo room. Try requesting, voting and boosting!')
    RETURNING * INTO _event;

    INSERT INTO public.song_requests (event_id, requested_by, requester_name, title, artist, album, status, upvotes, downvotes, boost, explicit)
    VALUES
      (_event.id, NULL, 'NeonRider',     'Strobe',           'Deadmau5',         'For Lack of a Better Name', 'playing',  22, 1, 30, false),
      (_event.id, NULL, 'BassQueen',     'One More Time',    'Daft Punk',        'Discovery',                'pending',  18, 0, 10, false),
      (_event.id, NULL, 'DiscoDuke',     'Levels',           'Avicii',           'True',                     'pending',  16, 2,  5, false),
      (_event.id, NULL, 'MidnightMia',   'Titanium',         'David Guetta',     'Nothing but the Beat',     'pending',  12, 1,  0, false),
      (_event.id, NULL, 'PulseKid',      'Animals',          'Martin Garrix',    'Gold Skies',               'pending',  10, 3,  0, false),
      (_event.id, NULL, 'StrobeSam',     'Wake Me Up',       'Avicii',           'True',                     'pending',   8, 0,  0, false),
      (_event.id, NULL, 'VinylVee',      'Don''t You Worry Child','Swedish House Mafia','Until Now',         'pending',   6, 1,  0, false),
      (_event.id, NULL, 'GlowPilot',     'Clarity',          'Zedd',             'Clarity',                  'pending',   4, 0,  0, false);
  END IF;

  RETURN _event;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_demo_event()
RETURNS public.events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event public.events;
BEGIN
  SELECT * INTO _event FROM public.events WHERE room_code = 'DEMO123' LIMIT 1;
  IF _event.id IS NOT NULL THEN
    DELETE FROM public.song_requests WHERE event_id = _event.id;
    DELETE FROM public.events WHERE id = _event.id;
  END IF;
  RETURN public.ensure_demo_event();
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_demo_event() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_demo_event() TO authenticated;