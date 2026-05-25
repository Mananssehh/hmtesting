-- 1. Unique constraint: one now_playing row per event
-- Dedupe defensively: keep most recently updated row per event
DELETE FROM public.now_playing a
USING public.now_playing b
WHERE a.event_id = b.event_id
  AND a.updated_at < b.updated_at;

ALTER TABLE public.now_playing
  ADD CONSTRAINT now_playing_event_id_unique UNIQUE (event_id);

-- 2. Rate-limit tracking for bridge pairing attempts (per IP)
CREATE TABLE public.bridge_pair_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bridge_pair_attempts_ip_time
  ON public.bridge_pair_attempts (ip, attempted_at DESC);

ALTER TABLE public.bridge_pair_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (edge function) reads/writes this table.