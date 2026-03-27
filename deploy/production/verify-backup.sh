#!/usr/bin/env bash
# Verify the latest (or specified) backup by restoring into a throwaway
# Postgres container and running sanity checks. Never touches production data.
#
# Usage:
#   ./verify-backup.sh                  # picks newest backup in $BACKUP_DIR
#   ./verify-backup.sh path/to/dump.sql.gz
#
# Required for Telegram alerts: MONITOR_TELEGRAM_BOT_TOKEN + MONITOR_TELEGRAM_CHAT_ID
# (loaded from .env.prod if present)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.prod"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# Unique container name so parallel runs don't collide
TEST_CONTAINER="sellgram_verify_$$"
TEST_DB="verify_db"
TEST_USER="verify_user"
TEST_PASS="verify_$$"
EXIT_CODE=0

# ── Pick backup file ──────────────────────────────────────────────────────────
if [ "${1:-}" != "" ]; then
  BACKUP_FILE="$1"
else
  BACKUP_FILE="$(ls -t "$BACKUP_DIR"/postgres_*.sql.gz 2>/dev/null | head -1 || true)"
fi

if [ -z "${BACKUP_FILE:-}" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "[$TIMESTAMP] ERROR: no backup file found (BACKUP_DIR=$BACKUP_DIR)" >&2
  exit 1
fi

echo "[$TIMESTAMP] Verifying: $BACKUP_FILE"
BACKUP_SIZE="$(du -sh "$BACKUP_FILE" | cut -f1)"
echo "[$TIMESTAMP] File size: $BACKUP_SIZE"

# ── Helpers ───────────────────────────────────────────────────────────────────
notify() {
  local message="$1"
  if [ -n "${MONITOR_TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${MONITOR_TELEGRAM_CHAT_ID:-}" ]; then
    curl --silent --show-error --max-time 15 \
      -X POST "https://api.telegram.org/bot${MONITOR_TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${MONITOR_TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${message}" >/dev/null
  fi
}

cleanup() {
  docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ── Spin up throwaway Postgres ────────────────────────────────────────────────
echo "[$TIMESTAMP] Starting throwaway container: $TEST_CONTAINER"
docker run -d --name "$TEST_CONTAINER" \
  -e POSTGRES_DB="$TEST_DB" \
  -e POSTGRES_USER="$TEST_USER" \
  -e POSTGRES_PASSWORD="$TEST_PASS" \
  postgres:16-alpine >/dev/null

# Wait for Postgres to accept connections (max 30s)
WAIT=0
until docker exec "$TEST_CONTAINER" \
    pg_isready -U "$TEST_USER" -d "$TEST_DB" >/dev/null 2>&1; do
  WAIT=$((WAIT + 1))
  if [ "$WAIT" -ge 30 ]; then
    echo "[$TIMESTAMP] ERROR: throwaway container did not become ready" >&2
    notify "❌ SellGram backup verify FAILED: container not ready (${TIMESTAMP})"
    exit 1
  fi
  sleep 1
done
echo "[$TIMESTAMP] Container ready (${WAIT}s)"

# ── Restore ───────────────────────────────────────────────────────────────────
echo "[$TIMESTAMP] Restoring dump..."
if ! gunzip -c "$BACKUP_FILE" | \
    docker exec -i "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" -q; then
  echo "[$TIMESTAMP] ERROR: psql restore failed" >&2
  notify "❌ SellGram backup verify FAILED: psql restore error — $(basename "$BACKUP_FILE") (${TIMESTAMP})"
  exit 1
fi
echo "[$TIMESTAMP] Restore OK"

# ── Sanity checks ─────────────────────────────────────────────────────────────
psql_q() {
  docker exec "$TEST_CONTAINER" \
    psql -U "$TEST_USER" -d "$TEST_DB" -tAc "$1" 2>/dev/null || echo "0"
}

table_exists() {
  local t="$1"
  local n
  n=$(psql_q "SELECT COUNT(*) FROM information_schema.tables
              WHERE table_schema='public' AND table_name='$t'")
  [ "${n:-0}" -ne 0 ]
}

echo "[$TIMESTAMP] Checking required tables..."
MISSING=""
for tbl in tenants stores customers orders products categories; do
  if ! table_exists "$tbl"; then
    echo "[$TIMESTAMP] ERROR: table '$tbl' missing after restore" >&2
    MISSING="$MISSING $tbl"
    EXIT_CODE=1
  fi
done

if [ "$EXIT_CODE" -ne 0 ]; then
  notify "❌ SellGram backup verify FAILED: missing tables:${MISSING} — $(basename "$BACKUP_FILE") (${TIMESTAMP})"
  exit 1
fi

# Row counts
TENANTS="$(psql_q 'SELECT COUNT(*) FROM "tenants"')"
ORDERS="$(psql_q 'SELECT COUNT(*) FROM "orders"')"
PRODUCTS="$(psql_q 'SELECT COUNT(*) FROM "products"')"
CUSTOMERS="$(psql_q 'SELECT COUNT(*) FROM "customers"')"

echo "[$TIMESTAMP] Row counts — tenants:${TENANTS} orders:${ORDERS} products:${PRODUCTS} customers:${CUSTOMERS}"

if [ "${TENANTS:-0}" -eq 0 ]; then
  echo "[$TIMESTAMP] WARNING: tenants table is empty — dump may be incomplete" >&2
  notify "⚠️ SellGram backup verify WARNING: tenants=0 in $(basename "$BACKUP_FILE") (${TIMESTAMP})"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo "[$TIMESTAMP] PASSED: $(basename "$BACKUP_FILE") size=${BACKUP_SIZE} tenants=${TENANTS} orders=${ORDERS}"
notify "✅ SellGram backup verified OK: $(basename "$BACKUP_FILE") size=${BACKUP_SIZE} tenants=${TENANTS} orders=${ORDERS} (${TIMESTAMP})"
