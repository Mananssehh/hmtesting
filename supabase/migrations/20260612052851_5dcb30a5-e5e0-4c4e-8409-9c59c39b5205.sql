
-- 1. Column-level lockdown on profiles
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, nickname, is_public, created_at, updated_at) ON public.profiles TO anon, authenticated;
-- Owner still needs to read points / is_premium via the RPC below.
GRANT ALL ON public.profiles TO service_role;

-- 2. Owner-only RPC returning the full profile row (including points/is_premium)
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _p public.profiles;
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO _p FROM public.profiles WHERE id = _uid;
  IF _p.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', _p.id,
    'nickname', _p.nickname,
    'points', _p.points,
    'is_premium', _p.is_premium,
    'is_public', _p.is_public,
    'created_at', _p.created_at,
    'updated_at', _p.updated_at
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- 3. Remove sensitive tables from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.reports;
ALTER PUBLICATION supabase_realtime DROP TABLE public.votes;

-- 4. Harden claim_dj_role: rate limit + one-claim-per-user
CREATE UNIQUE INDEX IF NOT EXISTS dj_role_claims_user_success_unique
  ON public.dj_role_claims (user_id) WHERE success = true;

CREATE OR REPLACE FUNCTION public.claim_dj_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _recent int;
  _already boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Idempotent: if already DJ, no-op
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'dj')
    INTO _already;
  IF _already THEN RETURN; END IF;

  -- Rate limit: max 5 claim attempts per user per hour
  SELECT count(*) INTO _recent
  FROM public.dj_role_claims
  WHERE user_id = _uid
    AND attempted_at > now() - interval '1 hour';
  IF _recent >= 5 THEN
    INSERT INTO public.dj_role_claims (user_id, success) VALUES (_uid, false);
    RAISE EXCEPTION 'Too many DJ claim attempts. Try again later.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (_uid, 'dj') ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.dj_role_claims (user_id, success) VALUES (_uid, true);
END;
$$;
