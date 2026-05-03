
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = false)
AS SELECT id, nickname, points FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;
