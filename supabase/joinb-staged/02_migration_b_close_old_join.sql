-- DECKS join boundary — Migration B: close direct access to the old join function.
-- STAGED ONLY. Apply only after Migration A, the new join-event deploy, controlled
-- test R1, human approval, and M0 channel selection. Body unchanged; ACL only.
-- Result: old function is owner-only (postgres). Forward-only; do not re-grant.
BEGIN;
SET LOCAL lock_timeout = '5s';

REVOKE EXECUTE ON FUNCTION public.join_event_by_code(text, text)
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
