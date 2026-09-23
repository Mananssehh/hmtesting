#!/usr/bin/env bash
# Disposable fixture runner for E0c-1 Gate 1. Throwaway cluster in /tmp; no production access.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; MIG="$HERE/../01_cap_oracle_acl_containment.sql"
DATA=/tmp/e0c-pg; SOCK=/tmp/e0c-sock
rm -rf "$DATA" "$SOCK"; mkdir -p "$DATA" "$SOCK"
export PGHOST="$SOCK" PGUSER=postgres PGDATABASE=e0c
initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-k $SOCK -c listen_addresses=''" -w start >/dev/null
trap 'pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA" "$SOCK"' EXIT
createdb e0c
P="psql -v ON_ERROR_STOP=1 -X"
echo "### fixture"; $P -q -f "$HERE/00_fixture.sql"
echo "### BEFORE"
$P -c "select p.oid::regprocedure sig, r, has_function_privilege(r,p.oid,'EXECUTE') from pg_proc p, unnest(array['anon','authenticated','service_role']) r where proname like 'check_%cap' order by 1,2"
echo "### lock_timeout proof A: SET LOCAL outside a transaction is ignored"
$P -c "SET LOCAL lock_timeout='5s'" -c "show lock_timeout" 2>&1 || true
echo "### lock_timeout proof B: migration blocked by a concurrent holder must abort in ~5s, leaving ACLs unchanged"
$P -c "begin; alter function public.check_tip_cap(uuid,uuid,integer) cost 100; select pg_sleep(12); rollback;" >/dev/null &
HOLD=$!; sleep 1
S=$(date +%s.%N)
if $P --single-transaction -f "$MIG" 2>/tmp/e0c-lockerr; then echo "FAIL: migration was not blocked"; exit 1; fi
E=$(date +%s.%N); echo "aborted after $(echo "$E - $S" | bc) s: $(grep -o 'canceling statement due to lock timeout' /tmp/e0c-lockerr)"
wait $HOLD
$P -tA -c "select 'anon still exec (unchanged after abort): '||has_function_privilege('anon','public.check_tip_cap(uuid,uuid,integer)','EXECUTE')"
echo "### apply migration (single transaction, pass 1)"; $P --single-transaction -f "$MIG"
echo "### apply again (idempotence, pass 2)"; $P --single-transaction -f "$MIG"
echo "### verify"; $P -f "$HERE/01_verify.sql"
