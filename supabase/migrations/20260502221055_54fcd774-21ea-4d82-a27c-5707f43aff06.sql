-- Phase 4: extra song metadata + queue ordering
ALTER TABLE public.song_requests
  ADD COLUMN IF NOT EXISTS album text,
  ADD COLUMN IF NOT EXISTS album_art_url text,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS preview_url text,
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS source_song_id text,
  ADD COLUMN IF NOT EXISTS explicit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS queue_position double precision;

-- Add ended_at on events for archive summary
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ended_at timestamptz;

-- Auto-stamp ended_at when status changes to ended
CREATE OR REPLACE FUNCTION public.set_event_ended_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.requests_status = 'ended' AND (OLD.requests_status IS DISTINCT FROM 'ended') THEN
    NEW.ended_at := now();
  ELSIF NEW.requests_status <> 'ended' THEN
    NEW.ended_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_event_ended_at ON public.events;
CREATE TRIGGER trg_set_event_ended_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.set_event_ended_at();

CREATE INDEX IF NOT EXISTS idx_song_requests_event_queue_pos
  ON public.song_requests (event_id, queue_position);