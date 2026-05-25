-- Tighten guest delete policy: pending only (kept as a defense-in-depth guard; primary path is the RPC)
DROP POLICY IF EXISTS "Users can delete their own pending requests" ON public.song_requests;

CREATE POLICY "Users can delete their own pending requests"
ON public.song_requests
FOR DELETE
TO authenticated
USING (
  auth.uid() = requested_by
  AND status = 'pending'::request_status
);

-- Allow the user to mark their own pending request as removed (soft-delete) so cooldown still applies
CREATE POLICY "Users can soft-remove their own pending requests"
ON public.song_requests
FOR UPDATE
TO authenticated
USING (
  auth.uid() = requested_by
  AND status = 'pending'::request_status
)
WITH CHECK (
  auth.uid() = requested_by
  AND status IN ('pending'::request_status, 'removed'::request_status)
);

-- Replace RPC: pending-only + soft-delete (preserves cooldown)
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

  IF _req.status <> 'pending'::request_status THEN
    RAISE EXCEPTION 'This request can''t be removed anymore';
  END IF;

  -- Refund +1 awarded on request creation (and any other positive points tied to it)
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

  -- Log boost refund entry if applicable
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

  -- Soft-delete: keep row so recent_request_count still enforces cooldown
  UPDATE public.song_requests
    SET status = 'removed'::request_status
    WHERE id = _song_request_id;
END;
$$;