
ALTER TABLE public.dj_tips
  ADD COLUMN IF NOT EXISTS song_request_id uuid REFERENCES public.song_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS song_title text,
  ADD COLUMN IF NOT EXISTS artist text,
  ADD COLUMN IF NOT EXISTS guest_nickname text;

CREATE INDEX IF NOT EXISTS idx_dj_tips_song_request ON public.dj_tips(song_request_id);
CREATE INDEX IF NOT EXISTS idx_dj_tips_event_status ON public.dj_tips(event_id, status);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dj_tips;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END$$;

ALTER TABLE public.dj_tips REPLICA IDENTITY FULL;
