-- E0b accompanying requirement 2: migration verification check.
--
-- Tests EFFECTIVE privileges from the catalog (pg_proc.proacl via aclexplode),
-- NOT the presence of a REVOKE string in SQL text. Any function in public that
-- is executable by PUBLIC (grantee oid 0), anon or authenticated and is not in
-- the explicit allowlist raises an exception and aborts the migration.
--
-- Maintenance: adding a row to public._e0b_client_exposed_allowlist is the only
-- way to expose a function to clients, and must be reviewed in the migration
-- that creates the function.

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
  SELECT string_agg(format('%s -> %s', sig, grantees), E'\n' ORDER BY sig)
    INTO bad
  FROM (
    SELECT p.oid::regprocedure::text AS sig,
           array_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'public'
                                   ELSE pg_catalog.pg_get_userbyid(a.grantee) END
                     ORDER BY 1) AS grantees
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
    WHERE n.nspname = 'public'
      AND a.privilege_type = 'EXECUTE'
      AND (a.grantee = 0 OR pg_catalog.pg_get_userbyid(a.grantee) IN ('anon','authenticated'))
      AND NOT EXISTS (
        SELECT 1 FROM public._e0b_client_exposed_allowlist w
        WHERE w.signature = p.oid::regprocedure::text
          AND (CASE WHEN a.grantee = 0 THEN 'public'
                    ELSE pg_catalog.pg_get_userbyid(a.grantee) END) = ANY (w.allowed_grantees)
      )
    GROUP BY 1
  ) t;

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION E'E0b check FAILED: unapproved client EXECUTE on public functions:\n%', bad;
  END IF;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public._e0b_assert_no_unapproved_client_execute() FROM PUBLIC, anon, authenticated;
