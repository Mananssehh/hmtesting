\set ON_ERROR_STOP on

\echo ''
\echo '=========== default privileges AFTER mitigation ==========='
select pg_get_userbyid(d.defaclrole) as role, coalesce(n.nspname,'(global)') as schema,
       d.defaclobjtype, d.defaclacl::text as acl
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
order by 1,2;

do $$
declare a text;
begin
  select defaclacl::text into a from pg_default_acl d
    join pg_namespace n on n.oid=d.defaclnamespace
   where n.nspname='public' and d.defaclobjtype='f' and pg_get_userbyid(d.defaclrole)='postgres';
  assert a not like '%anon=%', 'public default still grants anon: ' || a;
  assert a not like '%authenticated=%', 'public default still grants authenticated: ' || a;
  assert a like '%service_role=X%', 'service_role default unexpectedly changed: ' || a;
  raise notice 'DEFAULTS PASS: postgres/public defaults now {postgres,service_role} only';
end $$;

\echo ''
\echo '=========== CANARY B: after mitigation, NO explicit revocations ==========='
create function public.canary_b() returns int language sql immutable as $$ select 2 $$;
select proacl::text as canary_b_acl from pg_proc where oid='public.canary_b()'::regprocedure;
do $$
declare a text := (select proacl::text from pg_proc where oid='public.canary_b()'::regprocedure);
begin
  assert a not like '%anon=X%', 'B: named anon grant survived: ' || a;
  assert a not like '%authenticated=X%', 'B: named authenticated grant survived: ' || a;
  assert a like '{=X/%' or a like '%,=X/%', 'B: expected built-in PUBLIC grant in ACL: ' || a;
  assert has_function_privilege('anon','public.canary_b()','EXECUTE'), 'B: PUBLIC path unexpectedly closed';
  raise notice 'CANARY B PASS (residual, as designed): no named grants, but STILL EXECUTABLE THROUGH PUBLIC';
end $$;

\echo ''
\echo '=========== CANARY C: after mitigation + approved explicit revocations ==========='
create function public.canary_c() returns int language sql immutable as $$ select 3 $$;
revoke execute on function public.canary_c() from public, anon, authenticated;
do $$
begin
  assert not has_function_privilege('anon','public.canary_c()','EXECUTE'), 'C: anon still allowed';
  assert not has_function_privilege('authenticated','public.canary_c()','EXECUTE'), 'C: authenticated still allowed';
  assert has_function_privilege('postgres','public.canary_c()','EXECUTE'), 'C: owner lost EXECUTE';
  raise notice 'CANARY C PASS: explicit PUBLIC+anon+authenticated revocation => DENIED to clients, owner retained';
end $$;

\echo ''
\echo '=========== CANARY D: grant ONLY authenticated ==========='
grant execute on function public.canary_c() to authenticated;
do $$
declare r int;
begin
  assert has_function_privilege('authenticated','public.canary_c()','EXECUTE'), 'D: authenticated denied';
  assert not has_function_privilege('anon','public.canary_c()','EXECUTE'), 'D: anon leaked';
  assert not has_function_privilege('service_role','public.canary_c()','EXECUTE'), 'D: service_role leaked';
  -- harmless functional call as the approved role
  set role authenticated;
  select public.canary_c() into r;
  reset role;
  assert r = 3, 'D: function returned ' || r;
  raise notice 'CANARY D PASS: only authenticated gained EXECUTE and the call works (returned %)', r;
end $$;

\echo ''
\echo '=========== inherited-permission check (no role membership leaks) ==========='
do $$
declare denied int := 0; rl text;
begin
  foreach rl in array array['anon','service_role'] loop
    begin
      execute format('set role %I', rl);
      perform public.canary_c();
      reset role;
      raise exception 'INHERITANCE FAILURE: % executed canary_c', rl;
    exception when insufficient_privilege then reset role; denied := denied + 1;
    end;
  end loop;
  assert denied = 2, 'expected 2 denials, got ' || denied;
  assert not pg_has_role('anon','authenticated','USAGE'), 'anon is a member of authenticated';
  raise notice 'INHERITANCE PASS: no client role inherits the approved grant';
end $$;

\echo ''
\echo '=========== effective-privilege checker ==========='
-- canary_b is intentionally exposed through PUBLIC => the checker MUST reject.
do $$
begin
  perform public._e0b_assert_no_unapproved_client_execute();
  raise exception 'CHECKER FAILURE: it accepted an unapproved PUBLIC-executable function';
exception when raise_exception then
  if position('E0b check FAILED' in SQLERRM) = 0 then raise; end if;
  raise notice 'CHECKER REJECTION PASS: %', left(SQLERRM, 200);
