-- Remove the fully public read rules
DROP POLICY IF EXISTS "Anyone can view events" ON public.events;
DROP POLICY IF EXISTS "Anyone can view song requests" ON public.song_requests;
DROP POLICY IF EXISTS "Anyone can view now playing" ON public.now_playing;

-- Events: owner or non-banned participant
CREATE POLICY "events_select_owner" ON public.events
  FOR SELECT TO authenticated
  USING (dj_id = auth.uid());

CREATE POLICY "events_select_member" ON public.events
  FOR SELECT TO authenticated
  USING (public.is_event_member(id));

-- Song requests: event owner or non-banned participant
CREATE POLICY "song_requests_select_scoped" ON public.song_requests
  FOR SELECT TO authenticated
  USING (public.is_event_owner(event_id) OR public.is_event_member(event_id));

-- Now playing: event owner or non-banned participant
CREATE POLICY "now_playing_select_scoped" ON public.now_playing
  FOR SELECT TO authenticated
  USING (public.is_event_owner(event_id) OR public.is_event_member(event_id));

-- No table-level reads for signed-out visitors
REVOKE SELECT ON public.events FROM anon;
REVOKE SELECT ON public.song_requests FROM anon;
REVOKE SELECT ON public.now_playing FROM anon;