\set ON_ERROR_STOP on

-- CANARY A (BEFORE mitigation): create a function, revoke ONLY from PUBLIC.
-- It must STILL be executable by anon/authenticated through the NAMED default
-- grants. This reproduces the exact failure mode behind the E0 incident.
create function public.canary_a() returns int language sql immutable as $$ select 1 $$;
revoke execute on function public.canary_a() from public;

\echo '--- canary A ACL (named anon/authenticated grants present) ---'
select proacl::text from pg_proc where oid = 'public.canary_a()'::regprocedure;

do $$
begin
  assert has_function_privilege('anon','public.canary_a()','EXECUTE'), 'A: anon unexpectedly denied';
  assert has_function_privilege('authenticated','public.canary_a()','EXECUTE'), 'A: authenticated unexpectedly denied';
  assert (select proacl::text from pg_proc where oid='public.canary_a()'::regprocedure) like '%anon=X%',
    'A: expected a NAMED anon grant from default privileges';
  raise notice 'CANARY A PASS (reproduces E0 failure): revoking only PUBLIC leaves anon+authenticated ALLOWED';
end $$;
