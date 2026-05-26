-- Allow public read of profiles that opted in via is_public = true.
-- Profiles only contain non-sensitive fields (nickname, points, badges).
-- Private profiles remain restricted to their owner via the existing "Users view their own profile" policy.
CREATE POLICY "Public profiles are viewable by anyone"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true);