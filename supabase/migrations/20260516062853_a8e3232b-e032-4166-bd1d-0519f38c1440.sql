-- Ensure table grants exist for authenticated role (RLS still enforces row access)
GRANT SELECT, UPDATE, INSERT ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- Re-create clean SELECT/UPDATE policies scoped to authenticated
DROP POLICY IF EXISTS "Users view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public can view safe profile columns" ON public.profiles;

CREATE POLICY "Users view their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Note: public read access is intentionally NOT granted via RLS.
-- Public profile data must go through public.get_public_profile(uuid) RPC
-- which is SECURITY DEFINER and enforces is_public + column whitelist.

-- Trigger to prevent users from editing sensitive columns on their own profile
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow internal/service contexts (no auth.uid) to update anything (triggers, RPCs)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- For end-user updates, lock down sensitive fields
  IF auth.uid() = OLD.id THEN
    NEW.id := OLD.id;
    NEW.points := OLD.points;
    NEW.is_premium := OLD.is_premium;
    NEW.created_at := OLD.created_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_sensitive_columns ON public.profiles;
CREATE TRIGGER protect_profile_sensitive_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_sensitive_columns();