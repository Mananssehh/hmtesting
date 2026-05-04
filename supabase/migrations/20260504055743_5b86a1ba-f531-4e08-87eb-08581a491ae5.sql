CREATE TYPE public.error_severity AS ENUM ('critical', 'warning', 'info');

CREATE TABLE public.error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  severity public.error_severity NOT NULL DEFAULT 'warning',
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  context JSONB,
  stack TEXT,
  user_id UUID,
  route TEXT,
  user_agent TEXT,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_logs_severity_created ON public.error_logs (severity, created_at DESC);
CREATE INDEX idx_error_logs_reviewed ON public.error_logs (reviewed, created_at DESC);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Anyone can write errors (so unauthenticated crashes are captured)
CREATE POLICY "Anyone can insert error logs"
ON public.error_logs FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only DJs can read error logs
CREATE POLICY "DJs can view error logs"
ON public.error_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'dj'));

-- Only DJs can mark as reviewed
CREATE POLICY "DJs can update error logs"
ON public.error_logs FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'dj'));