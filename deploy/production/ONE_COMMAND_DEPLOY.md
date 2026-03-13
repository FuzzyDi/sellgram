# SellGram: One-Command Deploy (Ubuntu)

Минимальный сценарий быстрого запуска на чистом Ubuntu.

## 1) Базовая подготовка
```bash
ssh root@YOUR_SERVER_IP
apt update && apt upgrade -y
apt install -y git curl ca-certificates openssl
```

## 2) Код + env
```bash
cd /opt
git clone https://github.com/FuzzyDi/sellgram.git
cd /opt/sellgram/deploy/production
cp .env.prod.example .env.prod
nano .env.prod
```

Заполни минимум:
- `DB_PASSWORD`
- `REDIS_PASSWORD`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `SYSTEM_JWT_SECRET`
- `SYSTEM_ADMIN_EMAIL`
- `SYSTEM_ADMIN_PASSWORD`
- `ENCRYPTION_KEY`
- `S3_SECRET_KEY`

## 3) Запуск
```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## 4) Проверка
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
curl -i http://localhost:8088/health
```

## 5) Первый вход (если system_admins пустой)
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T api sh -lc "cd /app/packages/prisma && npx tsx seed.ts"
```

## 6) Webhook
```bash
STORE_ID=$(docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres psql -U sellgram -d sellgram -Atc "select id from stores order by \"createdAt\" desc limit 1;")
BOT_TOKEN="YOUR_BOT_TOKEN"
curl "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=https://api.sellgram.uz/webhook/${STORE_ID}"
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

## 7) Обновление релиза
```bash
cd /opt/sellgram
git pull origin main
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
