
-- 1) event_participants: restrict SELECT
DROP POLICY IF EXISTS "Anyone can view participants" ON public.event_participants;
CREATE POLICY "Users view their own participation"
  ON public.event_participants FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "DJ views participants of their events"
  ON public.event_participants FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_participants.event_id AND e.dj_id = auth.uid()));

-- 2) votes: restrict SELECT
DROP POLICY IF EXISTS "Anyone can view votes" ON public.votes;
CREATE POLICY "Users view their own votes"
  ON public.votes FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "DJ views votes for their events"
  ON public.votes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.song_requests sr
    JOIN public.events e ON e.id = sr.event_id
    WHERE sr.id = votes.song_request_id AND e.dj_id = auth.uid()
  ));

-- 3) event_blocklist: restrict to DJ only
DROP POLICY IF EXISTS "Anyone can view blocklist" ON public.event_blocklist;
CREATE POLICY "DJ views their blocklist"
  ON public.event_blocklist FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_blocklist.event_id AND e.dj_id = auth.uid()));

-- 4) profiles: restrict full row to owner; expose only safe fields publicly via a view
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Users view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true)
AS SELECT id, nickname FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Allow public read of just nickname column for joins by creating a permissive policy on a limited set is complex;
-- Provide a SECURITY DEFINER function for nickname lookup used by leaderboards if needed:
CREATE OR REPLACE FUNCTION public.get_nickname(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nickname FROM public.profiles WHERE id = _user_id
$$;
REVOKE ALL ON FUNCTION public.get_nickname(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_nickname(uuid) TO anon, authenticated;

-- 5) Lock down SECURITY DEFINER functions: revoke from public/anon where not intended
REVOKE EXECUTE ON FUNCTION public.award_points(uuid, uuid, integer, point_tx_type, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_vote_counts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_song_request_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_song_request_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_event_join() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_vote_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_event_ended_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_event_active() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recent_request_count(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recent_request_count(uuid, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.boost_request(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.boost_request(uuid, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.dj_award_points(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dj_award_points(uuid, uuid, integer, text) TO authenticated;
-- Demo functions remain callable so demo flow keeps working
GRANT EXECUTE ON FUNCTION public.ensure_demo_event(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_demo_events() TO authenticated;
