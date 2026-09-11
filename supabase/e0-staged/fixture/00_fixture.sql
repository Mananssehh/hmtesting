-- Disposable local fixture reproducing the production email-queue surface.
-- Stubs pgmq, cron, net and vault. No real queue, secret, HTTP call or email.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema pgmq;
create schema cron;
create schema net;
create schema vault;
grant usage on schema public, pgmq, cron, net, vault to anon, authenticated, service_role;

-- ---------------------------------------------------------------- pgmq stub
create table pgmq.q_auth_emails (
  msg_id bigserial primary key,
  read_ct int not null default 0,
  enqueued_at timestamptz not null default now(),
  vt timestamptz not null default now(),
  message jsonb
);
create table pgmq.q_transactional_emails (like pgmq.q_auth_emails including all);
alter table pgmq.q_transactional_emails alter column msg_id set default nextval('pgmq.q_auth_emails_msg_id_seq');

create function pgmq.create(queue_name text) returns void language plpgsql as $$
begin
  execute format('create table if not exists pgmq.%I (like pgmq.q_auth_emails including all)', 'q_' || queue_name);
end $$;

create function pgmq.send(queue_name text, msg jsonb) returns bigint language plpgsql as $$
declare id bigint;
begin
  execute format('insert into pgmq.%I (message) values ($1) returning msg_id', 'q_' || queue_name)
    into id using msg;
  return id;
end $$;

create function pgmq.read(queue_name text, vt int, qty int)
returns table(msg_id bigint, read_ct int, enqueued_at timestamptz, vt_at timestamptz, message jsonb)
language plpgsql as $$
begin
  return query execute format(
    'update pgmq.%I set read_ct = read_ct + 1 where msg_id in (select msg_id from pgmq.%I order by msg_id limit $1) returning msg_id, read_ct, enqueued_at, vt, message',
    'q_' || queue_name, 'q_' || queue_name) using qty;
end $$;

create function pgmq.delete(queue_name text, message_id bigint) returns boolean language plpgsql as $$
declare n int;
begin
  execute format('delete from pgmq.%I where msg_id = $1', 'q_' || queue_name) using message_id;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ---------------------------------------------------------------- cron stub
create table cron.job (
  jobid bigserial primary key,
  jobname text unique,
  schedule text,
  command text,
  username text not null default current_user,
  active boolean not null default true
);
create function cron.schedule(job_name text, sched text, cmd text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command, username)
  values (job_name, sched, cmd, current_user) returning jobid;
$$;
create function cron.unschedule(job_name text) returns boolean language sql as $$
  delete from cron.job where jobname = job_name; select true;
$$;

-- ----------------------------------------------------------------- net stub
create table net.http_calls (id bigserial primary key, url text, header_keys text[], called_at timestamptz default now());
create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}')
returns bigint language sql as $$
  -- Records only the URL and header KEY names. Never stores header values,
  -- so the Authorization bearer / vault secret cannot leak into the fixture.
  insert into net.http_calls (url, header_keys)
  values (url, (select array_agg(k order by k) from jsonb_object_keys(headers) k))
  returning id;
$$;

-- --------------------------------------------------------------- vault stub
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values ('email_queue_service_role_key', 'FIXTURE-FAKE-SECRET');

-- ------------------------------------------------------- app table (public)
create table public.email_send_state (id int primary key, retry_after_until timestamptz);
insert into public.email_send_state values (1, null);
