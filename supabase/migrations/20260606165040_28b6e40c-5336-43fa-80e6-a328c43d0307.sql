ALTER TABLE public.now_playing
  ADD COLUMN IF NOT EXISTS apple_url text,
  ADD COLUMN IF NOT EXISTS spotify_url text;