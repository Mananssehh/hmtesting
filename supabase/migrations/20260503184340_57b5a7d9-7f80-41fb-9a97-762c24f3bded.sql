
-- 1. Profiles: restrict public SELECT to a safe view
DROP POLICY IF EXISTS "Public can view nickname and points" ON public.profiles;

-- Ensure public_profiles view runs with definer semantics so RLS on profiles doesn't restrict it
ALTER VIEW public.public_profiles SET (security_invoker = false);
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- 2. Profiles: restrict UPDATE to the nickname column only
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (nickname) ON public.profiles TO authenticated;

-- Tighten the UPDATE policy with a WITH CHECK
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 3. Song requests: enforce cooldown server-side via RLS
DROP POLICY IF EXISTS "Authenticated users can create song requests" ON public.song_requests;
CREATE POLICY "Authenticated users can create song requests"
ON public.song_requests FOR INSERT
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
    WHERE b.event_id = song_requests.event_id AND b.user_id = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.event_blocklist bl
    WHERE bl.event_id = song_requests.event_id AND (
      (bl.kind = 'artist'  AND lower(bl.value) = lower(song_requests.artist))
      OR (bl.kind = 'song'    AND lower(bl.value) = lower(song_requests.title))
      OR (bl.kind = 'keyword' AND (
            lower(song_requests.title)  LIKE '%' || lower(bl.value) || '%'
         OR lower(song_requests.artist) LIKE '%' || lower(bl.value) || '%'
      ))
    )
  )
  AND public.recent_request_count(
    song_requests.event_id,
    COALESCE((SELECT cooldown_seconds FROM public.events WHERE id = song_requests.event_id), 0)
  ) = 0
);
