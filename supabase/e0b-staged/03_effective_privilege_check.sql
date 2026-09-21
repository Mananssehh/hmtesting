-- E0b accompanying requirement 2 (CORRECTED, rev 2): migration verification check.
--
-- CORRECTION (reviewer Correction 2): the previous version inspected only DIRECT
-- proacl entries for PUBLIC/anon/authenticated via aclexplode. That MISSES
-- EXECUTE reachable through ROLE INHERITANCE (e.g. a grant to some role that
-- anon or authenticated is a member of). This version asks PostgreSQL the
-- question directly:
--
--     has_function_privilege('anon',          p.oid, 'EXECUTE')
--     has_function_privilege('authenticated', p.oid, 'EXECUTE')
--
-- which resolves direct grants, the built-in/explicit PUBLIC grant, and
-- privileges inherited through role membership. Any public-schema function a
-- client role HOLDS EXECUTE on, and that is not in the explicit
-- role-and-function allowlist, raises an exception and aborts the migration.
--
-- Maintenance: adding a row to public._e0b_client_exposed_allowlist is the only
-- way to expose a function to clients, and must be reviewed in the migration
-- that creates the function. allowed_grantees is now interpreted as the set of
-- CLIENT ROLES permitted to HOLD EXECUTE (by any path); the legacy 'public'
-- value is accepted and treated as allowing both anon and authenticated.

CREATE TABLE IF NOT EXISTS public._e0b_client_exposed_allowlist (
  signature text PRIMARY KEY,           -- oid::regprocedure::text form
  allowed_grantees text[] NOT NULL,     -- subset of {public,anon,authenticated}
  reason text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public._e0b_client_exposed_allowlist FROM PUBLIC, anon, authenticated;
GRANT ALL ON public._e0b_client_exposed_allowlist TO service_role;

CREATE OR REPLACE FUNCTION public._e0b_assert_no_unapproved_client_execute()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(format('%s -> %s (%s)', sig, role_name, via), E'\n' ORDER BY sig, role_name)
    INTO bad
  FROM (
    SELECT p.oid::regprocedure::text AS sig,
           r.role_name,
           CASE
             WHEN EXISTS (
               SELECT 1 FROM pg_catalog.aclexplode(
                        COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
                WHERE a.privilege_type = 'EXECUTE'
                  AND a.grantee <> 0
                  AND pg_catalog.pg_get_userbyid(a.grantee) = r.role_name)
               THEN 'direct grant'
             WHEN EXISTS (
               SELECT 1 FROM pg_catalog.aclexplode(
                        COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
                WHERE a.privilege_type = 'EXECUTE' AND a.grantee = 0)
               THEN 'PUBLIC grant'
             ELSE 'INHERITED via role membership'
           END AS via
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name)
    WHERE n.nspname = 'public'
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles pr WHERE pr.rolname = r.role_name)
      AND pg_catalog.has_function_privilege(r.role_name, p.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM public._e0b_client_exposed_allowlist w
        WHERE w.signature = p.oid::regprocedure::text
          AND (r.role_name = ANY (w.allowed_grantees)
               OR 'public' = ANY (w.allowed_grantees))
      )
  ) t;

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION E'E0b check FAILED: unapproved client EXECUTE on public functions:\n%', bad;
  END IF;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public._e0b_assert_no_unapproved_client_execute() FROM PUBLIC, anon, authenticated;
