-- Create demo auth users with stable UUIDs. The handle_new_user trigger will
-- auto-create matching rows in public.profiles and public.user_roles.
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  v.id::uuid,
  'authenticated', 'authenticated',
  v.nickname || '@demo.decks.local',
  crypt('demo-no-login-' || v.id, gen_salt('bf')),
  now(),
  '{"provider":"demo","providers":["demo"]}'::jsonb,
  jsonb_build_object('nickname', v.nickname, 'demo', true),
  now(), now(), '', '', '', ''
FROM (VALUES
  ('00000000-0000-0000-0000-0000000d0001','NeonRider'),
  ('00000000-0000-0000-0000-0000000d0002','BassQueen'),
  ('00000000-0000-0000-0000-0000000d0003','DiscoDuke'),
  ('00000000-0000-0000-0000-0000000d0004','MidnightMia'),
  ('00000000-0000-0000-0000-0000000d0005','PulseKid'),
  ('00000000-0000-0000-0000-0000000d0006','StrobeSam'),
  ('00000000-0000-0000-0000-0000000d0007','VinylVee'),
  ('00000000-0000-0000-0000-0000000d0008','GlowPilot'),
  ('00000000-0000-0000-0000-0000000d0009','EarlyBird'),
  ('00000000-0000-0000-0000-0000000d000a','Kai'),
  ('00000000-0000-0000-0000-0000000d000b','Lana'),
  ('00000000-0000-0000-0000-0000000d000c','Theo'),
  ('00000000-0000-0000-0000-0000000d000d','Ivy'),
  ('00000000-0000-0000-0000-0000000d000e','CarefulCat')
) AS v(id, nickname)
ON CONFLICT (id) DO NOTHING;

-- Ensure the profile rows exist (in case trigger was skipped for any reason) and
-- give each demo user realistic points + public visibility.
INSERT INTO public.profiles (id, nickname, points, is_public)
VALUES
  ('00000000-0000-0000-0000-0000000d0001'::uuid, 'NeonRider',   480, true),
  ('00000000-0000-0000-0000-0000000d0002'::uuid, 'BassQueen',   410, true),
  ('00000000-0000-0000-0000-0000000d0003'::uuid, 'DiscoDuke',   365, true),
  ('00000000-0000-0000-0000-0000000d0004'::uuid, 'MidnightMia', 305, true),
  ('00000000-0000-0000-0000-0000000d0005'::uuid, 'PulseKid',    260, true),
  ('00000000-0000-0000-0000-0000000d0006'::uuid, 'StrobeSam',   215, true),
  ('00000000-0000-0000-0000-0000000d0007'::uuid, 'VinylVee',    180, true),
  ('00000000-0000-0000-0000-0000000d0008'::uuid, 'GlowPilot',   140, true),
  ('00000000-0000-0000-0000-0000000d0009'::uuid, 'EarlyBird',    95, true),
  ('00000000-0000-0000-0000-0000000d000a'::uuid, 'Kai',          80, true),
  ('00000000-0000-0000-0000-0000000d000b'::uuid, 'Lana',        225, true),
  ('00000000-0000-0000-0000-0000000d000c'::uuid, 'Theo',        170, true),
  ('00000000-0000-0000-0000-0000000d000d'::uuid, 'Ivy',         130, true),
  ('00000000-0000-0000-0000-0000000d000e'::uuid, 'CarefulCat',   60, true)
ON CONFLICT (id) DO UPDATE
SET nickname = EXCLUDED.nickname,
    points = EXCLUDED.points,
    is_public = true,
    updated_at = now();

