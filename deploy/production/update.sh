#!/usr/bin/env bash
# SellGram production update script.
# Usage (on server):  cd /opt/sellgram && bash deploy/production/update.sh
# Usage (all):        bash deploy/production/update.sh --all
# Usage (specific):   bash deploy/production/update.sh api
#                     bash deploy/production/update.sh api admin
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[ok]${NC}  $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err()  { echo -e "${RED}[err]${NC}  $1"; exit 1; }
step() { echo -e "\n${YELLOW}──── $1 ────${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
ENV_FILE="$SCRIPT_DIR/.env.prod"
COMPOSE="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

[ -f "$ENV_FILE" ] || err ".env.prod not found at $ENV_FILE"

# ── Which services to rebuild ──────────────────────────────────────────────
ALL_APP_SERVICES="api admin miniapp"

if [ $# -eq 0 ]; then
  SERVICES="$ALL_APP_SERVICES"
elif [ "$1" = "--all" ]; then
  SERVICES="$ALL_APP_SERVICES"
else
  SERVICES="$*"
fi

step "Git pull"
cd "$SCRIPT_DIR/../.."
git pull origin main
log "Code updated"

step "Build: $SERVICES"
$COMPOSE build $SERVICES
log "Build complete"

step "Apply DB migrations"
$COMPOSE run --rm prisma-init
log "Migrations applied"

step "Recreate containers"
$COMPOSE up -d --force-recreate $SERVICES
log "Containers started"

# ── Wait for API to become healthy ─────────────────────────────────────────
if echo "$SERVICES" | grep -qw "api"; then
  step "Waiting for API health"
  for i in $(seq 1 30); do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' production-api-1 2>/dev/null || echo "missing")
    if [ "$STATUS" = "healthy" ]; then
      log "API healthy after ${i}s"
      break
    fi
    if [ "$STATUS" = "unhealthy" ]; then
      err "API is unhealthy — check logs: docker logs production-api-1 --tail 50"
    fi
    sleep 2
  done
  [ "$STATUS" = "healthy" ] || err "API did not become healthy in 60s"

  step "Reload nginx (re-resolve container IPs)"
  docker exec production-nginx-1 nginx -s reload
  log "Nginx reloaded"
fi

step "Final status"
$COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo
log "Deploy complete. All services updated."
