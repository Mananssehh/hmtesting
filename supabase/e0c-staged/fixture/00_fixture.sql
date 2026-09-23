-- Disposable fixture: production-shaped signatures, flags and pre-migration ACLs.
create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant usage on schema public to anon, authenticated, service_role;
create table public.dj_tips (user_id uuid, event_id uuid, gross_amount_cents int, status text, created_at timestamptz default now(), checkout_expires_at timestamptz);
create table public.boost_purchases (user_id uuid, event_id uuid, amount_cents int, status text, created_at timestamptz default now());
create function public.check_tip_cap(_user_id uuid, _event_id uuid, _amount_cents integer) returns void
 language plpgsql security definer set search_path = public as $$
declare s int; begin
 if _user_id is null then raise exception 'User required' using errcode='22023'; end if;
 if _amount_cents > 5000 then raise exception 'Tip exceeds $50 single-tip limit' using errcode='22023'; end if;
 select coalesce(sum(gross_amount_cents),0) into s from public.dj_tips where user_id=_user_id and status='succeeded';
 if s + _amount_cents > 10000 then raise exception 'Daily tip limit reached ($100 / 24h)' using errcode='22023'; end if;
end $$;
create function public.check_boost_purchase_cap(_user_id uuid, _event_id uuid, _amount_cents integer) returns void
 language plpgsql stable security definer set search_path = public as $$
begin
 if _user_id is null then raise exception 'User required' using errcode='22023'; end if;
 if _amount_cents > 2000 then raise exception 'Purchase exceeds the $20 single-purchase limit' using errcode='22023'; end if;
 perform 1 from public.boost_purchases where user_id=_user_id;
end $$;
-- production pre-state: PUBLIC default + explicit anon/authenticated/service_role
grant execute on function public.check_tip_cap(uuid,uuid,integer) to anon, authenticated, service_role;
grant execute on function public.check_boost_purchase_cap(uuid,uuid,integer) to anon, authenticated, service_role;
create table public._before as select oid::regprocedure::text sig, md5(prosrc) body, proowner::regrole::text own, prosecdef, provolatile, proconfig::text cfg
 from pg_proc where proname in ('check_tip_cap','check_boost_purchase_cap');