-- Rewrite ensure_demo_event so seeded song_requests are owned by these demo users.
CREATE OR REPLACE FUNCTION public.ensure_demo_event(_code text)
 RETURNS events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _demo_dj_id uuid := '00000000-0000-0000-0000-0000000000d1';
  _event public.events;
  _code_upper text := upper(_code);
  _neon  uuid := '00000000-0000-0000-0000-0000000d0001';
  _bass  uuid := '00000000-0000-0000-0000-0000000d0002';
  _disco uuid := '00000000-0000-0000-0000-0000000d0003';
  _mia   uuid := '00000000-0000-0000-0000-0000000d0004';
  _pulse uuid := '00000000-0000-0000-0000-0000000d0005';
  _sam   uuid := '00000000-0000-0000-0000-0000000d0006';
  _vee   uuid := '00000000-0000-0000-0000-0000000d0007';
  _glow  uuid := '00000000-0000-0000-0000-0000000d0008';
  _early uuid := '00000000-0000-0000-0000-0000000d0009';
  _kai   uuid := '00000000-0000-0000-0000-0000000d000a';
  _lana  uuid := '00000000-0000-0000-0000-0000000d000b';
  _theo  uuid := '00000000-0000-0000-0000-0000000d000c';
  _ivy   uuid := '00000000-0000-0000-0000-0000000d000d';
  _care  uuid := '00000000-0000-0000-0000-0000000d000e';
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

    INSERT INTO public.song_requests (event_id, requested_by, requester_name, title, artist, album, status, upvotes, downvotes, boost, explicit) VALUES
      (_event.id, _neon,  'NeonRider',   'Strobe',                 'Deadmau5',             'For Lack of a Better Name', 'playing',  22, 1, 30, false),
      (_event.id, _bass,  'BassQueen',   'One More Time',          'Daft Punk',            'Discovery',                 'approved', 18, 0, 10, false),
      (_event.id, _disco, 'DiscoDuke',   'Levels',                 'Avicii',               'True',                      'pending',  16, 2,  5, false),
      (_event.id, _mia,   'MidnightMia', 'Titanium',               'David Guetta',         'Nothing but the Beat',      'pending',  12, 1,  0, false),
      (_event.id, _pulse, 'PulseKid',    'Animals',                'Martin Garrix',        'Gold Skies',                'pending',  10, 3,  0, false),
      (_event.id, _sam,   'StrobeSam',   'Wake Me Up',             'Avicii',               'True',                      'pending',   8, 0,  0, false),
      (_event.id, _vee,   'VinylVee',    'Don''t You Worry Child', 'Swedish House Mafia',  'Until Now',                 'pending',   6, 1,  0, false),
      (_event.id, _glow,  'GlowPilot',   'Clarity',                'Zedd',                 'Clarity',                   'pending',   4, 0,  0, false);

  ELSIF _code_upper = 'EMPTY123' THEN
    INSERT INTO public.events (dj_id, name, venue, dj_name, room_code, is_active, requests_status, allow_explicit, require_approval, cooldown_seconds, rules_text)
    VALUES (_demo_dj_id, '[DEMO] Empty Room', 'Test Venue', 'DJ Demo', 'EMPTY123', true, 'live', true, false, 10, 'Empty event — be the first to request a song!')
    RETURNING * INTO _event;

  ELSIF _code_upper = 'PAUSED123' THEN
    INSERT INTO public.events (dj_id, name, venue, dj_name, room_code, is_active, requests_status, allow_explicit, require_approval, cooldown_seconds, rules_text)
    VALUES (_demo_dj_id, '[DEMO] Paused Room', 'Test Venue', 'DJ Demo', 'PAUSED123', true, 'paused', true, false, 10, 'The DJ has paused requests.')
    RETURNING * INTO _event;

    INSERT INTO public.song_requests (event_id, requested_by, requester_name, title, artist, status, upvotes, downvotes, boost, explicit) VALUES
      (_event.id, _early, 'EarlyBird', 'Midnight City', 'M83',       'playing', 14, 0, 0, false),
      (_event.id, _kai,   'Kai',       'Get Lucky',     'Daft Punk', 'pending',  9, 1, 0, false);

  ELSIF _code_upper = 'ENDED123' THEN
    INSERT INTO public.events (dj_id, name, venue, dj_name, room_code, is_active, requests_status, allow_explicit, require_approval, cooldown_seconds, rules_text)
    VALUES (_demo_dj_id, '[DEMO] Ended Room', 'Test Venue', 'DJ Demo', 'ENDED123', false, 'ended', true, false, 10, 'This event has ended. Thanks for coming!')
    RETURNING * INTO _event;

    INSERT INTO public.song_requests (event_id, requested_by, requester_name, title, artist, status, upvotes, downvotes, boost, explicit) VALUES
      (_event.id, _lana, 'Lana', 'Closing Time',     'Semisonic', 'played', 30, 0, 20, false),
      (_event.id, _theo, 'Theo', 'Sandstorm',        'Darude',    'played', 25, 1, 10, false),
      (_event.id, _ivy,  'Ivy',  'Around the World', 'Daft Punk', 'played', 18, 0,  0, false);

  ELSIF _code_upper = 'MOD123' THEN
    INSERT INTO public.events (dj_id, name, venue, dj_name, room_code, is_active, requests_status, allow_explicit, require_approval, cooldown_seconds, rules_text)
    VALUES (_demo_dj_id, '[DEMO] Moderation Test', 'Test Venue', 'DJ Demo', 'MOD123', true, 'live', false, true, 30, 'Strict moderation: explicit blocked, approval required, cooldown 30s.')
    RETURNING * INTO _event;

    INSERT INTO public.event_blocklist (event_id, kind, value) VALUES
      (_event.id, 'artist',  'Banned Artist'),
      (_event.id, 'keyword', 'badword'),
      (_event.id, 'song',    'Forbidden Track');

    INSERT INTO public.song_requests (event_id, requested_by, requester_name, title, artist, status, upvotes, downvotes, boost, explicit) VALUES
      (_event.id, _care, 'CarefulCat', 'Sunset Lover', 'Petit Biscuit', 'pending', 5, 0, 0, false);
  END IF;

  RETURN _event;
END;
$function$;

-- Rebuild existing demo events so they pick up the linked requested_by ids.
DO $$
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
END $$;