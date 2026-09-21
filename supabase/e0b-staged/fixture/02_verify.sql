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
  -- service_role retains EXECUTE from the UNCHANGED service_role default grant,
  -- which this mitigation deliberately does not touch (no dependency review).
  assert has_function_privilege('service_role','public.canary_c()','EXECUTE'), 'D: service_role default grant changed';
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
  foreach rl in array array['anon'] loop
    begin
      execute format('set role %I', rl);
      perform public.canary_c();
      reset role;
      raise exception 'INHERITANCE FAILURE: % executed canary_c', rl;
    exception when insufficient_privilege then reset role; denied := denied + 1;
    end;
  end loop;
  assert denied = 1, 'expected 1 denial, got ' || denied;
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
values ('public.canary_c()', array['authenticated'], 'fixture: approved client RPC'),
       ('public.canary_a()', array['anon','authenticated'], 'fixture: pre-existing exposure, unchanged'),
       ('public.existing_open(integer)', array['public','anon','authenticated'], 'fixture: pre-existing exposure, unchanged');
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
\echo '=========== CANARY E: EXECUTE reachable ONLY via ROLE INHERITANCE ==========='
-- No direct anon/authenticated grant, no PUBLIC grant: the only path is
-- membership of anon in an intermediate role that holds EXECUTE. The previous
-- proacl-only checker MISSED this; the corrected has_function_privilege()
-- checker must catch it.
create role app_reader nologin;
create function public.canary_e() returns int language sql immutable as $$ select 5 $$;
revoke execute on function public.canary_e() from public, anon, authenticated;
grant execute on function public.canary_e() to app_reader;
grant app_reader to anon;

select proacl::text as canary_e_acl from pg_proc where oid='public.canary_e()'::regprocedure;

do $$
declare a text := (select proacl::text from pg_proc where oid='public.canary_e()'::regprocedure);
begin
  -- Precondition: the ACL contains NO anon/authenticated/PUBLIC entry at all.
  assert a not like '%anon=%', 'E: unexpected direct anon entry: ' || a;
  assert a not like '%authenticated=%', 'E: unexpected direct authenticated entry: ' || a;
  assert a not like '{=X/%' and a not like '%,=X/%', 'E: unexpected PUBLIC entry: ' || a;
  -- But the privilege IS effectively held, through membership.
  assert has_function_privilege('anon','public.canary_e()','EXECUTE'),
    'E: fixture failed to create an inherited EXECUTE path';
  raise notice 'CANARY E SETUP: no direct/PUBLIC ACL entry, yet anon HOLDS EXECUTE via app_reader';
end $$;

-- Proof the OLD (proacl-only) logic would have MISSED it.
do $$
declare missed boolean;
begin
  select not exists (
    select 1 from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.canary_e()'::regprocedure
      and a.privilege_type = 'EXECUTE'
      and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon','authenticated'))
  ) into missed;
  assert missed, 'E: old proacl-only logic would have caught it (fixture invalid)';
  raise notice 'CANARY E: confirmed the retired proacl-only check would have MISSED this exposure';
end $$;

-- The corrected checker MUST reject it.
do $$
begin
  perform public._e0b_assert_no_unapproved_client_execute();
  raise exception 'CHECKER FAILURE: inherited-role EXECUTE was accepted';
exception when raise_exception then
  if position('E0b check FAILED' in SQLERRM) = 0 then raise; end if;
  if position('canary_e' in SQLERRM) = 0 then
    raise exception 'CHECKER FAILURE: rejection did not name canary_e: %', SQLERRM;
  end if;
  raise notice 'CANARY E PASS (inherited): corrected checker rejected -> %', left(SQLERRM, 200);
end $$;

-- Remove the inheritance path; the checker must accept again.
revoke app_reader from anon;
do $$
begin
  assert not has_function_privilege('anon','public.canary_e()','EXECUTE'), 'E: inheritance not removed';
  perform public._e0b_assert_no_unapproved_client_execute();
  raise notice 'CANARY E CLEANUP PASS: inheritance removed, checker accepts again';
end $$;
drop function public.canary_e();
drop role app_reader;

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
