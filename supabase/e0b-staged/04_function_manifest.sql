-- E0b Correction 1: DETERMINISTIC ROW-BY-ROW FUNCTION MANIFEST (read-only).
--
-- Retires the earlier opaque fingerprint 151e45ed3dda20d5b37b6b1d1449d59d as
-- NOT REPRODUCIBLE. This file is the single fixed query text used to capture the
-- manifest; it must be run verbatim, with the fixed search_path below, both
-- BEFORE and AFTER the Gate 2 apply so the two row sets can be diffed.
--
-- Notes:
--  * pg_get_function_identity_arguments() is the proper identifying argument
--    list (what you must write to name the function uniquely).
--  * pg_get_functiondef() returns RECONSTRUCTED text, not the original source
--    text; its hash detects semantic-definition drift, not formatting fidelity.
--  * ACL entries are EXPANDED and SORTED by grantor, grantee, privilege,
--    grantability, so array ordering cannot cause a false mismatch.
--  * proconfig is SORTED.
--
-- Read-only: SELECT only. No writes, no DDL.

SET search_path = pg_catalog;
\pset pager off
\pset footer off

CREATE TEMP VIEW _e0b_manifest AS
SELECT
  n.nspname                                            AS schema_name,
  p.proname                                            AS function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_catalog.pg_get_userbyid(p.proowner)               AS owner,
  l.lanname                                            AS language,
  p.prokind                                            AS prokind,
  p.prosecdef                                          AS security_definer,
  p.provolatile                                        AS volatility,
  p.proisstrict                                        AS is_strict,
  p.proparallel                                        AS parallel,
  p.proleakproof                                       AS leakproof,
  p.proretset                                          AS returns_set,
  COALESCE((SELECT pg_catalog.string_agg(c, '|' ORDER BY c)
              FROM pg_catalog.unnest(p.proconfig) c), '')       AS proconfig_sorted,
  COALESCE((SELECT pg_catalog.string_agg(
                     pg_catalog.pg_get_userbyid(a.grantor) || '>' ||
                     CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                          ELSE pg_catalog.pg_get_userbyid(a.grantee) END || ':' ||
                     a.privilege_type || ':' || a.is_grantable::text,
                     ',' ORDER BY pg_catalog.pg_get_userbyid(a.grantor),
                                  CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                                       ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
                                  a.privilege_type, a.is_grantable)
              FROM pg_catalog.aclexplode(p.proacl) a), '(default)') AS acl_expanded_sorted,
  p.pronargs                                           AS nargs,
  p.pronargdefaults                                    AS nargdefaults,
  pg_catalog.pg_get_function_arguments(p.oid)          AS full_args,
  pg_catalog.pg_get_function_result(p.oid)             AS result_type,
  COALESCE(p.proargmodes::text, '')                    AS argmodes,
  COALESCE(p.proallargtypes::text, '')                 AS allargtypes,
  p.proargtypes::text                                  AS argtypes,
  p.prorettype::regtype::text                          AS rettype,
  pg_catalog.md5(COALESCE(p.prosrc, ''))               AS prosrc_md5,
  pg_catalog.length(COALESCE(p.prosrc, ''))            AS prosrc_len,
  pg_catalog.md5(COALESCE(p.probin, ''))               AS probin_md5,
  pg_catalog.md5(COALESCE(pg_catalog.pg_get_functiondef(p.oid), '')) AS functiondef_md5
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_language  l ON l.oid = p.prolang
WHERE n.nspname = 'public';

\echo '--- MANIFEST ROW COUNT ---'
SELECT count(*) AS function_rows FROM _e0b_manifest;

\echo '--- AGGREGATE MANIFEST HASH (md5 over sorted per-row text) ---'
SELECT pg_catalog.md5(pg_catalog.string_agg(row_text, E'\n' ORDER BY row_text)) AS manifest_aggregate_md5
FROM (
  SELECT pg_catalog.concat_ws('|', schema_name, function_name, identity_args, owner, language,
           prokind, security_definer::text, volatility, is_strict::text, parallel,
           leakproof::text, returns_set::text, proconfig_sorted, acl_expanded_sorted,
           nargs::text, nargdefaults::text, full_args, result_type, argmodes, allargtypes,
           argtypes, rettype, prosrc_md5, prosrc_len::text, probin_md5, functiondef_md5) AS row_text
  FROM _e0b_manifest
) s;

\echo '--- MANIFEST ROWS (deterministic order) ---'
\pset format csv
SELECT * FROM _e0b_manifest ORDER BY schema_name, function_name, identity_args;
\pset format aligned
