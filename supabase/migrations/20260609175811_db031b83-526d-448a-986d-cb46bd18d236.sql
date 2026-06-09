
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Rate limit logs
CREATE TABLE IF NOT EXISTS public.rate_limit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  ip text,
  endpoint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.rate_limit_logs TO service_role;
ALTER TABLE public.rate_limit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.rate_limit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS rate_limit_logs_user_created_idx ON public.rate_limit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rate_limit_logs_ip_created_idx ON public.rate_limit_logs (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS rate_limit_logs_endpoint_created_idx ON public.rate_limit_logs (endpoint, created_at DESC);

-- Song metadata cache
CREATE TABLE IF NOT EXISTS public.song_metadata (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  normalized_query text NOT NULL UNIQUE,
  title text,
  artist text,
  album text,
  duration_ms integer,
  explicit boolean NOT NULL DEFAULT false,
  album_art_url text,
  spotify_url text,
  apple_url text,
  provider_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);
GRANT ALL ON public.song_metadata TO service_role;
ALTER TABLE public.song_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.song_metadata FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS song_metadata_normalized_query_idx ON public.song_metadata (normalized_query);
CREATE INDEX IF NOT EXISTS song_metadata_cached_at_idx ON public.song_metadata (cached_at DESC);
CREATE INDEX IF NOT EXISTS song_metadata_expires_at_idx ON public.song_metadata (expires_at);
CREATE INDEX IF NOT EXISTS song_metadata_title_trgm_idx ON public.song_metadata USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS song_metadata_artist_trgm_idx ON public.song_metadata USING gin (artist gin_trgm_ops);
CREATE INDEX IF NOT EXISTS song_metadata_provider_ids_idx ON public.song_metadata USING gin (provider_ids);
