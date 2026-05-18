
-- Collect demo event ids
WITH demo_events AS (
  SELECT id FROM public.events
  WHERE room_code IN ('DEMO123','EMPTY123','PAUSED123','ENDED123','MOD123')
     OR name ILIKE '[DEMO]%'
     OR dj_name IN ('DJ Demo','DemoGuest')
)
DELETE FROM public.points_transactions WHERE event_id IN (SELECT id FROM demo_events);

DELETE FROM public.votes
 WHERE song_request_id IN (
   SELECT sr.id FROM public.song_requests sr
   JOIN public.events e ON e.id = sr.event_id
   WHERE e.room_code IN ('DEMO123','EMPTY123','PAUSED123','ENDED123','MOD123')
      OR e.name ILIKE '[DEMO]%'
      OR e.dj_name IN ('DJ Demo','DemoGuest')
 );

DELETE FROM public.song_requests
 WHERE event_id IN (
   SELECT id FROM public.events
   WHERE room_code IN ('DEMO123','EMPTY123','PAUSED123','ENDED123','MOD123')
      OR name ILIKE '[DEMO]%'
      OR dj_name IN ('DJ Demo','DemoGuest')
 );

DELETE FROM public.event_blocklist
 WHERE event_id IN (
   SELECT id FROM public.events
   WHERE room_code IN ('DEMO123','EMPTY123','PAUSED123','ENDED123','MOD123')
      OR name ILIKE '[DEMO]%'
      OR dj_name IN ('DJ Demo','DemoGuest')
 );

DELETE FROM public.event_banned_guests
 WHERE event_id IN (
   SELECT id FROM public.events
   WHERE room_code IN ('DEMO123','EMPTY123','PAUSED123','ENDED123','MOD123')
      OR name ILIKE '[DEMO]%'
      OR dj_name IN ('DJ Demo','DemoGuest')
 );

DELETE FROM public.event_participants
 WHERE event_id IN (
   SELECT id FROM public.events
   WHERE room_code IN ('DEMO123','EMPTY123','PAUSED123','ENDED123','MOD123')
      OR name ILIKE '[DEMO]%'
      OR dj_name IN ('DJ Demo','DemoGuest')
 );

DELETE FROM public.event_integrations
 WHERE event_id IN (
   SELECT id FROM public.events
   WHERE room_code IN ('DEMO123','EMPTY123','PAUSED123','ENDED123','MOD123')
      OR name ILIKE '[DEMO]%'
      OR dj_name IN ('DJ Demo','DemoGuest')
 );

DELETE FROM public.bridge_pairing_codes
 WHERE event_id IN (
   SELECT id FROM public.events
   WHERE room_code IN ('DEMO123','EMPTY123','PAUSED123','ENDED123','MOD123')
      OR name ILIKE '[DEMO]%'
      OR dj_name IN ('DJ Demo','DemoGuest')
 );

DELETE FROM public.now_playing
 WHERE event_id IN (
   SELECT id FROM public.events
   WHERE room_code IN ('DEMO123','EMPTY123','PAUSED123','ENDED123','MOD123')
      OR name ILIKE '[DEMO]%'
      OR dj_name IN ('DJ Demo','DemoGuest')
 );

DELETE FROM public.events
 WHERE room_code IN ('DEMO123','EMPTY123','PAUSED123','ENDED123','MOD123')
    OR name ILIKE '[DEMO]%'
    OR dj_name IN ('DJ Demo','DemoGuest');

-- Orphan now_playing rows (no parent event)
DELETE FROM public.now_playing np
 WHERE NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = np.event_id);

-- Drop demo RPCs
DROP FUNCTION IF EXISTS public.ensure_demo_event(text);
DROP FUNCTION IF EXISTS public.reset_demo_events();
