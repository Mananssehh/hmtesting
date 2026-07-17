
-- 1. app_config table
CREATE TABLE public.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_config TO anon, authenticated;
GRANT ALL ON public.app_config TO service_role;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_config readable by everyone"
  ON public.app_config FOR SELECT
  TO anon, authenticated
  USING (true);

-- Seed
INSERT INTO public.app_config (key, value) VALUES
  ('guest_join_limits', '{"enabled": true, "prompt_at": 3, "require_at": 4, "bonus_points": 25}'::jsonb);

-- 2. RPCs
CREATE OR REPLACE FUNCTION public.get_guest_join_limits()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.app_config WHERE key = 'guest_join_limits'
$$;

GRANT EXECUTE ON FUNCTION public.get_guest_join_limits() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_guest_event_count()
RETURNS int
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(count(DISTINCT event_id), 0)::int
  FROM public.event_participants
  WHERE user_id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.get_guest_event_count() TO anon, authenticated;

-- 3. Funnel analytics table
CREATE TABLE public.guest_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX guest_funnel_events_user_idx ON public.guest_funnel_events (user_id, created_at DESC);
CREATE INDEX guest_funnel_events_type_idx ON public.guest_funnel_events (event_type, created_at DESC);

GRANT SELECT, INSERT ON public.guest_funnel_events TO authenticated;
GRANT ALL ON public.guest_funnel_events TO service_role;

ALTER TABLE public.guest_funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own funnel events"
  ON public.guest_funnel_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view funnel events"
  ON public.guest_funnel_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dj'));
