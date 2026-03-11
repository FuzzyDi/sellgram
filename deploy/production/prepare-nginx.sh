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

SSL_MODE="${SSL_MODE:-http}"
HTTP_TEMPLATE="$SCRIPT_DIR/nginx.http.conf"
HTTPS_TEMPLATE="$SCRIPT_DIR/nginx.https.conf"
TARGET="$SCRIPT_DIR/nginx.prod.conf"
SSL_DIR="$SCRIPT_DIR/ssl"

mkdir -p "$SSL_DIR"

case "$SSL_MODE" in
  http)
    cp "$HTTP_TEMPLATE" "$TARGET"
    ;;
  self-signed)
    if [ ! -f "$SSL_DIR/fullchain.pem" ] || [ ! -f "$SSL_DIR/privkey.pem" ]; then
      openssl req -x509 -nodes -days 3650 \
        -newkey rsa:2048 \
        -keyout "$SSL_DIR/privkey.pem" \
        -out "$SSL_DIR/fullchain.pem" \
        -subj "/CN=${SSL_COMMON_NAME:-sellgram.uz}" >/dev/null 2>&1
    fi
    cp "$HTTPS_TEMPLATE" "$TARGET"
    ;;
  letsencrypt|https)
    if [ ! -f "$SSL_DIR/fullchain.pem" ] || [ ! -f "$SSL_DIR/privkey.pem" ]; then
      echo "Missing SSL files: $SSL_DIR/fullchain.pem and $SSL_DIR/privkey.pem"
      exit 1
    fi
    cp "$HTTPS_TEMPLATE" "$TARGET"
    ;;
  *)
    echo "Unsupported SSL_MODE: $SSL_MODE"
    exit 1
    ;;
esac

echo "Prepared nginx config: $TARGET ($SSL_MODE)"
