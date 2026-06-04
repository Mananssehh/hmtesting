
CREATE OR REPLACE FUNCTION public.on_vote_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- Points for upvotes received are disabled.
  -- Vote counts are still maintained by sync_vote_counts trigger.
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.on_song_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- Points for tracks played are disabled.
  -- DJ decisions should not affect a requester's point balance.
  return new;
end;
$function$;
