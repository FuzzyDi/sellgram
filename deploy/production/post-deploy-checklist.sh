#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[ERROR] $COMPOSE_FILE not found in $ROOT_DIR"
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
else
  echo "[WARN] $ENV_FILE not found. Using defaults only."
fi

FAILED=0

ok() { echo "[OK] $*"; }
warn() { echo "[WARN] $*"; }
fail() { echo "[FAIL] $*"; FAILED=1; }
step() { echo; echo "== $* =="; }

check_http() {
  local label="$1"
  local url="$2"
  local expected="${3:-200}"

  if [[ -z "$url" ]]; then
    warn "$label URL is empty, skip"
    return 0
  fi

  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "$url" || true)"
  if [[ "$code" == "$expected" || "$code" == "301" || "$code" == "302" ]]; then
    ok "$label -> $url (HTTP $code)"
  else
    fail "$label -> $url (HTTP $code)"
  fi
}

step "Docker services"
if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps >/tmp/sellgram_ps.out 2>/tmp/sellgram_ps.err; then
  cat /tmp/sellgram_ps.out
  if grep -Eqi "(unhealthy|exited|dead)" /tmp/sellgram_ps.out; then
    fail "Some services are not healthy"
  else
    ok "Compose services look running"
  fi
else
  cat /tmp/sellgram_ps.err
  fail "docker compose ps failed"
fi

step "Local health"
LOCAL_HEALTH_URL="${MONITOR_HEALTH_URL:-http://localhost:8088/health}"
check_http "Local health" "$LOCAL_HEALTH_URL" "200"

step "Public URLs"
check_http "Landing" "${LANDING_URL:-https://sellgram.uz}"
check_http "Admin" "${ADMIN_URL:-https://app.sellgram.uz}"
check_http "API health" "${APP_URL:-https://api.sellgram.uz}/health" "200"
check_http "Miniapp" "${MINIAPP_URL:-https://miniapp.sellgram.uz}"

if [[ -n "${SHOP_WEBHOOK_DOMAIN:-}" ]]; then
  check_http "Shop webhook domain health" "https://${SHOP_WEBHOOK_DOMAIN}/health"
fi

step "Cloudflared"
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet cloudflared; then
    ok "cloudflared service is active"
  else
    warn "cloudflared service is not active"
  fi
else
  warn "systemctl not available, skip cloudflared check"
fi

step "Telegram webhook (optional)"
if [[ -n "${BOT_TOKEN:-}" ]]; then
  local_store_id="${STORE_ID:-}"
  if [[ -z "$local_store_id" ]]; then
    local_store_id="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
      psql -U "${DB_USER:-sellgram}" -d "${DB_NAME:-sellgram}" -Atc 'select id from stores order by "createdAt" desc limit 1;' 2>/dev/null || true)"
  fi

  if [[ -n "$local_store_id" ]]; then
    WH_URL="${APP_URL:-https://api.sellgram.uz}/webhook/$local_store_id"
    echo "Using STORE_ID=$local_store_id"
    echo "Expected webhook URL: $WH_URL"

    WH_INFO="$(curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" || true)"
    if [[ "$WH_INFO" == *'"ok":true'* ]]; then
      ok "getWebhookInfo returned ok=true"
      echo "$WH_INFO"
      if [[ "$WH_INFO" == *"$WH_URL"* ]]; then
        ok "Webhook URL matches expected"
      else
        warn "Webhook URL does not match expected"
      fi
      if [[ "$WH_INFO" == *'"last_error_message"'* ]]; then
        warn "Telegram reported last_error_message"
      fi
    else
      fail "getWebhookInfo failed"
      echo "$WH_INFO"
    fi
  else
    warn "STORE_ID not found and not provided, skip webhook URL match"
  fi
else
  warn "BOT_TOKEN is not set, skip Telegram webhook check"
fi

step "Recent logs (api/nginx)"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail=30 api 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail=30 nginx 2>/dev/null || true

step "Summary"
if [[ "$FAILED" -eq 0 ]]; then
  ok "Post-deploy checklist passed"
  exit 0
else
  fail "Post-deploy checklist has failures"
  exit 1
fi
