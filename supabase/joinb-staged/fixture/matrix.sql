SELECT p.proname AS fn, r AS role, has_function_privilege(r, p.oid, 'EXECUTE') AS can_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
     unnest(array['anon','authenticated','service_role','postgres']) r
WHERE n.nspname = 'public' AND p.proname LIKE 'join_event_by_code%'
ORDER BY 1, 2;
SELECT p.oid::regprocedure AS sig, p.proacl AS acl, md5(p.prosrc) AS body_md5
FROM pg_proc p WHERE p.proname LIKE 'join_event_by_code%' ORDER BY 1;
