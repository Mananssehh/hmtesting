
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Trusted RPCs (award_points/boost_request/etc.) set this flag before mutating points
  IF current_setting('app.bypass_profile_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Internal/service contexts (no auth.uid)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- End-user updates: lock sensitive fields
  IF auth.uid() = OLD.id THEN
    NEW.id := OLD.id;
    NEW.points := OLD.points;
    NEW.is_premium := OLD.is_premium;
    NEW.created_at := OLD.created_at;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.award_points(_user_id uuid, _event_id uuid, _amount integer, _type point_tx_type, _reason text DEFAULT ''::text, _song_request_id uuid DEFAULT NULL::uuid, _created_by uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if _amount = 0 then return; end if;
  perform set_config('app.bypass_profile_guard', 'on', true);
  update public.profiles
    set points = greatest(0, points + _amount),
        updated_at = now()
    where id = _user_id;
  perform set_config('app.bypass_profile_guard', 'off', true);
  insert into public.points_transactions (user_id, event_id, song_request_id, amount, type, reason, created_by)
    values (_user_id, _event_id, _song_request_id, _amount, _type, coalesce(_reason, ''), _created_by);
end;
$function$;
