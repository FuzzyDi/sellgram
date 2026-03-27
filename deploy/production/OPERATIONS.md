# SellGram — Operations Runbook

Production server: `ssh rashid@192.168.80.29`
App directory: `/opt/sellgram`
All commands below are run **on the server** unless stated otherwise.

---

## Deploy

```bash
# On local machine: commit + push first
git push origin main

# On server:
cd /opt/sellgram
bash deploy/production/update.sh
```

The script: git pull → docker build → prisma migrate deploy → force-recreate containers → health check → nginx restart.

**Rule:** never edit a previously applied Prisma migration. Always create a new one.

---

## Rollback

```bash
cd /opt/sellgram
git log --oneline -10                        # find previous good commit
git checkout <commit-sha> -- .               # revert files (not history)
# OR just redeploy the previous image if DB schema didn't change:
docker compose -f deploy/production/docker-compose.prod.yml \
  --env-file deploy/production/.env.prod \
  up -d --force-recreate api admin miniapp
```

If a migration was applied, restore the database first (see Backup & Restore).

---

## Check service health

```bash
cd /opt/sellgram/deploy/production
./monitor-health.sh                          # manual health check + disk check
docker compose -f docker-compose.prod.yml \
  --env-file .env.prod ps                    # container status
docker compose -f docker-compose.prod.yml \
  --env-file .env.prod logs --tail=50 api    # recent api logs
```

---

## Backup & Restore

### Create backup manually
```bash
cd /opt/sellgram/deploy/production
BACKUP_DIR=/opt/sellgram/backups ./backup-db.sh
ls -lh /opt/sellgram/backups/
```

Automatic backup runs daily at **03:00** via cron.

### Verify latest backup (dry-run restore into throwaway container)
```bash
cd /opt/sellgram/deploy/production
BACKUP_DIR=/opt/sellgram/backups ./verify-backup.sh
```

Runs automatically every **Sunday 04:00** via cron. Sends Telegram alert on pass/fail.

### Restore to production (emergency)
```bash
# 1. Stop the API to prevent writes during restore
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod stop api

# 2. Restore
./restore-db.sh /opt/sellgram/backups/postgres_YYYYMMDD_HHMMSS.sql.gz

# 3. Start API again
docker compose -f docker-compose.prod.yml --env-file .env.prod start api
```

---

## Database access

```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

---

## Redis access

```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec redis redis-cli
```

Useful commands:
```
KEYS *                    # all keys (careful on large datasets)
LLEN bull:broadcasts:wait # broadcast queue depth
INFO memory               # memory usage
```

---

## Rotate API keys (tenant)

API keys expire after 90 days. If a tenant reports 401 errors on their key:

1. Admin panel → Settings → API Keys → create new key
2. Provide new key to tenant
3. Delete the expired key

---

## Rotate application secrets

In `.env.prod` on the server:

```bash
# Generate new JWT secret
openssl rand -base64 48

# Generate new webhook signing key (if needed)
openssl rand -hex 32
```

After updating `.env.prod`, redeploy:
```bash
bash deploy/production/update.sh
```

---

## Add a new admin user

```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "INSERT INTO users (id, \"tenantId\", email, \"passwordHash\", role, \"createdAt\", \"updatedAt\")
   VALUES (gen_random_uuid(), '<tenant-id>', '<email>',
   crypt('<password>', gen_salt('bf')), 'OWNER', now(), now());"
```

Or use the System Admin panel at `/#/system-admin` → Users.

---

## Monitor disk usage

```bash
df -h /                                      # current usage
du -sh /opt/sellgram/backups/                # backup dir size
du -sh /var/lib/docker/                      # docker volumes

# Clean up old backups (keep last 14 days)
find /opt/sellgram/backups -name "*.sql.gz" -mtime +14 -delete
```

Alert threshold: **85%** (configured in `monitor-health.sh` via `MONITOR_DISK_THRESHOLD`).

---

## View cron jobs

```bash
crontab -l
# Expected:
# */5 * * * *  monitor-health.sh    — health + disk check, Telegram alert
# 0 3 * * *    backup-db.sh         — nightly DB backup
# 0 4 * * 0    verify-backup.sh     — weekly backup restore test
```

---

## Logs

```bash
tail -f /var/log/sellgram-health.log        # health check log
tail -f /var/log/sellgram-backup.log        # backup + verify log
docker compose ... logs -f api              # live API logs
```

---

## Emergency: restart all services

```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  restart
```

Or restart a single service:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  restart api
```
