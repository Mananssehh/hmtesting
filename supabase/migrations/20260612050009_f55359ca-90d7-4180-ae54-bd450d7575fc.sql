
-- Tips pivot: raise caps to $50 single / $100 24h / $100 per event (sum-based)
CREATE OR REPLACE FUNCTION public.check_boost_purchase_cap(
  _user_id uuid,
  _event_id uuid,
  _amount_cents integer
) RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _max_single_cents constant int := 5000;   -- $50 single tip
  _max_24h_cents    constant int := 10000;  -- $100 / rolling 24h
  _max_event_cents  constant int := 10000;  -- $100 / event / user
  _spent_24h int;
  _spent_event int;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User required' USING ERRCODE = '22023';
  END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'Invalid purchase amount' USING ERRCODE = '22023';
  END IF;
  IF _amount_cents > _max_single_cents THEN
    RAISE EXCEPTION 'Purchase exceeds the $50 single-purchase limit' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0) INTO _spent_24h
  FROM public.boost_purchases
  WHERE user_id = _user_id
    AND status IN ('pending','succeeded')
    AND created_at > now() - interval '24 hours';

  IF _spent_24h + _amount_cents > _max_24h_cents THEN
    RAISE EXCEPTION 'Daily tip limit reached ($100 / 24h)' USING ERRCODE = '22023';
  END IF;

  IF _event_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount_cents), 0) INTO _spent_event
    FROM public.boost_purchases
    WHERE user_id = _user_id
      AND event_id = _event_id
      AND status IN ('pending','succeeded');
    IF _spent_event + _amount_cents > _max_event_cents THEN
      RAISE EXCEPTION 'Per-event tip limit reached ($100 / event)' USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$function$;

-- Future revenue/venue reporting view. Joins purchases to their event/DJ.
CREATE OR REPLACE VIEW public.tip_analytics AS
SELECT
  bp.id              AS purchase_id,
  bp.user_id         AS tipper_id,
  bp.event_id,
  e.dj_id            AS dj_id,
  bp.amount_cents,
  bp.status,
  bp.created_at      AS tipped_at
FROM public.boost_purchases bp
LEFT JOIN public.events e ON e.id = bp.event_id;

GRANT SELECT ON public.tip_analytics TO authenticated;
GRANT ALL    ON public.tip_analytics TO service_role;
