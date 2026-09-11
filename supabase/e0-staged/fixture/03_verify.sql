\set ON_ERROR_STOP on

\echo ''
\echo '=========== TEST 1: ACL matrix (post-migration) ==========='
select r.rolname as role, f.sig,
       has_function_privilege(r.rolname, f.sig, 'EXECUTE') as can_execute
from (values
  ('public.enqueue_email(text, jsonb)'),
  ('public.read_email_batch(text, integer, integer)'),
  ('public.delete_email(text, bigint)'),
  ('public.move_to_dlq(text, text, bigint, jsonb)'),
  ('public.email_queue_dispatch()'),
  ('public.email_queue_wake()')
) f(sig)
cross join (values ('anon'),('authenticated'),('service_role'),('postgres')) r(rolname)
order by f.sig, r.rolname;

do $$
declare wrappers text[] := array[
  'public.enqueue_email(text, jsonb)',
  'public.read_email_batch(text, integer, integer)',
  'public.delete_email(text, bigint)',
  'public.move_to_dlq(text, text, bigint, jsonb)'];
  dw text[] := array['public.email_queue_dispatch()','public.email_queue_wake()'];
  s text;
begin
  foreach s in array wrappers || dw loop
    assert has_function_privilege('anon', s, 'EXECUTE') = false, 'anon still has EXECUTE on ' || s;
    assert has_function_privilege('authenticated', s, 'EXECUTE') = false, 'authenticated still has EXECUTE on ' || s;
    assert has_function_privilege('postgres', s, 'EXECUTE') = true, 'postgres lost EXECUTE on ' || s;
  end loop;
  foreach s in array wrappers loop
    assert has_function_privilege('service_role', s, 'EXECUTE') = true, 'service_role lost EXECUTE on ' || s;
  end loop;
  foreach s in array dw loop
    assert has_function_privilege('service_role', s, 'EXECUTE') = false, 'service_role still has EXECUTE on ' || s;
  end loop;
  raise notice 'TEST 1 PASS: ACL matrix correct for all six functions';
end $$;

\echo '--- raw ACL after (must contain no PUBLIC "=X/" entry, no anon, no authenticated) ---'
select p.oid::regprocedure::text as sig, p.proacl::text as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('enqueue_email','read_email_batch','delete_email',
  'move_to_dlq','email_queue_dispatch','email_queue_wake') order by 1;

do $$
declare a text;
begin
  for a in select p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname in ('enqueue_email','read_email_batch','delete_email',
             'move_to_dlq','email_queue_dispatch','email_queue_wake')
  loop
    assert a not like '%{=X%' and a not like '%,=X%', 'surviving PUBLIC grant: ' || a;
    assert a not like '%anon=%', 'surviving anon grant: ' || a;
    assert a not like '%authenticated=%', 'surviving authenticated grant: ' || a;
  end loop;
  raise notice 'TEST 1b PASS: no surviving PUBLIC/anon/authenticated grant';
end $$;

\echo ''
\echo '=========== TEST 2: search_path + unchanged bodies ==========='
select p.oid::regprocedure::text as sig, p.proconfig::text as proconfig_after,
       md5(p.prosrc) as body_md5_after, b.body_md5 as body_md5_before,
       (md5(p.prosrc) = b.body_md5) as body_unchanged
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
join public._e0_before b on b.sig = p.oid::regprocedure::text
where n.nspname='public' order by 1;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure::text sig, p.proconfig, md5(p.prosrc) h, b.body_md5 bh
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           join public._e0_before b on b.sig = p.oid::regprocedure::text
           where n.nspname='public'
  loop
    assert r.proconfig @> array['search_path=""'], 'search_path not empty on ' || r.sig || ' -> ' || coalesce(r.proconfig::text,'(null)');
    assert r.h = r.bh, 'BODY CHANGED for ' || r.sig;
  end loop;
  raise notice 'TEST 2 PASS: all six have an empty search_path and byte-identical bodies';
end $$;

\echo ''
\echo '=========== TEST 3: anon/authenticated denied (no queue touched) ==========='
do $$
declare rl text; s text; denied int := 0;
begin
  foreach rl in array array['anon','authenticated'] loop
    foreach s in array array['enqueue','read','delete','dlq'] loop
      begin
        execute format('set role %I', rl);
        case s
          when 'enqueue' then perform public.enqueue_email('auth_emails','{"x":1}'::jsonb);
          when 'read'    then perform * from public.read_email_batch('auth_emails', 1, 30);
          when 'delete'  then perform public.delete_email('auth_emails', 1::bigint);
          when 'dlq'     then perform public.move_to_dlq('auth_emails','auth_emails_dlq',1::bigint,'{}'::jsonb);
        end case;
        reset role;
        raise exception 'SECURITY FAILURE: % could call %', rl, s;
      exception when insufficient_privilege then
        reset role;
        denied := denied + 1;
      end;
    end loop;
  end loop;
  assert denied = 8, 'expected 8 denials, got ' || denied;
  raise notice 'TEST 3 PASS: all 8 anon/authenticated wrapper calls denied (insufficient_privilege)';
end $$;

do $$
declare rl text; denied int := 0;
begin
  foreach rl in array array['anon','authenticated','service_role'] loop
    begin
      execute format('set role %I', rl);
      perform public.email_queue_dispatch();
      reset role;
      raise exception 'SECURITY FAILURE: % could call email_queue_dispatch()', rl;
    exception when insufficient_privilege then
      reset role; denied := denied + 1;
    end;
  end loop;
  assert denied = 3, 'expected 3 dispatch denials, got ' || denied;
  raise notice 'TEST 3b PASS: dispatch denied to anon, authenticated and service_role';
