-- Add 'refunded' to point_tx_type enum if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'point_tx_type' AND e.enumlabel = 'refunded'
  ) THEN
    ALTER TYPE public.point_tx_type ADD VALUE 'refunded';
  END IF;
END $$;

-- Allow guests to delete their own song requests when not yet playing/played/skipped
CREATE POLICY "Users can delete their own pending requests"
ON public.song_requests
FOR DELETE
TO authenticated
USING (
  auth.uid() = requested_by
  AND status IN ('pending'::request_status, 'approved'::request_status)
);

-- RPC: remove own request with point/boost refund
CREATE OR REPLACE FUNCTION public.remove_my_song_request(_song_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req public.song_requests;
  _earned int := 0;
  _had_boost boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _req FROM public.song_requests WHERE id = _song_request_id FOR UPDATE;
  IF _req.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF _req.requested_by IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'You can only remove your own requests';
  END IF;

  IF _req.status NOT IN ('pending'::request_status, 'approved'::request_status) THEN
    RAISE EXCEPTION 'This request can''t be removed anymore';
  END IF;

  -- Refund the +1 awarded when the request was created (and any other earned points tied to it)
  SELECT COALESCE(SUM(pt.amount), 0) INTO _earned
  FROM public.points_transactions pt
  WHERE pt.song_request_id = _song_request_id
    AND pt.user_id = _uid
    AND pt.amount > 0;

  IF _earned > 0 THEN
    PERFORM public.award_points(
      _uid, _req.event_id, -_earned,
      'refunded'::public.point_tx_type,
      'Request removed by user',
      _song_request_id, _uid
    );
  END IF;

  -- If the user had boosted this song, log a refunded boost entry
  SELECT EXISTS(
    SELECT 1 FROM public.points_transactions pt
    WHERE pt.song_request_id = _song_request_id
      AND pt.user_id = _uid
      AND pt.reason = 'Boost (credits)'
  ) INTO _had_boost;

  IF _had_boost THEN
    INSERT INTO public.points_transactions
      (user_id, event_id, song_request_id, amount, type, reason, created_by)
    VALUES
      (_uid, _req.event_id, _song_request_id, 0, 'refunded', 'Request removed by user', _uid);
  END IF;

  DELETE FROM public.song_requests WHERE id = _song_request_id;
END;
$$;