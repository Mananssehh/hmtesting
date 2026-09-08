-- D5B Stage A - Migration 1 (FOUNDATION): additive duplicate-song foundation.
-- STAGED ONLY. Not applied to production.
--
-- ROLLOUT (strict, one migration per stage):
--   Stage B: convert and apply ONLY this file (01_d5b_foundation.sql).
--   Stage C: publish and verify the new RPC-based frontend.
--   Then wait one full measured frontend asset-cache lifetime.
--   Stage D: convert and apply ONLY 02_d5b_enforcement.sql.
-- Migration 2 must NEVER be applied during Stage B.
--
-- Additive only: no existing index, policy or grant is removed here.

set local lock_timeout = '5s';

-- 1. Provider-identity partial unique index over active statuses only.
create unique index if not exists song_requests_unique_active_provider
  on public.song_requests (
    event_id,
    lower(btrim(source_platform)),
    btrim(source_song_id)
  )
  where status in ('pending', 'approved', 'playing')
    and source_platform is not null
    and btrim(source_platform) <> ''
    and source_song_id is not null
    and btrim(source_song_id) <> '';

-- 2. Immutable identity columns (status/boost/queue_position/votes stay writable).
create or replace function public.song_requests_identity_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.event_id is distinct from old.event_id
     or new.requested_by is distinct from old.requested_by
     or new.source_platform is distinct from old.source_platform
     or new.source_song_id is distinct from old.source_song_id
     or new.created_at is distinct from old.created_at then
    raise exception 'song_request identity columns are immutable'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_song_requests_identity_immutable on public.song_requests;
create trigger trg_song_requests_identity_immutable
  before update on public.song_requests
  for each row execute function public.song_requests_identity_immutable();

-- 3. Atomic request/support boundary.
drop function if exists public.request_song(uuid, text, text, text, text, text, text, integer, text, boolean, text);

