# 🪟 ShopBot — Запуск на Windows

## Требования

1. **Node.js 20 LTS** — https://nodejs.org/
2. **pnpm** — менеджер пакетов
3. **Docker Desktop** — https://www.docker.com/products/docker-desktop/
4. **Git** (опционально)

---

## Шаг 1: Установка инструментов

Откройте **PowerShell** (от администратора):

```powershell
# Проверить Node.js
node --version   # должно быть v20.x.x или выше

# Установить pnpm
npm install -g pnpm@9

# Проверить Docker
docker --version
docker compose version
```

> ⚠️ Docker Desktop должен быть запущен (иконка кита в трее)

---

## Шаг 2: Распаковка и установка

```powershell
# Распаковать архив (или скопировать папку shopbot)
cd C:\projects\shopbot

# Установить зависимости
pnpm install
```

---

## Шаг 3: Запуск инфраструктуры

```powershell
# Поднять PostgreSQL + Redis + MinIO
docker compose up -d

# Проверить что контейнеры работают
docker compose ps
```

Должны быть запущены:
- `shopbot-db` (PostgreSQL) → порт 5433
- `shopbot-redis` (Redis) → порт 6379
- `shopbot-minio` (MinIO) → порт 9000/9001

---

## Шаг 4: Настройка окружения

```powershell
# Скопировать .env
Copy-Item .env.example .env
```

Откройте `.env` в редакторе и убедитесь что значения корректные.
Для локальной разработки **менять ничего не нужно** — дефолты работают.

---

## Шаг 5: Инициализация базы данных

```powershell
# Генерировать Prisma Client
pnpm db:generate

# Создать таблицы
pnpm db:migrate --name init

# Заполнить демо-данными
pnpm db:seed
```

После seed увидите:
```
🎉 Seed completed successfully!
📋 Demo credentials:
   Email: admin@demo.com
   Password: admin123
```

---

## Шаг 6: Запуск

### Вариант A: Всё одной командой (Turborepo)

```powershell
pnpm dev
```

### Вариант B: Каждый сервис отдельно (удобнее для отладки)

Откройте **3 терминала**:

**Терминал 1 — API:**
```powershell
cd apps\api
pnpm dev
```
→ http://localhost:4000

**Терминал 2 — Admin Panel:**
```powershell
cd apps\admin
pnpm dev
```
→ http://localhost:5173

**Терминал 3 — Mini App:**
```powershell
cd apps\miniapp
pnpm dev
```
→ http://localhost:5174

---

## Шаг 7: Проверка

1. **API Health:** http://localhost:4000/health → `{"status":"ok"}`

2. **Admin Panel:** http://localhost:5173
   - Логин: `admin@demo.com` / `admin123`
   - Увидите дашборд с метриками

3. **MinIO Console:** http://localhost:9001
   - Логин: `minioadmin` / `minioadmin`

4. **Mini App:** http://localhost:5174
   - В браузере покажет каталог (без Telegram будут ошибки auth — нормально)

---

## Шаг 8: Подключение Telegram бота

1. Создайте бота через [@BotFather](https://t.me/BotFather):
   - `/newbot` → выберите имя → получите **токен**

2. В Admin Panel → Настройки → Магазины → Создать магазин:
   - Вставьте токен бота
   - Нажмите "Активировать"

3. Для вебхуков нужен **публичный HTTPS URL**. Для разработки используйте:

   ```powershell
   # Установить ngrok: https://ngrok.com/download
   ngrok http 4000
   ```

   Скопируйте HTTPS URL (например `https://abc123.ngrok.io`) и установите вебхук:

   ```powershell
   # Замените YOUR_BOT_TOKEN и YOUR_NGROK_URL
   curl "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook?url=YOUR_NGROK_URL/webhook/STORE_ID"
   ```

---

## Возможные проблемы

### ❌ `pnpm: command not found`
```powershell
npm install -g pnpm@9
# Перезапустите терминал
```

### ❌ `docker compose: command not found`
Установите Docker Desktop и перезагрузитесь.

### ❌ `ECONNREFUSED 127.0.0.1:5433`
PostgreSQL не запущен:
```powershell
docker compose up -d postgres
docker compose logs postgres
```

### ❌ `Cannot find module '@prisma/client'`
```powershell
pnpm db:generate
```

### ❌ Prisma migration ошибка
```powershell
# Удалить и пересоздать БД
docker compose down -v
docker compose up -d
pnpm db:migrate --name init
pnpm db:seed
```

### ❌ EACCES / Permission denied
Запустите PowerShell от администратора.

### ❌ Port already in use
```powershell
# Найти процесс на порту 4000
netstat -ano | findstr :4000
# Убить процесс
taskkill /PID <PID> /F
```

### ❌ Mini App не работает в браузере
Это нормально — Mini App требует Telegram WebApp SDK.
Для тестирования:
- Используйте [Telegram WebApp test environment](https://core.telegram.org/bots/webapps#testing-mini-apps)
- Или BotFather: `/mybots` → выберите бота → Bot Settings → Menu Button → укажите URL Mini App

---

## Полезные команды

```powershell
# Prisma Studio (визуальный редактор БД)
pnpm db:studio
# → Откроется http://localhost:5555

# Проверка TypeScript без сборки
cd apps\api && pnpm lint

# Остановить Docker
docker compose down

# Полная очистка (с удалением данных)
docker compose down -v
```

---

## Структура URLs

| Сервис | URL | Описание |
|--------|-----|----------|
| API | http://localhost:4000 | Fastify backend |
| Admin | http://localhost:5173 | Панель управления |
| Mini App | http://localhost:5174 | Telegram WebApp |
| MinIO Console | http://localhost:9001 | Хранилище файлов |
| Prisma Studio | http://localhost:5555 | Редактор БД |


