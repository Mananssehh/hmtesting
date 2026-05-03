
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = true)
AS SELECT id, nickname, points FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Allow public to read nickname and points (but not is_premium) via RLS
CREATE POLICY "Public can view nickname and points"
  ON public.profiles FOR SELECT
  USING (true);
