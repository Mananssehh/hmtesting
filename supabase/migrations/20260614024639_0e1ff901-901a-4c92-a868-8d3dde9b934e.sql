
-- DJ payout (Stripe Connect Express) accounts
CREATE TABLE public.dj_payout_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id text UNIQUE NOT NULL,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  livemode boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dj_payout_accounts TO authenticated;
GRANT ALL ON public.dj_payout_accounts TO service_role;

ALTER TABLE public.dj_payout_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DJ reads own payout account"
  ON public.dj_payout_accounts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_dj_payout_accounts_updated_at
  BEFORE UPDATE ON public.dj_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tips paid via Stripe Connect destination charges
CREATE TABLE public.dj_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,            -- tipper
  dj_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,              -- recipient DJ
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  gross_amount_cents integer NOT NULL CHECK (gross_amount_cents > 0),
  platform_fee_cents integer NOT NULL CHECK (platform_fee_cents >= 0),
  net_amount_cents integer NOT NULL CHECK (net_amount_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending', -- pending | succeeded | failed | refunded | disputed
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  stripe_destination_account text,
  livemode boolean NOT NULL DEFAULT false,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dj_tips_dj_id ON public.dj_tips(dj_id, created_at DESC);
CREATE INDEX idx_dj_tips_user_id ON public.dj_tips(user_id, created_at DESC);
CREATE INDEX idx_dj_tips_event_id ON public.dj_tips(event_id, created_at DESC);
CREATE INDEX idx_dj_tips_user_24h ON public.dj_tips(user_id, created_at)
  WHERE status IN ('pending','succeeded');

GRANT SELECT ON public.dj_tips TO authenticated;
GRANT ALL ON public.dj_tips TO service_role;

ALTER TABLE public.dj_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DJ sees received tips"
  ON public.dj_tips FOR SELECT
  TO authenticated
  USING (dj_id = auth.uid());

CREATE POLICY "Tipper sees own tips"
  ON public.dj_tips FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_dj_tips_updated_at
  BEFORE UPDATE ON public.dj_tips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Server-side tip cap check (combined boost_purchases + dj_tips)
CREATE OR REPLACE FUNCTION public.check_tip_cap(_user_id uuid, _event_id uuid, _amount_cents integer)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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

  SELECT COALESCE(SUM(gross_amount_cents),0) INTO _spent_24h
  FROM public.dj_tips
  WHERE user_id = _user_id
    AND status IN ('pending','succeeded')
    AND created_at > now() - interval '24 hours';
  IF _spent_24h + _amount_cents > _max_24h_cents THEN
    RAISE EXCEPTION 'Daily tip limit reached ($100 / 24h)' USING ERRCODE = '22023';
  END IF;

  IF _event_id IS NOT NULL THEN
    SELECT COALESCE(SUM(gross_amount_cents),0) INTO _spent_event
    FROM public.dj_tips
    WHERE user_id = _user_id
      AND event_id = _event_id
      AND status IN ('pending','succeeded');
    IF _spent_event + _amount_cents > _max_event_cents THEN
      RAISE EXCEPTION 'Per-event tip limit reached ($100 / event)' USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$$;