end $$;

\echo ''
\echo '=========== TEST 4: service_role functional path (synthetic queue) ==========='
do $$
declare id bigint; got record; n int; dlq_id bigint; deleted boolean;
begin
  set role service_role;
  -- enqueue
  id := public.enqueue_email('auth_emails', '{"to":"fixture@example.test","message_id":"m1"}'::jsonb);
  assert id is not null, 'enqueue returned null';
  -- read
  select * into got from public.read_email_batch('auth_emails', 10, 30) limit 1;
  assert got.msg_id = id, 'read did not return the enqueued message';
  assert got.message->>'message_id' = 'm1', 'payload mismatch';
  -- move to dlq
  dlq_id := public.move_to_dlq('auth_emails', 'auth_emails_dlq', got.msg_id, got.message);
  assert dlq_id is not null, 'move_to_dlq returned null';
  -- enqueue + delete
  id := public.enqueue_email('transactional_emails', '{"message_id":"m2"}'::jsonb);
  deleted := public.delete_email('transactional_emails', id);
  assert deleted, 'delete_email returned false';
  -- unknown queue auto-create behaviour unchanged
  id := public.enqueue_email('fixture_new_queue', '{"message_id":"m3"}'::jsonb);
  assert id is not null, 'auto-create-on-missing-queue behaviour changed';
  reset role;
  raise notice 'TEST 4 PASS: enqueue/read/delete/move_to_dlq all work as service_role under search_path=''''';
end $$;

\echo ''
\echo '=========== TEST 5: caller-controlled objects cannot shadow ==========='
do $$
declare id bigint; before_n int; after_n int;
begin
  set role service_role;
  create temp table q_auth_emails (msg_id bigint, message jsonb);
  execute 'create function pg_temp.send(text, jsonb) returns bigint language plpgsql as $f$ begin raise exception ''HIJACKED''; end $f$';
  select count(*) into before_n from pgmq.q_auth_emails;
  id := public.enqueue_email('auth_emails', '{"message_id":"shadow-test"}'::jsonb);
  select count(*) into after_n from pgmq.q_auth_emails;
  assert after_n = before_n + 1, 'message did not land in pgmq.q_auth_emails';
  assert exists (select 1 from pgmq.q_auth_emails where msg_id = id), 'row missing from real queue table';
  assert (select count(*) from pg_temp.q_auth_emails) = 0, 'shadow table was written to';
  reset role;
  raise notice 'TEST 5 PASS: temp/public shadow objects cannot hijack the schema-qualified pgmq calls';
end $$;

\echo ''
\echo '=========== TEST 6: trigger + cron + mocked net.http_post ==========='
select t.tgname, c.relname, t.tgenabled,
       (t.tgenabled = 'O') as enabled_origin
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where t.tgfoid = 'public.email_queue_wake()'::regprocedure and not t.tgisinternal
order by 1;

do $$
declare jobs int; job record; calls int;
begin
  delete from cron.job;
  delete from net.http_calls;
  -- synthetic enqueue as service_role fires the AFTER INSERT statement trigger
  set role service_role;
  perform public.enqueue_email('auth_emails', '{"message_id":"wake-test"}'::jsonb);
  reset role;

  select count(*) into jobs from cron.job where jobname = 'process-email-queue';
  assert jobs = 1, 'wake trigger scheduled ' || jobs || ' jobs (expected exactly 1)';
  select * into job from cron.job where jobname = 'process-email-queue';
  assert job.username = 'postgres', 'cron job owner is ' || job.username || ' (expected postgres)';
  assert job.command like '%public.email_queue_dispatch()%', 'unexpected cron command';

  -- a second enqueue must not create a duplicate job
  set role service_role;
  perform public.enqueue_email('auth_emails', '{"message_id":"wake-test-2"}'::jsonb);
  reset role;
  select count(*) into jobs from cron.job where jobname = 'process-email-queue';
  assert jobs = 1, 'duplicate cron job created';

  -- dispatch runs as postgres (as cron would) and reaches the MOCKED net.http_post
  perform public.email_queue_dispatch();
  select count(*) into calls from net.http_calls
    where url like '%/functions/v1/process-email-queue';
  assert calls >= 1, 'dispatch did not reach net.http_post';
  raise notice 'TEST 6 PASS: trigger enabled + fires, single cron job owned by postgres, dispatch reaches mocked net.http_post';
end $$;

\echo '--- mocked HTTP calls: URL + header KEY names only, no values recorded ---'
select url, header_keys from net.http_calls;

do $$
declare leaked int;
begin
  select count(*) into leaked from net.http_calls
    where url like '%FIXTURE-FAKE-SECRET%' or array_to_string(header_keys, ',') like '%FIXTURE-FAKE-SECRET%';
  assert leaked = 0, 'vault secret leaked into recorded call';
  raise notice 'TEST 6b PASS: vault secret / Authorization value never returned or recorded';
end $$;

\echo ''
\echo '=========== TEST 7: no external request was made ==========='
\echo 'net.http_post is a local fixture stub writing to net.http_calls; no network client exists in this cluster.'

\echo ''
\echo '=========== ALL FIXTURE TESTS PASSED ==========='
