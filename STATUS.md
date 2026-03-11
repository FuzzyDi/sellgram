# SellGram - Status

**Domain**: sellgram.uz
**Date**: 2026-03-11

## Domains
| Domain | Purpose | Ports |
|---|---|---|
| sellgram.uz | Landing | 80/443 |
| app.sellgram.uz | Admin panel | 80/443 |
| miniapp.sellgram.uz | Telegram Mini App | 80/443 |
| api.sellgram.uz | API backend | 80/443 |
| admin.sellgram.uz | Redirect to `app.sellgram.uz` | 80/443 |

## Stack
- API: Fastify + Prisma + Grammy + PostgreSQL + Redis + MinIO
- Admin: React + Vite
- Mini App: React + Vite + Telegram WebApp SDK
- Deploy: Docker Compose + Nginx

## Implemented
- Telegram bot + Mini App flow
- Admin panel for catalog, orders, customers, delivery, loyalty
- Multi-tenant registration and tenant isolation
- Manual billing flow
- Product image uploads via MinIO/S3
- Production rate limiting
- Production bootstrap for MinIO bucket and Prisma schema
- Runtime-configured billing details, landing contacts, and analytics hooks
- Production health monitor script with optional Telegram alerts
- Landing CTA event map documented for GA4/Yandex Metrika
- Landing demo section uses real screenshot assets
- Production env template reorganized into launch-ready blocks
- Pre-launch runbook added for final production smoke test
- Windows Server PowerShell deploy/start path added for Docker-based production
- Windows-native backup, restore, health monitor, and Task Scheduler setup added

## Production Run
```bash
cd /opt/sellgram/deploy/production
docker compose --env-file .env.prod up -d --build
```

## Health
```bash
curl http://localhost:8080/health
docker compose -f deploy/production/docker-compose.prod.yml --env-file deploy/production/.env.prod ps
```

## Backups
```bash
cd /opt/sellgram/deploy/production
./backup-db.sh
./restore-db.sh ./backups/postgres_YYYYMMDD_HHMMSS.sql.gz
```

## Monitoring
```bash
cd /opt/sellgram/deploy/production
./monitor-health.sh
```

## Bot Webhook
```powershell
$BOT_TOKEN = "TOKEN"
$STORE_ID = "ID"
Invoke-RestMethod "https://api.telegram.org/bot$BOT_TOKEN/setWebhook?url=https://api.sellgram.uz/webhook/$STORE_ID"
```
