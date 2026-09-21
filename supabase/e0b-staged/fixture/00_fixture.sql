-- Disposable local fixture reproducing the production default-privilege surface
-- for role postgres in schema public (and storage, as an out-of-scope control).
-- No production data, no queue, no secret, no network.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema storage;
grant usage on schema public, storage to anon, authenticated, service_role;

-- Production-observed default privileges for role postgres:
--   public : {postgres=X,anon=X,authenticated=X,service_role=X}
--   storage: {postgres=X,anon=X,authenticated=X,service_role=X}   (OUT OF SCOPE)
alter default privileges for role postgres in schema public
  grant execute on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema storage
  grant execute on functions to postgres, anon, authenticated, service_role;

-- A stand-in "existing" function set that must remain byte-identical and
-- ACL-identical across the mitigation, including an E0-style contained pair.
create function public.existing_open(a int) returns int language sql immutable as $$ select a $$;

create function public.enqueue_email(queue_name text, payload jsonb) returns bigint
  language plpgsql security definer set search_path to '' as $$ begin return 1; end $$;
create function public.email_queue_dispatch() returns void
  language plpgsql security definer set search_path to '' as $$ begin end $$;
revoke execute on function public.enqueue_email(text, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_email(text, jsonb) to postgres, service_role;
revoke execute on function public.email_queue_dispatch() from public, anon, authenticated, service_role;
grant execute on function public.email_queue_dispatch() to postgres;

-- Fixture's OWN baseline (it does not and must not reproduce the production
-- fingerprint): signature, owner, prosecdef, proconfig, ACL and body hash.
create table public._e0b_before as
select p.oid::regprocedure::text as sig,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef,
       coalesce(p.proconfig::text,'(null)') as proconfig,
       coalesce(p.proacl::text,'(default)') as acl,
       md5(p.prosrc) as body_md5
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';

create table public._e0b_defacl_before as
select pg_get_userbyid(d.defaclrole) as role, coalesce(n.nspname,'(global)') as schema,
       d.defaclobjtype, d.defaclacl::text as acl
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace;

\echo '--- fixture BEFORE: default privileges ---'
select * from public._e0b_defacl_before order by 1,2;
\echo '--- fixture BEFORE: function baseline ---'
select sig, owner, prosecdef, proconfig, acl from public._e0b_before order by 1;
