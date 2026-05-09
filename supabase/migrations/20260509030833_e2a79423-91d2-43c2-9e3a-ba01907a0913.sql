
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER TABLE public.now_playing
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_track_id text;

CREATE TABLE IF NOT EXISTS public.event_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'manual',
  ingest_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, source_type)
);

CREATE INDEX IF NOT EXISTS event_integrations_token_idx
  ON public.event_integrations (ingest_token);

ALTER TABLE public.event_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DJ views integrations"
  ON public.event_integrations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_integrations.event_id AND e.dj_id = auth.uid()));

CREATE POLICY "DJ inserts integrations"
  ON public.event_integrations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_integrations.event_id AND e.dj_id = auth.uid()));

CREATE POLICY "DJ updates integrations"
  ON public.event_integrations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_integrations.event_id AND e.dj_id = auth.uid()));

CREATE POLICY "DJ deletes integrations"
  ON public.event_integrations FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_integrations.event_id AND e.dj_id = auth.uid()));

DROP TRIGGER IF EXISTS event_integrations_updated_at ON public.event_integrations;
CREATE TRIGGER event_integrations_updated_at
  BEFORE UPDATE ON public.event_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
