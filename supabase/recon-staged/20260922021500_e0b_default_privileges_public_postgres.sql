-- E0b reconciliation candidate. STAGED ONLY — not placed in supabase/migrations/.
--
-- Idempotent restatement of the E0b control already live in production
-- (applied 2026-09-21 21:09 UTC via the Drizzle channel). This file exists so
-- the canonical Supabase history can reproduce E0b on a fresh rebuild.
--
-- Registration method: `supabase migration repair --status applied <version>`
-- records the version WITHOUT executing this SQL. Production must NOT re-run it.
--
-- PUBLIC is deliberately omitted: a schema-specific REVOKE cannot subtract the
-- built-in global PUBLIC EXECUTE default.

SET LOCAL lock_timeout = '5s';

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
