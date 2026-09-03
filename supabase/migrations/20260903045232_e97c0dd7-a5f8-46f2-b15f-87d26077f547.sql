CREATE OR REPLACE FUNCTION public.tip_pending_is_live(_status text, _checkout_expires_at timestamptz, _created_at timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT _status = 'pending'
     AND COALESCE(_checkout_expires_at, _created_at + interval '24 hours') > now();
$$;