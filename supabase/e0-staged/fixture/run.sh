#!/usr/bin/env bash
# Disposable local fixture runner for the E0 Gate 1 containment migration.
# Creates a throwaway PostgreSQL cluster in /tmp, applies the fixture, the
# migration and the verification suite, then destroys the cluster.
# Touches no production database, no real queue, no secret, no network.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../01_email_queue_acl_containment.sql"
DATA=/tmp/e0-fixture-pg
SOCK=/tmp/e0-fixture-sock

rm -rf "$DATA" "$SOCK"; mkdir -p "$DATA" "$SOCK"
export PGHOST="$SOCK" PGUSER=postgres PGDATABASE=e0fixture
unset PGPORT PGPASSWORD PGSSLMODE 2>/dev/null || true

initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-k $SOCK -c listen_addresses=''" -w start >/dev/null
trap 'pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA" "$SOCK"' EXIT

createdb e0fixture
run() { psql -v ON_ERROR_STOP=1 -X -q -f "$1"; }

echo "### fixture: stub pgmq/cron/net/vault"
run "$HERE/00_fixture.sql"
echo "### fixture: production-identical function bodies + pre-migration ACLs"
run "$HERE/01_functions.sql"
echo "### capture BEFORE state"
psql -v ON_ERROR_STOP=1 -X -f "$HERE/02_capture_before.sql"

echo "### apply migration ATOMICALLY (single transaction)"
psql -v ON_ERROR_STOP=1 -X --single-transaction -f "$MIG"
echo "### migration applied and committed"

psql -v ON_ERROR_STOP=1 -X -f "$HERE/03_verify.sql"