create function public.request_song(
  _event_id uuid,
  _source_platform text,
  _source_song_id text,
  _title text,
  _artist text,
  _album text default null,
  _album_art_url text default null,
  _duration_ms integer default null,
  _preview_url text default null,
  _explicit boolean default false,
  _external_url text default null
)
returns table (outcome text, request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _plat text;
  _sid text;
  _title_c text;
  _artist_c text;
  _ev public.events%rowtype;
  _existing public.song_requests%rowtype;
  _vote_value smallint;
  _new_id uuid;
  _nickname text := 'Guest';
  _attempt int := 0;
begin
  if _uid is null then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  -- Provider normalization -------------------------------------------------
  _plat := lower(btrim(coalesce(_source_platform, '')));
  if _plat in ('apple_music', 'itunes') then
    _plat := 'itunes';
  end if;
  _sid := btrim(coalesce(_source_song_id, ''));

  if _plat = 'spotify' then
    if _sid ~ '^[A-Za-z0-9]{22}$' then
      null;
    elsif _sid ~ '^spotify:track:[A-Za-z0-9]{22}$' then
      _sid := substring(_sid from 'spotify:track:([A-Za-z0-9]{22})$');
    elsif _sid ~ '^https?://open\.spotify\.com/track/[A-Za-z0-9]{22}([/?#].*)?$' then
      _sid := substring(_sid from 'track/([A-Za-z0-9]{22})');
    else
      return query select 'invalid_track'::text, null::uuid;
      return;
    end if;
  elsif _plat = 'itunes' then
    if _sid !~ '^[0-9]+$' then
      return query select 'invalid_track'::text, null::uuid;
      return;
    end if;
  else
    return query select 'invalid_track'::text, null::uuid;
    return;
  end if;

  _title_c := btrim(coalesce(_title, ''));
  _artist_c := btrim(coalesce(_artist, ''));
  if _title_c = '' or _artist_c = '' then
    return query select 'invalid_track'::text, null::uuid;
    return;
  end if;

  -- Event state + authorization -------------------------------------------
  select * into _ev from public.events e where e.id = _event_id for update;
  if not found then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  if _ev.dj_id <> _uid then
    if not exists (
      select 1 from public.event_participants p
      where p.event_id = _event_id and p.user_id = _uid
    ) or exists (
      select 1 from public.event_banned_guests b
      where b.event_id = _event_id and b.user_id = _uid
    ) then
      return query select 'unavailable'::text, null::uuid;
      return;
    end if;
  end if;

  -- Every non-usable event state collapses into the SAME generic outcome so the
  -- response never reveals whether an event exists, is ended, paused, inactive,
  -- or simply inaccessible to this caller.
  if not _ev.is_active
     or _ev.ended_at is not null
     or _ev.requests_status <> 'live' then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  if coalesce(_explicit, false) and not _ev.allow_explicit then
    return query select 'explicit_not_allowed'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.event_blocklist bl
    where bl.event_id = _event_id
      and (
        (bl.kind = 'artist' and public.normalize_text(bl.value) = public.normalize_text(_artist_c))
        or (bl.kind = 'song' and public.normalize_text(bl.value) = public.normalize_text(_title_c))
        or (bl.kind = 'keyword' and (
             public.normalize_text(_title_c) like '%' || public.normalize_text(bl.value) || '%'
             or public.normalize_text(_artist_c) like '%' || public.normalize_text(bl.value) || '%'
           ))
      )
  ) then
    return query select 'blocked'::text, null::uuid;
    return;
  end if;

  -- Find-or-create ---------------------------------------------------------
  loop
    _attempt := _attempt + 1;

    select * into _existing
    from public.song_requests sr
    where sr.event_id = _event_id
      and sr.status in ('pending', 'approved', 'playing')
      and lower(btrim(sr.source_platform)) = _plat
      and btrim(sr.source_song_id) = _sid
    limit 1
    for update;

    if found then
      select v.value into _vote_value
      from public.votes v
      where v.song_request_id = _existing.id and v.user_id = _uid
      for update;

      if not found then
        insert into public.votes (song_request_id, user_id, value)
        values (_existing.id, _uid, 1)
        on conflict (song_request_id, user_id) do update set value = 1;
        return query select 'supported_existing'::text, _existing.id;
      elsif _vote_value = 1 then
        return query select 'already_supported'::text, _existing.id;
      else
        update public.votes v set value = 1
        where v.song_request_id = _existing.id and v.user_id = _uid;
        return query select 'supported_existing'::text, _existing.id;
      end if;
      return;
    end if;

    if _attempt = 1 then
      -- Serialize this caller's new-request path for this event, then re-check.
      perform pg_advisory_xact_lock(hashtextextended(_uid::text || ':' || _event_id::text, 0));
      continue;
    end if;

    if _attempt > 4 then
      raise exception 'request_song could not resolve a concurrent duplicate; please retry'
        using errcode = '40001';
    end if;

    if _attempt = 2 then
      -- Cooldown applies only to genuinely new requests.
      if coalesce(_ev.cooldown_seconds, 0) > 0
         and public.recent_request_count(_event_id, _ev.cooldown_seconds) > 0 then
        return query select 'cooldown'::text, null::uuid;
        return;
      end if;

      select p.nickname into _nickname from public.profiles p where p.id = _uid;
      _nickname := coalesce(nullif(btrim(coalesce(_nickname, '')), ''), 'Guest');
    end if;

    insert into public.song_requests (
      event_id, requested_by, requester_name, title, artist,
      album, album_art, album_art_url, duration_ms, preview_url,
      explicit, source_platform, source_song_id, external_url
    )
    values (
      _event_id, _uid, _nickname, _title_c, _artist_c,
      _album, _album_art_url, _album_art_url, _duration_ms, _preview_url,
      coalesce(_explicit, false), _plat, _sid,
      nullif(btrim(coalesce(_external_url, '')), '')
    )
    on conflict (event_id, lower(btrim(source_platform)), btrim(source_song_id))
      where status in ('pending', 'approved', 'playing')
        and source_platform is not null
        and btrim(source_platform) <> ''
        and source_song_id is not null
        and btrim(source_song_id) <> ''
    do nothing
    returning id into _new_id;

    if _new_id is not null then
      insert into public.votes (song_request_id, user_id, value)
      values (_new_id, _uid, 1)
      on conflict (song_request_id, user_id) do update set value = 1;
      return query select 'created'::text, _new_id;
      return;
    end if;
  end loop;
end;
$$;

revoke all on function public.request_song(uuid, text, text, text, text, text, text, integer, text, boolean, text) from public;
revoke all on function public.request_song(uuid, text, text, text, text, text, text, integer, text, boolean, text) from anon;
grant execute on function public.request_song(uuid, text, text, text, text, text, text, integer, text, boolean, text) to authenticated;
grant execute on function public.request_song(uuid, text, text, text, text, text, text, integer, text, boolean, text) to service_role;
