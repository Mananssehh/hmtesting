CREATE OR REPLACE FUNCTION public.on_vote_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _req public.song_requests;
  _delta integer := 0;
  _row record;
begin
  _row := coalesce(new, old);
  select * into _req from public.song_requests where id = _row.song_request_id;
  if _req.id is null or _req.requested_by is null then return null; end if;
  -- Don't reward self-votes
  if _req.requested_by = _row.user_id then return null; end if;

  if tg_op = 'INSERT' then
    _delta := case when new.value = 1 then 1 else 0 end;
  elsif tg_op = 'DELETE' then
    _delta := case when old.value = 1 then -1 else 0 end;
  elsif tg_op = 'UPDATE' then
    _delta := case
      when old.value <> 1 and new.value = 1 then 1
      when old.value = 1 and new.value <> 1 then -1
      else 0 end;
  end if;

  if _delta <> 0 then
    perform public.award_points(
      _req.requested_by,
      _req.event_id,
      _delta,
      (case when _delta > 0 then 'earned' else 'spent' end)::public.point_tx_type,
      'Upvote received'::text,
      _req.id,
      NULL::uuid
    );
  end if;
  return null;
end;
$function$;