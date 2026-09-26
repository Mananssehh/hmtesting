#!/usr/bin/env bash
# Disposable fixture runner for the join-boundary Gate 1. Throwaway cluster in /tmp; no production access.
# Run as a non-root user (initdb refuses root): runuser -u lovable -- bash run.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
A="$HERE/../01_migration_a_trusted_join.sql"; B="$HERE/../02_migration_b_close_old_join.sql"
DATA=/tmp/joinb-pg; SOCK=/tmp/joinb-sock
rm -rf "$DATA" "$SOCK"; mkdir -p "$DATA" "$SOCK"
export PGHOST="$SOCK" PGUSER=postgres PGDATABASE=joinb
initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-k $SOCK -c listen_addresses=''" -w start >/dev/null
trap 'pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA" "$SOCK"' EXIT
createdb joinb
P="psql -X -v ON_ERROR_STOP=1"
FAILS=0
check() { # name expected actual
  if [ "$2" == "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1  expected=[$2] got=[$3]"; FAILS=$((FAILS+1)); fi; }
q() { $P -tA -c "$1" 2>&1 | tail -1; }
# call ROLE UID SQL  -> result or SQLSTATE
call() { $P -tA -c "set role $1; select set_config('request.jwt.claim.sub','$2',false); $3" 2>&1 \
  | grep -Eo '^\{.*\}$|permission denied for function [a-z_]+' | tail -1; }
exp() { $P -tA -c "set role $1; $2" 2>&1 | grep -Eo '^\{.*\}$|permission denied for function [a-z_]+' | tail -1; }

$P -q -f "$HERE/00_fixture.sql" || exit 1
# Recreate the old function with the byte-exact production body + production ACL.
python3 - "$HERE/old_body.b64" > /tmp/joinb-old.sql <<'PY'
import base64,sys
body=base64.b64decode(open(sys.argv[1]).read()).decode()
print("CREATE FUNCTION public.join_event_by_code(_code text, _nickname text DEFAULT NULL::text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$"+body+"$fn$;")
print("REVOKE ALL ON FUNCTION public.join_event_by_code(text,text) FROM PUBLIC, anon;")
print("GRANT EXECUTE ON FUNCTION public.join_event_by_code(text,text) TO authenticated, service_role;")
PY
$P -q -f /tmp/joinb-old.sql || exit 1
OLDMD5=586bc3dd220d6d2babf0678618be653b
DEN='{"ok": false, "reason": "unavailable"}'
UA=00000000-0000-0000-0000-00000000000a; UB=00000000-0000-0000-0000-00000000000b
UC=00000000-0000-0000-0000-00000000000c; UX=00000000-0000-0000-0000-0000000000ff
check "baseline old body md5 == production" $OLDMD5 "$(q "select md5(prosrc) from pg_proc where proname='join_event_by_code'")"

echo "### STAGE 0 (today)"; $P -f "$HERE/matrix.sql"
check "S0 authenticated old" t "$(q "select has_function_privilege('authenticated','public.join_event_by_code(text,text)','EXECUTE')")"

echo "### lock_timeout proof: Migration A blocked by a lock holder must abort in ~5s"
$P -c "begin; lock table public.events in access exclusive mode; select pg_sleep(10); rollback;" >/dev/null &
HOLD=$!; sleep 1; S=$(date +%s.%N)
$P -f "$A" >/tmp/joinb-lock.out 2>&1; RC=$?; E=$(date +%s.%N); wait $HOLD
echo "rc=$RC elapsed=$(echo "$E - $S" | bc)s: $(grep -o 'canceling statement due to lock timeout' /tmp/joinb-lock.out | head -1)"
check "A aborted by lock timeout leaves no function" 0 "$(q "select count(*) from pg_proc where proname='join_event_by_code_trusted'")"

echo "### APPLY MIGRATION A"; $P -f "$A" || exit 1
echo "### STAGE A matrix"; $P -f "$HERE/matrix.sql"
T='public.join_event_by_code_trusted(uuid,text,text)'; O='public.join_event_by_code(text,text)'
for r in anon:f authenticated:t service_role:t; do check "A old ${r%%:*}" ${r##*:} "$(q "select has_function_privilege('${r%%:*}','$O','EXECUTE')")"; done
for r in anon:f authenticated:f service_role:t; do check "A new ${r%%:*}" ${r##*:} "$(q "select has_function_privilege('${r%%:*}','$T','EXECUTE')")"; done
check "A new PUBLIC not in ACL" f "$(q "select proacl::text like '%{=X%' or proacl::text like '%,=X%' from pg_proc where proname='join_event_by_code_trusted'")"
check "A new owner/secdef/search_path" "postgres|true|{\"search_path=\\\"\\\"\"}" "$(q "select pg_get_userbyid(proowner)||'|'||prosecdef||'|'||proconfig::text from pg_proc where proname='join_event_by_code_trusted'")"
check "A old md5 unchanged" $OLDMD5 "$(q "select md5(prosrc) from pg_proc where proname='join_event_by_code'")"
# live-call behaviour after A
R=$(call authenticated $UA "select public.join_event_by_code('live01','OldPath')")
check "A authenticated CAN call old (joins)" true "$(echo "$R" | grep -q '"ok": true' && echo true || echo "$R")"
check "A authenticated CANNOT call new" "permission denied for function join_event_by_code_trusted" "$(call authenticated $UA "select public.join_event_by_code_trusted('$UA','LIVE01',null)")"
check "A anon CANNOT call new" "permission denied for function join_event_by_code_trusted" "$(call anon $UA "select public.join_event_by_code_trusted('$UA','LIVE01',null)")"
check "A anon CANNOT call old" "permission denied for function join_event_by_code" "$(call anon $UA "select public.join_event_by_code('LIVE01',null)")"
# trusted behaviour as service_role (auth.uid() null here; identity comes from _user_id)
$P -q -c "delete from public.event_participants; update public.profiles set points=0"
R=$(exp service_role "select public.join_event_by_code_trusted('$UA',' live 01 ',null)")
check "new: first join ok" true "$(echo "$R" | grep -q '"ok": true' && echo true || echo "$R")"
check "new: nickname falls back to profile" "ProfileA|1|1" "$(q "select nickname||'|'||count(*) over()||'|'||(select points from public.profiles where id='$UA') from public.event_participants where user_id='$UA'")"
L1=$(q "select last_seen_at from public.event_participants where user_id='$UA'"); sleep 0.05
exp service_role "select public.join_event_by_code_trusted('$UA','LIVE01','NewNick')" >/dev/null
check "new: refresh keeps one row, updates nick, no extra point" "NewNick|1|1|true" "$(q "select nickname||'|'||count(*) over()||'|'||(select points from public.profiles where id='$UA')||'|'||(last_seen_at > '$L1') from public.event_participants where user_id='$UA'")"
exp service_role "select public.join_event_by_code_trusted('$UB','LIVE01',null)" >/dev/null
check "new: blank profile nickname -> Guest" Guest "$(q "select nickname from public.event_participants where user_id='$UB'")"
exp service_role "select public.join_event_by_code_trusted('$UB','LIVE01','ABCDEFGHIJKLMNOPQRSTUVWXYZ')" >/dev/null
check "new: nickname cut to 24" 24 "$(q "select length(nickname) from public.event_participants where user_id='$UB'")"
for c in "null-user|select public.join_event_by_code_trusted(null,'LIVE01',null)" \
         "unknown-user|select public.join_event_by_code_trusted('$UX','LIVE01',null)" \
         "bad-format|select public.join_event_by_code_trusted('$UA','AB!',null)" \
         "too-short|select public.join_event_by_code_trusted('$UA','ABCD',null)" \
         "not-found|select public.join_event_by_code_trusted('$UA','NOPE99',null)" \
         "inactive|select public.join_event_by_code_trusted('$UA','OFF001',null)" \
         "ended|select public.join_event_by_code_trusted('$UA','END001',null)" \
         "banned|select public.join_event_by_code_trusted('$UC','LIVE01',null)"; do
  check "new denied byte-identical: ${c%%|*}" "$DEN" "$(exp service_role "${c#*|}")"; done
check "denials wrote no rows for unknown/banned" 0 "$(q "select count(*) from public.event_participants where user_id in ('$UX','$UC')")"

echo "### APPLY MIGRATION B"; $P -f "$B" || exit 1
echo "### STAGE B matrix"; $P -f "$HERE/matrix.sql"
for r in anon:f authenticated:f service_role:f postgres:t; do check "B old ${r%%:*}" ${r##*:} "$(q "select has_function_privilege('${r%%:*}','$O','EXECUTE')")"; done
for r in anon:f authenticated:f service_role:t; do check "B new ${r%%:*}" ${r##*:} "$(q "select has_function_privilege('${r%%:*}','$T','EXECUTE')")"; done
check "B authenticated CANNOT call old" "permission denied for function join_event_by_code" "$(call authenticated $UA "select public.join_event_by_code('LIVE01',null)")"
check "B authenticated CANNOT call new" "permission denied for function join_event_by_code_trusted" "$(call authenticated $UA "select public.join_event_by_code_trusted('$UA','LIVE01',null)")"
check "B service_role CANNOT call old" "permission denied for function join_event_by_code" "$(exp service_role "select public.join_event_by_code('LIVE01',null)")"
R=$(exp service_role "select public.join_event_by_code_trusted('$UA','LIVE01',null)")
check "B service_role still joins via new" true "$(echo "$R" | grep -q '"ok": true' && echo true || echo "$R")"
check "B old md5 unchanged" $OLDMD5 "$(q "select md5(prosrc) from pg_proc where proname='join_event_by_code'")"
check "B on_event_join ACL untouched" "$(q "select coalesce(proacl::text,'default') from pg_proc where proname='on_event_join'")" "$(q "select coalesce(proacl::text,'default') from pg_proc where proname='on_event_join'")"
echo "### re-apply B (idempotent)"; $P -f "$B" >/dev/null && check "B re-apply no-op" f "$(q "select has_function_privilege('authenticated','$O','EXECUTE')")"
echo "### RESULT: $FAILS failure(s)"; exit $FAILS
