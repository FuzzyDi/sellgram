# SellGram Pre-Launch Runbook

## 1. Fill Production Env
Open [`.env.prod`](/E:/Projects/sellgram/deploy/production/.env.prod) and complete all `CHANGE_ME_*` fields.

Minimum required before public launch:
- `Database`
- `Redis`
- `Auth and encryption`
- `S3 / MinIO`
- `Public contact emails`
- `Legal entity`
- `Billing details`
- `SSL mode`

Optional but recommended:
- `GA_MEASUREMENT_ID` or `YANDEX_METRIKA_ID`
- `MONITOR_TELEGRAM_BOT_TOKEN`
- `MONITOR_TELEGRAM_CHAT_ID`

## 2. Prepare Nginx
If `SSL_MODE=letsencrypt`, place:

```bash
deploy/production/ssl/fullchain.pem
deploy/production/ssl/privkey.pem
```

Then generate the active nginx config:

```bash
cd /opt/sellgram/deploy/production
./prepare-nginx.sh
```

## 3. Build And Start
From the server:

```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Windows Server alternative:

```powershell
cd E:\Projects\sellgram\deploy\production
.\Deploy-Windows.ps1
```

## 4. Check Container Status
```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Expected:
- `postgres` healthy
- `redis` healthy
- `minio` up
- `minio-init` exited `0`
- `prisma-init` exited `0`
- `api` up
- `admin` up
- `miniapp` up
- `nginx` up

## 5. Health Smoke Test
HTTP:

```bash
curl http://localhost:8080/health
```

If HTTPS is enabled:

```bash
curl -k https://localhost:8443/health
```

Expected response:

```json
{"status":"ok"}
```

## 6. Landing And Admin Smoke Test
Open and verify:
- `https://sellgram.uz` or `http://YOUR_SERVER_IP:8080`
- `https://app.sellgram.uz`
- `https://miniapp.sellgram.uz`
- `https://api.sellgram.uz/health`

Quick checks:
- landing loads screenshots
- admin login page opens
- miniapp loads static shell
- `/health` returns `ok`

## 7. Analytics Check
If analytics is enabled, confirm CTA events are received after clicking:
- `hero_cta_click`
- `pricing_pro_click`
- `final_cta_click`

Reference: [ANALYTICS.md](/E:/Projects/sellgram/deploy/production/ANALYTICS.md)

## 8. Telegram Webhook
Set the webhook only after API health is green:

```powershell
$BOT_TOKEN = "TOKEN"
$STORE_ID = "STORE_ID"
Invoke-RestMethod "https://api.telegram.org/bot$BOT_TOKEN/setWebhook?url=https://api.sellgram.uz/webhook/$STORE_ID"
```

Then verify:

```powershell
Invoke-RestMethod "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

## 9. Monitoring And Backups
Install cron entries:

```bash
crontab -e
```

Add:

```cron
0 3 * * * cd /opt/sellgram/deploy/production && BACKUP_DIR=/opt/sellgram/backups ./backup-db.sh >> /var/log/sellgram-backup.log 2>&1
*/5 * * * * cd /opt/sellgram/deploy/production && ./monitor-health.sh >> /var/log/sellgram-health.log 2>&1
```

Windows Server alternatives:

```powershell
cd E:\Projects\sellgram\deploy\production
.\Backup-Db.TaskScheduler.example.ps1
.\Monitor-Health.TaskScheduler.example.ps1
```

Manual Windows commands:

```powershell
cd E:\Projects\sellgram\deploy\production
.\Backup-Db.ps1
.\Monitor-Health.ps1
```

## 10. Final Go/No-Go
Go live only if all are true:
- no `CHANGE_ME_*` remains in [`.env.prod`](/E:/Projects/sellgram/deploy/production/.env.prod)
- health endpoint is stable
- webhook is accepted by Telegram
- analytics receives events if enabled
- backup and monitoring cron entries are installed
