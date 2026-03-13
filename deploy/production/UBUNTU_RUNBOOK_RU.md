# SellGram: Ubuntu Production Runbook

Короткий чеклист для запуска с нуля на Ubuntu 22.04/24.04.

## 0) Требования
- Ubuntu Server 22.04/24.04
- Домен(ы): `sellgram.uz`, `app.sellgram.uz`, `api.sellgram.uz`, `miniapp.sellgram.uz`
- Открыты порты `22`, `80`, `443` (если нужен прямой доступ)

## 1) Подключение и базовые пакеты
```bash
ssh root@YOUR_SERVER_IP
apt update && apt upgrade -y
apt install -y git curl ca-certificates openssl
```

## 2) Клонирование проекта
```bash
mkdir -p /opt
cd /opt
git clone https://github.com/FuzzyDi/sellgram.git
cd /opt/sellgram
```

## 3) Подготовка production env
```bash
cd /opt/sellgram/deploy/production
cp .env.prod.example .env.prod
nano .env.prod
```

Обязательно заполнить:
- `DB_PASSWORD`
- `REDIS_PASSWORD`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `SYSTEM_JWT_SECRET`
- `SYSTEM_ADMIN_EMAIL`
- `SYSTEM_ADMIN_PASSWORD`
- `ENCRYPTION_KEY`
- `S3_SECRET_KEY`

Важно:
- `PRISMA_SEED=true` только для первого демо-запуска.
- Для продакшена после первого старта лучше `PRISMA_SEED=false`.

## 4) Запуск контейнеров
```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Проверка:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
curl -i http://localhost:8088/health
```

Ожидаем `HTTP 200` и JSON `{"status":"ok",...}`.

## 5) Первичная инициализация данных (если нужно)
Если `system_admins` пустой:
```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T api sh -lc "cd /app/packages/prisma && npx tsx seed.ts"
```

Проверка:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
psql -U sellgram -d sellgram -c "select id,email from system_admins;"
```

## 6) Cloudflared (рекомендуется)
Если используете Cloudflare Tunnel:
1. Настроить `ingress` на `http://localhost:8088`.
2. Привязать DNS записи к tunnel.
3. Проверить:
```bash
curl -I https://sellgram.uz
curl -I https://app.sellgram.uz
curl -I https://api.sellgram.uz/health
curl -I https://miniapp.sellgram.uz
```

## 7) Логин в панели
- URL: `https://app.sellgram.uz`
- System admin логин: из `seed.ts`/`SYSTEM_ADMIN_EMAIL`
- Если логин падает с `Failed to fetch`: проверить `nginx.prod.conf` и проксирование `/api/`.

## 8) Telegram webhook
1. Узнать `STORE_ID`:
```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
psql -U sellgram -d sellgram -c "select id,name,\"createdAt\" from stores order by \"createdAt\" desc;"
```

2. Установить webhook:
```bash
BOT_TOKEN="YOUR_BOT_TOKEN"
STORE_ID="YOUR_STORE_ID"
curl "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=https://api.sellgram.uz/webhook/${STORE_ID}"
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

Если используете отдельный домен под webhook (например `shop.sbg.network`), URL должен совпадать с вашим `cloudflared ingress`.

## 9) Полезные команды эксплуатации
Логи:
```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f nginx
```

Перезапуск:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod restart api nginx
```

Обновление после `git pull`:
```bash
cd /opt/sellgram
git pull origin main
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
