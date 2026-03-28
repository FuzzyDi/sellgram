#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.prod"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

HEALTH_URL="${MONITOR_HEALTH_URL:-http://localhost:${NGINX_HTTP_PORT:-8080}/health}"
TIMEOUT_SEC="${MONITOR_TIMEOUT_SEC:-10}"
STATE_DIR="${MONITOR_STATE_DIR:-$SCRIPT_DIR/.monitor}"
STATE_FILE="$STATE_DIR/health.state"
STATUS="down"
BODY=""

# ── Load monitor settings from API (overrides env if available) ──────────────
NGINX_HTTP_PORT="${NGINX_HTTP_PORT:-8080}"
MONITOR_CONFIG_URL="http://localhost:${NGINX_HTTP_PORT}/api/system-admin/monitor-config"
if MONITOR_JSON="$(curl --silent --max-time 5 -H "Host: app.sellgram.uz" "$MONITOR_CONFIG_URL" 2>/dev/null)"; then
  _BOT="$(printf '%s' "$MONITOR_JSON" | grep -o '"botToken":"[^"]*"' | head -1 | sed 's/"botToken":"//;s/"//')"
  _CHAT="$(printf '%s' "$MONITOR_JSON" | grep -o '"chatId":"[^"]*"' | head -1 | sed 's/"chatId":"//;s/"//')"
  _DISK="$(printf '%s' "$MONITOR_JSON" | grep -o '"diskThreshold":[0-9]*' | head -1 | sed 's/"diskThreshold"://')"
  [ -n "$_BOT"  ] && MONITOR_TELEGRAM_BOT_TOKEN="$_BOT"
  [ -n "$_CHAT" ] && MONITOR_TELEGRAM_CHAT_ID="$_CHAT"
  [ -n "$_DISK" ] && MONITOR_DISK_THRESHOLD="$_DISK"
fi

mkdir -p "$STATE_DIR"

if BODY="$(curl --silent --show-error --max-time "$TIMEOUT_SEC" "$HEALTH_URL")"; then
  if printf '%s' "$BODY" | grep -q '"status":"ok"'; then
    STATUS="up"
  fi
fi

PREV_STATUS=""
if [ -f "$STATE_FILE" ]; then
  PREV_STATUS="$(cat "$STATE_FILE")"
fi

printf '%s' "$STATUS" > "$STATE_FILE"

notify() {
  local message="$1"
  if [ -n "${MONITOR_TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${MONITOR_TELEGRAM_CHAT_ID:-}" ]; then
    curl --silent --show-error --max-time 15 \
      -X POST "https://api.telegram.org/bot${MONITOR_TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${MONITOR_TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${message}" >/dev/null
  fi
}

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ "$STATUS" = "down" ]; then
  echo "[$TIMESTAMP] healthcheck failed for $HEALTH_URL"
  if [ "$PREV_STATUS" != "down" ]; then
    notify "🔴 SellGram healthcheck is DOWN: ${HEALTH_URL} (${TIMESTAMP})"
  fi
  exit 1
fi

echo "[$TIMESTAMP] healthcheck ok for $HEALTH_URL"
if [ "$PREV_STATUS" = "down" ]; then
  notify "✅ SellGram healthcheck recovered: ${HEALTH_URL} (${TIMESTAMP})"
fi

# ── Disk space check ────────────────────────────────────────────────────────
DISK_THRESHOLD="${MONITOR_DISK_THRESHOLD:-85}"
DISK_STATE_FILE="$STATE_DIR/disk.state"
PREV_DISK_ALERT=""
if [ -f "$DISK_STATE_FILE" ]; then
  PREV_DISK_ALERT="$(cat "$DISK_STATE_FILE")"
fi

DISK_USAGE="$(df / --output=pcent | tail -1 | tr -d '% ')"
if [ "${DISK_USAGE:-0}" -ge "$DISK_THRESHOLD" ]; then
  echo "[$TIMESTAMP] disk usage ${DISK_USAGE}% >= threshold ${DISK_THRESHOLD}%"
  printf 'alert' > "$DISK_STATE_FILE"
  if [ "$PREV_DISK_ALERT" != "alert" ]; then
    notify "⚠️ SellGram disk usage is ${DISK_USAGE}% (threshold ${DISK_THRESHOLD}%) — clean up or expand storage (${TIMESTAMP})"
  fi
else
  echo "[$TIMESTAMP] disk usage ${DISK_USAGE}% ok"
  printf 'ok' > "$DISK_STATE_FILE"
  if [ "$PREV_DISK_ALERT" = "alert" ]; then
    notify "✅ SellGram disk usage recovered: ${DISK_USAGE}% (${TIMESTAMP})"
  fi
fi
