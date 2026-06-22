
-- 1) Revoke column-level read of sensitive profile fields from client roles
REVOKE SELECT (points, is_premium) ON public.profiles FROM anon, authenticated;

-- Re-grant the safe columns explicitly so SELECT still works for client reads
GRANT SELECT (id, nickname, is_public, created_at, updated_at) ON public.profiles TO anon, authenticated;

-- 2) Lock bridge_pair_attempts to server-side only
REVOKE ALL ON public.bridge_pair_attempts FROM anon, authenticated;
GRANT ALL ON public.bridge_pair_attempts TO service_role;

-- Add an explicit deny-by-default policy so the no-policy state is intentional and documented
DROP POLICY IF EXISTS "No client access to bridge_pair_attempts" ON public.bridge_pair_attempts;
CREATE POLICY "No client access to bridge_pair_attempts"
  ON public.bridge_pair_attempts
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
