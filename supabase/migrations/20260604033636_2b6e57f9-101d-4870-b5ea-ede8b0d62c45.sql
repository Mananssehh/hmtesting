
-- 1. Idempotency guard: only one starter grant per user, ever
CREATE UNIQUE INDEX IF NOT EXISTS uniq_starter_points_per_user
  ON public.points_transactions(user_id)
  WHERE reason = 'Starter points';

-- 2. Update new-user handler: profile defaults to 15 pts + starter ledger row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname, points)
  VALUES (new.id, coalesce(new.raw_user_meta_data->>'nickname', 'Guest'), 15)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'guest')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Starter ledger row, guarded by partial unique index
  BEGIN
    INSERT INTO public.points_transactions (user_id, amount, type, reason)
    VALUES (new.id, 15, 'earned'::public.point_tx_type, 'Starter points');
  EXCEPTION WHEN unique_violation THEN
    -- already granted, do nothing
    NULL;
  END;

  RETURN new;
END;
$$;

-- 3. Backfill existing users who never received starter points
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.id
    FROM public.profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.points_transactions pt
      WHERE pt.user_id = p.id AND pt.reason = 'Starter points'
    )
  LOOP
    PERFORM set_config('app.bypass_profile_guard', 'on', true);
    UPDATE public.profiles
      SET points = points + 15, updated_at = now()
      WHERE id = r.id;
    PERFORM set_config('app.bypass_profile_guard', 'off', true);

    BEGIN
      INSERT INTO public.points_transactions (user_id, amount, type, reason)
      VALUES (r.id, 15, 'earned'::public.point_tx_type, 'Starter points');
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
END $$;
