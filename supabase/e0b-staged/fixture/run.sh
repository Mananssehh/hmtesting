#!/usr/bin/env bash
# Disposable local fixture runner for E0b Gate 1 (Option 1, bounded mitigation).
# Throwaway PostgreSQL cluster in /tmp, destroyed on exit. No production access.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../01_default_privileges_public_postgres.sql"
CHK="$HERE/../03_effective_privilege_check.sql"
DATA=/tmp/e0b-fixture-pg
SOCK=/tmp/e0b-fixture-sock

rm -rf "$DATA" "$SOCK"; mkdir -p "$DATA" "$SOCK"
export PGHOST="$SOCK" PGUSER=postgres PGDATABASE=e0bfixture
unset PGPORT PGPASSWORD PGSSLMODE 2>/dev/null || true

initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-k $SOCK -c listen_addresses=''" -w start >/dev/null
trap 'pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA" "$SOCK"' EXIT

createdb e0bfixture
psql -v ON_ERROR_STOP=1 -X -q -c "select current_user, session_user, pg_get_userbyid((select datdba from pg_database where datname=current_database())) as db_owner" \
  | sed 's/^/### executor: /'

echo "### fixture: roles, production-shaped default privileges, existing functions"
psql -v ON_ERROR_STOP=1 -X -f "$HERE/00_fixture.sql"

echo "### canary A: BEFORE mitigation"
psql -v ON_ERROR_STOP=1 -X -f "$HERE/01_before.sql"

echo "### apply E0b Option 1 migration (single transaction, pass 1)"
psql -v ON_ERROR_STOP=1 -X --single-transaction -f "$MIG"
echo "### apply E0b Option 1 migration AGAIN (idempotence, pass 2)"
psql -v ON_ERROR_STOP=1 -X --single-transaction -f "$MIG"

echo "### install effective-privilege checker"
psql -v ON_ERROR_STOP=1 -X -q --single-transaction -f "$CHK"

echo "### canaries B-D, checker and unchanged-object proofs"
psql -v ON_ERROR_STOP=1 -X -f "$HERE/02_verify.sql"
