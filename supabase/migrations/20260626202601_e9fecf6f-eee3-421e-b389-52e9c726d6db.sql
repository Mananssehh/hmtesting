
ALTER TABLE public.dj_tips
  ADD COLUMN IF NOT EXISTS stripe_charge_id text,
  ADD COLUMN IF NOT EXISTS refunded_amount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_id text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_dj_tips_stripe_charge_id
  ON public.dj_tips (stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;
