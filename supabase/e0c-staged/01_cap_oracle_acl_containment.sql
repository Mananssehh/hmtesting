-- E0c-1 Gate 1: cap-oracle ACL containment. STAGED ONLY — not in supabase/migrations/.
-- ACL-only. Changes no function body, owner, security mode or search_path.
-- Must be applied transactionally (SET LOCAL is ignored outside a transaction).
-- Forward-only: never restore EXECUTE to PUBLIC/anon/authenticated.
--
-- check_tip_cap: sole live caller is tip-create-checkout (service-role client).
-- check_boost_purchase_cap: no live caller; deliberately NO service_role grant.

SET LOCAL lock_timeout = '5s';

REVOKE EXECUTE ON FUNCTION public.check_tip_cap(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_tip_cap(uuid, uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_boost_purchase_cap(uuid, uuid, integer) FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
