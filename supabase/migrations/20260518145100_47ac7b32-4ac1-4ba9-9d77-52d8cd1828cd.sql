
ALTER TABLE public.song_requests
  ADD COLUMN IF NOT EXISTS played_at timestamptz,
  ADD COLUMN IF NOT EXISTS played_by_source text;

ALTER TABLE public.now_playing
  ADD COLUMN IF NOT EXISTS now_playing_request_id uuid;

CREATE INDEX IF NOT EXISTS idx_song_requests_event_status
  ON public.song_requests (event_id, status);
