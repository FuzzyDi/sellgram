# SellGram - VPS Deployment Guide

## Requirements
- Ubuntu 22.04 or 24.04
- 2 GB RAM minimum
- 1 vCPU minimum
- 20 GB SSD
- Domain records for `sellgram.uz`, `app.sellgram.uz`, `miniapp.sellgram.uz`, `api.sellgram.uz`

## 1. Connect To Server
From Windows PowerShell:

```powershell
ssh root@YOUR_SERVER_IP
```

Optional first hardening:

```bash
apt update && apt upgrade -y
apt install -y rsync curl ca-certificates openssl
```

## 2. Upload Project
Option A, archive upload:

```powershell
scp sellgram.tar.gz root@YOUR_SERVER_IP:/opt/
```

On the server:

```bash
cd /opt
tar xzf sellgram.tar.gz
mv sellgram /opt/sellgram
```

Option B, git clone:

```bash
cd /opt
git clone https://github.com/YOUR_USER/sellgram.git
mv sellgram /opt/sellgram
```

## 3. Configure Production Env
Edit [`.env.prod`](/E:/Projects/sellgram/deploy/production/.env.prod) on the server:

```bash
cd /opt/sellgram/deploy/production
nano .env.prod
```

Fill at least:
- `DB_PASSWORD`
- `REDIS_PASSWORD`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `SYSTEM_JWT_SECRET`
- `SYSTEM_ADMIN_PASSWORD`
- `S3_SECRET_KEY`
- `ENCRYPTION_KEY`
- `SYSTEM_ADMIN_EMAIL`

SSL mode:
- `SSL_MODE=http` for plain HTTP only
- `SSL_MODE=self-signed` to auto-generate self-signed certs
- `SSL_MODE=letsencrypt` if you already placed `ssl/fullchain.pem` and `ssl/privkey.pem`

If you want demo seed data on first bootstrap:

```env
PRISMA_SEED=true
DEMO_BOT_TOKEN=YOUR_DEMO_BOT_TOKEN
```

## 4. Prepare HTTPS
If you use Let's Encrypt, place certificates here:

```bash
cd /opt/sellgram/deploy/production
mkdir -p ssl
cp /path/to/fullchain.pem ssl/fullchain.pem
cp /path/to/privkey.pem ssl/privkey.pem
```

Then set:

```env
SSL_MODE=letsencrypt
```

If you only need temporary HTTPS for testing or Telegram webhook experiments:

```env
SSL_MODE=self-signed
```

## 5. Deploy
Run the one-command deploy:

```bash
cd /opt/sellgram/deploy/production
sudo bash deploy.sh
```

What it does:
- installs Docker if needed
- syncs the project to `/opt/sellgram`
- updates placeholder secrets in `.env.prod`
- prepares `nginx.prod.conf` from the selected SSL mode
- builds containers
- starts Postgres, Redis, MinIO, `prisma-init`, API, admin, miniapp, nginx

## 6. Verify
Check status:

```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Health endpoint:

```bash
curl http://localhost:8080/health
```

Expected response:

```json
{"status":"ok"}
```

If `SSL_MODE` is `self-signed` or `letsencrypt`, also test:

```bash
curl -k https://localhost:8443/health
```

## 7. Telegram Webhook
Use the public API domain, not raw IP:

```bash
BOT_TOKEN="YOUR_BOT_TOKEN"
STORE_ID="STORE_ID_FROM_DB"

curl "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=https://api.sellgram.uz/webhook/${STORE_ID}"
```

Check webhook state:

```bash
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

For BotFather Mini App button use:

```text
https://miniapp.sellgram.uz/?storeId=STORE_ID
```

## 8. Backups
Manual backup:

```bash
cd /opt/sellgram/deploy/production
./backup-db.sh
```

Restore:

```bash
cd /opt/sellgram/deploy/production
./restore-db.sh ./backups/postgres_YYYYMMDD_HHMMSS.sql.gz
```

Cron example:

```bash
crontab -e
```

Add:

```cron
0 3 * * * cd /opt/sellgram/deploy/production && BACKUP_DIR=/opt/sellgram/backups ./backup-db.sh >> /var/log/sellgram-backup.log 2>&1
```

## 9. Operations
Logs:

```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f nginx
```

Restart API:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod restart api
```

Rebuild after update:

```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod build api admin miniapp
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

## 10. Troubleshooting
API not starting:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs api
```

Nginx problems:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs nginx
```

Database bootstrap problems:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs prisma-init
```

MinIO bootstrap problems:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs minio-init
```
