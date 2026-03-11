#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-$SCRIPT_DIR/.env.prod}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE"
  exit 1
fi

replace_value() {
  local key="$1"
  local value="$2"
  sed -i "s|^${key}=.*$|${key}=${value}|" "$ENV_FILE"
}

replace_if_placeholder() {
  local key="$1"
  local current
  current="$(grep -E "^${key}=" "$ENV_FILE" | head -n 1 | cut -d= -f2- || true)"
  if [ -z "$current" ] || [[ "$current" == CHANGE_ME* ]] || [[ "$current" == YOUR_* ]]; then
    replace_value "$key" "$2"
  fi
}

replace_if_placeholder "DB_PASSWORD" "$(openssl rand -hex 16)"
replace_if_placeholder "REDIS_PASSWORD" "$(openssl rand -hex 16)"
replace_if_placeholder "JWT_SECRET" "$(openssl rand -hex 32)"
replace_if_placeholder "JWT_REFRESH_SECRET" "$(openssl rand -hex 32)"
replace_if_placeholder "SYSTEM_JWT_SECRET" "$(openssl rand -hex 32)"
replace_if_placeholder "SYSTEM_ADMIN_PASSWORD" "$(openssl rand -hex 16)"
replace_if_placeholder "S3_SECRET_KEY" "$(openssl rand -hex 16)"
replace_if_placeholder "ENCRYPTION_KEY" "$(openssl rand -hex 32)"

echo "Updated secrets in: $ENV_FILE"
