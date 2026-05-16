
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_public_profile(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p public.profiles;
  _is_dj boolean;
  _requests int := 0;
  _upvotes int := 0;
  _downvotes int := 0;
  _boosts int := 0;
  _events int := 0;
  _top jsonb := NULL;
  _recent jsonb := '[]'::jsonb;
  _rank int := NULL;
BEGIN
  SELECT * INTO _p FROM public.profiles WHERE id = _user_id;
  IF _p.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'dj') INTO _is_dj;

  IF _p.is_public = false AND (auth.uid() IS NULL OR auth.uid() <> _user_id) THEN
    RETURN jsonb_build_object(
      'found', true,
      'is_public', false,
      'nickname', _p.nickname,
      'is_dj', _is_dj
    );
  END IF;

  SELECT
    count(*),
    coalesce(sum(upvotes),0),
    coalesce(sum(downvotes),0),
    coalesce(sum(boost),0)
  INTO _requests, _upvotes, _downvotes, _boosts
  FROM public.song_requests WHERE requested_by = _user_id;

  SELECT count(DISTINCT event_id) INTO _events
  FROM public.event_participants WHERE user_id = _user_id;

  SELECT to_jsonb(t) INTO _top FROM (
    SELECT id, title, artist, album_art, upvotes, downvotes, boost
    FROM public.song_requests
    WHERE requested_by = _user_id
    ORDER BY (upvotes - downvotes + boost) DESC, created_at DESC
    LIMIT 1
  ) t;

  SELECT coalesce(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb) INTO _recent FROM (
    SELECT id, title, artist, album_art, upvotes, downvotes, boost, status::text, created_at, event_id
    FROM public.song_requests
    WHERE requested_by = _user_id
    ORDER BY created_at DESC
    LIMIT 10
  ) t;

  SELECT 1 + count(*) INTO _rank
  FROM public.profiles WHERE points > _p.points AND is_public = true;

  RETURN jsonb_build_object(
    'found', true,
    'is_public', true,
    'user_id', _p.id,
    'nickname', _p.nickname,
    'points', _p.points,
    'is_dj', _is_dj,
    'rank', _rank,
    'created_at', _p.created_at,
    'total_requests', _requests,
    'total_upvotes', _upvotes,
    'total_downvotes', _downvotes,
    'total_boosts', _boosts,
    'events_joined', _events,
    'top_song', _top,
    'recent_songs', _recent
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profile(uuid) TO anon, authenticated;
