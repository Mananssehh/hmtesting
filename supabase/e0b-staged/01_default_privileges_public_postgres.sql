-- E0b Gate 1 (REVISED SCOPE - Option 1, bounded mitigation). STAGED, NOT APPLIED.
--
-- Removes the automatic NAMED anon/authenticated EXECUTE grants that the
-- public-schema default-privilege entry for role postgres currently attaches to
-- every newly created function in public.
--
-- PUBLIC is deliberately NOT listed: this is a schema-specific entry, which can
-- only ADD to the built-in global baseline, never SUBTRACT from it. Listing
-- PUBLIC here would be misleading - it would not remove the built-in global
-- PUBLIC EXECUTE that still applies to new functions.
--
-- Scope: role postgres, schema public, functions only. Nothing else.
-- Forward-only: never restore automatic EXECUTE for PUBLIC, anon or authenticated.

SET LOCAL lock_timeout = '5s';

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
