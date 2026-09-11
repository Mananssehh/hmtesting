create table public._e0_before as
select p.oid::regprocedure::text as sig,
       p.proacl::text as acl,
       p.proconfig::text as proconfig,
       md5(p.prosrc) as body_md5,
       length(p.prosrc) as body_len
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('enqueue_email','read_email_batch','delete_email','move_to_dlq',
                    'email_queue_dispatch','email_queue_wake');

\echo '--- BEFORE: ACL / proconfig / body hash ---'
select sig, acl, coalesce(proconfig,'(null)') as proconfig, body_md5 from public._e0_before order by sig;

\echo '--- BEFORE: overload check (must be exactly 6 rows) ---'
select count(*) as function_count from public._e0_before;
