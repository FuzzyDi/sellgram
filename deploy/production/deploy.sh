#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[ok]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err()  { echo -e "${RED}[err]${NC} $1"; exit 1; }

if [ "$EUID" -ne 0 ]; then
  err "Run as root: sudo bash deploy.sh"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="/opt/sellgram"
PROJECT_SOURCE="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.prod"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"

SERVER_IP="$(curl -s ifconfig.me || curl -s icanhazip.com || hostname -I | awk '{print $1}')"
log "Server IP: $SERVER_IP"

if ! command -v docker >/dev/null 2>&1; then
  warn "Installing Docker..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
log "Docker ready"

mkdir -p "$PROJECT_DIR"
rsync -a --delete --exclude=node_modules --exclude=.git --exclude=dist "$PROJECT_SOURCE/" "$PROJECT_DIR/"
log "Project synced to $PROJECT_DIR"

cd "$PROJECT_DIR/deploy/production"

sed -i "s|^SERVER_IP=.*$|SERVER_IP=${SERVER_IP}|" "$ENV_FILE"
./generate-secrets.sh "$ENV_FILE"

if ! grep -q '^SSL_MODE=' "$ENV_FILE"; then
  printf '\nSSL_MODE=http\nSSL_COMMON_NAME=sellgram.uz\n' >> "$ENV_FILE"
fi

set -a
. "$ENV_FILE"
set +a

./prepare-nginx.sh

log "Building containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build

log "Starting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

log "Current status"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo
echo "Health: http://${SERVER_IP}:${NGINX_HTTP_PORT:-8080}/health"
echo "HTTP config mode: $(grep '^SSL_MODE=' "$ENV_FILE" | cut -d= -f2-)"
echo "Backups: cd $PROJECT_DIR/deploy/production && ./backup-db.sh"