end $$;

-- Close the residual the approved way, allowlist the approved exposure, re-run.
revoke execute on function public.canary_b() from public, anon, authenticated;
insert into public._e0b_client_exposed_allowlist (signature, allowed_grantees, reason)
values ('canary_c()', array['authenticated'], 'fixture: approved client RPC');
do $$
begin
  perform public._e0b_assert_no_unapproved_client_execute();
  raise notice 'CHECKER ACCEPT PASS: only allowlisted exposure remains';
end $$;

-- The checker reads the CATALOG, not SQL text: a function whose migration text
-- contains a REVOKE that was never effective must still be rejected.
create function public.canary_text_only() returns int language sql immutable as
$$ /* revoke execute on function public.canary_text_only() from public, anon, authenticated; */ select 4 $$;
do $$
begin
  perform public._e0b_assert_no_unapproved_client_execute();
  raise exception 'CHECKER FAILURE: text-only REVOKE comment was accepted';
exception when raise_exception then
  if position('E0b check FAILED' in SQLERRM) = 0 then raise; end if;
  raise notice 'CHECKER TEXT-PROOF PASS: catalog-based check rejected a REVOKE that exists only in SQL text';
end $$;
drop function public.canary_text_only();

\echo ''
\echo '=========== out-of-scope defaults untouched ==========='
do $$
declare a text;
begin
  select defaclacl::text into a from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace
   where n.nspname='storage' and d.defaclobjtype='f' and pg_get_userbyid(d.defaclrole)='postgres';
  assert a like '%anon=X%' and a like '%authenticated=X%', 'storage defaults were modified: ' || a;
  assert (select count(*) from pg_default_acl d
          join public._e0b_defacl_before b
            on b.role = pg_get_userbyid(d.defaclrole)
           and b.schema = coalesce((select nspname from pg_namespace where oid=d.defaclnamespace),'(global)')
          where b.acl is distinct from d.defaclacl::text
            and b.schema <> 'public') = 0, 'a default privilege outside public changed';
  raise notice 'OUT-OF-SCOPE PASS: storage (and every non-public) default privilege unchanged';
end $$;

\echo ''
\echo '=========== existing objects unchanged (ACL, owner, prosecdef, proconfig, body) ==========='
select b.sig, (p.proacl::text is not distinct from nullif(b.acl,'(default)')) as acl_same,
       (pg_get_userbyid(p.proowner)=b.owner) as owner_same,
       (p.prosecdef=b.prosecdef) as secdef_same,
       (coalesce(p.proconfig::text,'(null)')=b.proconfig) as proconfig_same,
       (md5(p.prosrc)=b.body_md5) as body_same
from public._e0b_before b
join pg_proc p on p.oid::regprocedure::text = b.sig
order by 1;

do $$
declare r record; n int := 0;
begin
  for r in select b.*, p.proacl::text acl_now, pg_get_userbyid(p.proowner) owner_now,
                  p.prosecdef secdef_now, coalesce(p.proconfig::text,'(null)') cfg_now, md5(p.prosrc) body_now
           from public._e0b_before b join pg_proc p on p.oid::regprocedure::text = b.sig
  loop
    assert r.acl_now is not distinct from nullif(r.acl,'(default)'), 'ACL changed: ' || r.sig;
    assert r.owner_now = r.owner, 'owner changed: ' || r.sig;
    assert r.secdef_now = r.prosecdef, 'prosecdef changed: ' || r.sig;
    assert r.cfg_now = r.proconfig, 'proconfig changed: ' || r.sig;
    assert r.body_now = r.body_md5, 'body changed: ' || r.sig;
    n := n + 1;
  end loop;
  assert n = (select count(*) from public._e0b_before), 'a pre-existing function disappeared';
  raise notice 'UNCHANGED PASS: all % pre-existing functions identical in ACL/owner/prosecdef/proconfig/body', n;
end $$;

do $$
begin
  assert (select proacl::text from pg_proc where oid='public.enqueue_email(text,jsonb)'::regprocedure)
         = '{postgres=X/postgres,service_role=X/postgres}', 'E0 wrapper ACL drifted';
  assert (select proacl::text from pg_proc where oid='public.email_queue_dispatch()'::regprocedure)
         = '{postgres=X/postgres}', 'E0 dispatch ACL drifted';
  raise notice 'E0 CONTAINMENT PASS: wrapper {postgres,service_role}, dispatch {postgres}';
end $$;

\echo ''
\echo '=========== ALL E0b FIXTURE TESTS PASSED ==========='
