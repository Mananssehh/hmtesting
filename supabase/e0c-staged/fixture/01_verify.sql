\set ON_ERROR_STOP 1
\echo '--- ACL after'
select oid::regprocedure sig, proacl from pg_proc where proname in ('check_tip_cap','check_boost_purchase_cap') order by 1;
\echo '--- effective EXECUTE matrix (expect tip: service_role only+postgres; boost: postgres only)'
select p.oid::regprocedure sig, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') can_exec
 from pg_proc p cross join (values ('anon'),('authenticated'),('service_role'),('postgres')) r(rolname)
 where p.proname in ('check_tip_cap','check_boost_purchase_cap') order by 1,2;
\echo '--- body/owner/flags unchanged (expect 2 rows, all t)'
select b.sig, md5(p.prosrc)=b.body body_same, p.proowner::regrole::text=b.own owner_same, p.prosecdef=b.prosecdef secdef_same,
 p.provolatile=b.provolatile vol_same, coalesce(p.proconfig::text,'')=coalesce(b.cfg,'') cfg_same
 from public._before b join pg_proc p on p.oid::regprocedure::text=b.sig;
\echo '--- no overloads (expect 2)'
select count(*) from pg_proc where proname in ('check_tip_cap','check_boost_purchase_cap');
do $$
declare r text; f text;
begin
 foreach r in array array['anon','authenticated'] loop
  foreach f in array array['check_tip_cap','check_boost_purchase_cap'] loop
   begin
     execute format('set local role %I', r);
     execute format('select public.%I(gen_random_uuid(), null, 100)', f);
     reset role; raise exception 'FAIL: % could call %', r, f;
   exception when insufficient_privilege then reset role; raise notice 'OK denied: % -> %', r, f; end;
  end loop;
 end loop;
 set local role service_role; perform public.check_tip_cap(gen_random_uuid(), null, 100); reset role;
 raise notice 'OK service_role called check_tip_cap';
 begin set local role service_role; perform public.check_boost_purchase_cap(gen_random_uuid(), null, 100); reset role;
   raise exception 'FAIL: service_role could call boost';
 exception when insufficient_privilege then reset role; raise notice 'OK denied: service_role -> check_boost_purchase_cap'; end;
 begin perform public.check_tip_cap(gen_random_uuid(), null, 9999); raise exception 'FAIL: cap not enforced';
 exception when sqlstate '22023' then raise notice 'OK cap logic intact for owner: %', sqlerrm; end;
end $$;
