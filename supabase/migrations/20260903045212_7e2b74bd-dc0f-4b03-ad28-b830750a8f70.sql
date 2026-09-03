-- 1. Expiration column (exact Stripe session expires_at is stored by the checkout function)
ALTER TABLE public.dj_tips
  ADD COLUMN IF NOT EXISTS checkout_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS dj_tips_status_expires_idx
  ON public.dj_tips (status, checkout_expires_at);

CREATE INDEX IF NOT EXISTS dj_tips_user_created_idx
  ON public.dj_tips (user_id, created_at DESC);

-- 2. Status CHECK constraint. Values audited from every writing code path:
--    tip-create-checkout: pending
--    stripe-webhook: succeeded, pending, failed, refunded, partially_refunded, disputed
--    new: expired
ALTER TABLE public.dj_tips DROP CONSTRAINT IF EXISTS dj_tips_status_check;
ALTER TABLE public.dj_tips
  ADD CONSTRAINT dj_tips_status_check CHECK (
    status IN (
      'pending',
      'succeeded',
      'failed',
      'expired',
      'refunded',
      'partially_refunded',
      'disputed'
    )
  ) NOT VALID;

-- Validate only if existing data already complies (it does: pending/succeeded only).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.dj_tips
    WHERE status NOT IN ('pending','succeeded','failed','expired','refunded','partially_refunded','disputed')
  ) THEN
    ALTER TABLE public.dj_tips VALIDATE CONSTRAINT dj_tips_status_check;
  END IF;
END $$;

-- 3. Cap logic.
--    A pending tip is "live" only while its checkout session can still be paid.
--    Stripe sessions live at most 24h, so a pending row with no stored
--    expiry is treated as expired once it is older than 24h.
CREATE OR REPLACE FUNCTION public.tip_pending_is_live(_status text, _checkout_expires_at timestamptz, _created_at timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _status = 'pending'
     AND COALESCE(_checkout_expires_at, _created_at + interval '24 hours') > now();
$$;

CREATE OR REPLACE FUNCTION public.check_tip_cap(_user_id uuid, _event_id uuid, _amount_cents integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _max_single_cents constant int := 5000;   -- $50 single
  _max_24h_cents    constant int := 10000;  -- $100 / 24h
  _max_event_cents  constant int := 10000;  -- $100 / event / user
  _spent_24h int;
  _spent_event int;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User required' USING ERRCODE = '22023';
  END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'Invalid tip amount' USING ERRCODE = '22023';
  END IF;
  IF _amount_cents > _max_single_cents THEN
    RAISE EXCEPTION 'Tip exceeds $50 single-tip limit' USING ERRCODE = '22023';
  END IF;

  -- 24h cap: succeeded tips created in the last 24h, plus unexpired pending tips.
  SELECT COALESCE(SUM(gross_amount_cents),0) INTO _spent_24h
  FROM public.dj_tips
  WHERE user_id = _user_id
    AND (
      (status = 'succeeded' AND created_at > now() - interval '24 hours')
      OR public.tip_pending_is_live(status, checkout_expires_at, created_at)
    );
  IF _spent_24h + _amount_cents > _max_24h_cents THEN
    RAISE EXCEPTION 'Daily tip limit reached ($100 / 24h)' USING ERRCODE = '22023';
  END IF;

  -- Event cap: all succeeded tips for that event, plus unexpired pending tips.
  IF _event_id IS NOT NULL THEN
    SELECT COALESCE(SUM(gross_amount_cents),0) INTO _spent_event
    FROM public.dj_tips
    WHERE user_id = _user_id
      AND event_id = _event_id
      AND (
        status = 'succeeded'
        OR public.tip_pending_is_live(status, checkout_expires_at, created_at)
      );
    IF _spent_event + _amount_cents > _max_event_cents THEN
      RAISE EXCEPTION 'Per-event tip limit reached ($100 / event)' USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$$;

-- 4. Read-only reconciliation preview (dry run). Reports candidates only; mutates nothing.
CREATE OR REPLACE FUNCTION public.tip_reconciliation_preview()
RETURNS TABLE(bucket text, tip_count bigint, total_cents bigint, oldest timestamptz, newest timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN public.tip_pending_is_live(status, checkout_expires_at, created_at) THEN 'pending_live'
      ELSE 'pending_stale_candidate'
    END AS bucket,
    count(*), COALESCE(SUM(gross_amount_cents),0)::bigint, min(created_at), max(created_at)
  FROM public.dj_tips
  WHERE status = 'pending'
  GROUP BY 1
$$;

REVOKE ALL ON FUNCTION public.tip_reconciliation_preview() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tip_reconciliation_preview() TO service_role;
