-- Boost purchases ledger (for future Stripe; nothing writes here yet from the app)
CREATE TABLE public.boost_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id uuid,
  song_request_id uuid,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded','canceled')),
  stripe_payment_intent_id text,
  consent_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.boost_purchases TO authenticated;
GRANT ALL ON public.boost_purchases TO service_role;

ALTER TABLE public.boost_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own purchases"
  ON public.boost_purchases FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins view all purchases"
  ON public.boost_purchases FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Event DJs view event purchases"
  ON public.boost_purchases FOR SELECT
  TO authenticated
  USING (event_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = event_id AND e.dj_id = auth.uid()
  ));

CREATE INDEX idx_boost_purchases_user_created ON public.boost_purchases (user_id, created_at DESC);
CREATE INDEX idx_boost_purchases_event ON public.boost_purchases (event_id) WHERE event_id IS NOT NULL;

CREATE TRIGGER trg_boost_purchases_updated
  BEFORE UPDATE ON public.boost_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Server-side cap enforcement. Returns void on success, raises on cap hit.
-- Intended to be called by a future Stripe checkout edge function BEFORE
-- creating a PaymentIntent, AND inside any insert path into boost_purchases.
CREATE OR REPLACE FUNCTION public.check_boost_purchase_cap(
  _user_id uuid,
  _event_id uuid,
  _amount_cents integer
) RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _max_single_cents constant int := 2000;       -- $20
  _max_24h_cents    constant int := 5000;       -- $50
  _max_per_event    constant int := 10;
  _spent_24h int;
  _count_event int;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User required' USING ERRCODE = '22023';
  END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'Invalid purchase amount' USING ERRCODE = '22023';
  END IF;
  IF _amount_cents > _max_single_cents THEN
    RAISE EXCEPTION 'Purchase exceeds the $20 single-purchase limit' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0) INTO _spent_24h
  FROM public.boost_purchases
  WHERE user_id = _user_id
    AND status IN ('pending','succeeded')
    AND created_at > now() - interval '24 hours';

  IF _spent_24h + _amount_cents > _max_24h_cents THEN
    RAISE EXCEPTION 'Daily purchase limit reached ($50 / 24h)' USING ERRCODE = '22023';
  END IF;

  IF _event_id IS NOT NULL THEN
    SELECT COUNT(*) INTO _count_event
    FROM public.boost_purchases
    WHERE user_id = _user_id
      AND event_id = _event_id
      AND status IN ('pending','succeeded');
    IF _count_event >= _max_per_event THEN
      RAISE EXCEPTION 'Per-event purchase limit reached (10 boost purchases)' USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_boost_purchase_cap(uuid, uuid, integer) TO authenticated, service_role;