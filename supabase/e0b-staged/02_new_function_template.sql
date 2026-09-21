-- E0b accompanying requirement 1: MANDATORY pattern for every NEW application
-- function in public. Creation and privilege closure happen in the SAME
-- transaction (a managed migration is one transaction), so the function is
-- never reachable by a client between CREATE and REVOKE.
--
-- Copy this block verbatim for each new function; replace the signature and the
-- approved grant list. If a function needs no client access, omit the GRANT.

CREATE OR REPLACE FUNCTION public.example_fn(_arg text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT _arg $$;

-- 1. Explicit revocation from every client-reachable grantee, always all three.
REVOKE EXECUTE ON FUNCTION public.example_fn(text) FROM PUBLIC, anon, authenticated;

-- 2. Only the approved grants (delete the line if no client access is approved).
GRANT EXECUTE ON FUNCTION public.example_fn(text) TO authenticated;
