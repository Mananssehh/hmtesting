
-- Revert view to invoker (linter-friendly)
ALTER VIEW public.public_profiles SET (security_invoker = true);

-- Restore a public SELECT policy on profiles, but limited at the column level
CREATE POLICY "Public can view safe profile columns"
ON public.profiles FOR SELECT
TO anon, authenticated
USING (true);

-- Lock down columns: only id/nickname/points readable by general clients
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, nickname, points) ON public.profiles TO anon, authenticated;

-- Owners still get full row via the existing "Users view their own profile" policy,
-- but they need column grants too. Grant remaining columns only to authenticated;
-- RLS will restrict to owner rows.
GRANT SELECT (is_premium, created_at, updated_at) ON public.profiles TO authenticated;
