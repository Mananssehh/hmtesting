
-- ============================================================
-- 1. reports
-- ============================================================
CREATE TABLE public.reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL,
  event_id     uuid NULL,
  target_type  text NOT NULL CHECK (target_type IN ('request','user','nickname')),
  target_id    uuid NOT NULL,
  reason       text NOT NULL CHECK (reason IN ('inappropriate','harassment','spam','copyright','other')),
  details      text NULL CHECK (details IS NULL OR length(details) <= 500),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  resolution   text NULL,
  resolved_at  timestamptz NULL,
  resolved_by  uuid NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reports_event_status_idx ON public.reports(event_id, status);
CREATE INDEX reports_target_idx ON public.reports(target_type, target_id);
CREATE INDEX reports_reporter_created_idx ON public.reports(reporter_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reporters view own reports"
  ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

CREATE POLICY "Event DJs view event reports"
  ON public.reports FOR SELECT TO authenticated
  USING (event_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = reports.event_id AND e.dj_id = auth.uid()
  ));

CREATE POLICY "Admins view all reports"
  ON public.reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated insert own reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Event DJs update event reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (event_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = reports.event_id AND e.dj_id = auth.uid()
  ));

CREATE POLICY "Admins update reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Rate-limit + resolution metadata trigger
CREATE OR REPLACE FUNCTION public.reports_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recent int;
BEGIN
  SELECT count(*) INTO _recent
  FROM public.reports
  WHERE reporter_id = NEW.reporter_id
    AND created_at > now() - interval '1 hour';
  IF _recent >= 10 THEN
    RAISE EXCEPTION 'Too many reports. Please try again later.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reports_before_insert
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.reports_before_insert();

CREATE OR REPLACE FUNCTION public.reports_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('resolved','dismissed') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.resolved_at := now();
    NEW.resolved_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reports_before_update
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.reports_before_update();

-- ============================================================
-- 2. purchase_consents
-- ============================================================
CREATE TABLE public.purchase_consents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  version      text NOT NULL,
  accepted_at  timestamptz NOT NULL DEFAULT now(),
  ip           inet NULL,
  user_agent   text NULL,
  UNIQUE (user_id, version)
);

CREATE INDEX purchase_consents_user_idx ON public.purchase_consents(user_id, accepted_at DESC);

GRANT SELECT, INSERT ON public.purchase_consents TO authenticated;
GRANT ALL ON public.purchase_consents TO service_role;

ALTER TABLE public.purchase_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own consents"
  ON public.purchase_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins view all consents"
  ON public.purchase_consents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own consents"
  ON public.purchase_consents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
