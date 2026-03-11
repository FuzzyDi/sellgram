# 🛒 SellGram — Настройка доменов sellgram.uz

## Архитектура доменов

```
sellgram.uz          → Landing (лендинг для привлечения клиентов)
                       Порт: 4000 (отдаётся API как статика)

app.sellgram.uz      → Admin Panel (управление магазином)
                       Порт: 5173 (Vite dev / nginx в проде)

miniapp.sellgram.uz  → Telegram Mini App (магазин для покупателей)
                       Порт: 5174 (Vite dev / nginx в проде)

api.sellgram.uz      → API Backend (Fastify + Prisma + Grammy)
                       Порт: 4000

admin.sellgram.uz    → Редирект на app.sellgram.uz
```

## Шаг 1: DNS записи в Cloudflare

Домен sellgram.uz должен быть в Cloudflare. Добавьте CNAME записи:

```powershell
# Создайте DNS роуты для tunnel
cloudflared tunnel route dns sbg-local sellgram.uz
cloudflared tunnel route dns sbg-local app.sellgram.uz
cloudflared tunnel route dns sbg-local admin.sellgram.uz
cloudflared tunnel route dns sbg-local miniapp.sellgram.uz
cloudflared tunnel route dns sbg-local api.sellgram.uz
```

Или вручную в Cloudflare Dashboard:
| Type  | Name    | Content                                  | Proxy |
|-------|---------|------------------------------------------|-------|
| CNAME | @       | 171cfcbf-...cfunnel.com                  | ✅    |
| CNAME | app     | 171cfcbf-...cfunnel.com                  | ✅    |
| CNAME | admin   | 171cfcbf-...cfunnel.com                  | ✅    |
| CNAME | miniapp | 171cfcbf-...cfunnel.com                  | ✅    |
| CNAME | api     | 171cfcbf-...cfunnel.com                  | ✅    |

## Шаг 2: Tunnel config

Скопируйте `.cloudflared/config.yml` в `C:\Users\Администратор\.cloudflared\config.yml`

```powershell
Copy-Item C:\Projects\shopbot\.cloudflared\config.yml C:\Users\Администратор\.cloudflared\config.yml -Force
```

## Шаг 3: Перезапуск tunnel

```powershell
# Остановите текущий tunnel (Ctrl+C или)
cloudflared tunnel run sbg-local
```

## Шаг 4: Обновите webhook бота

```powershell
$BOT_TOKEN = "YOUR_BOT_TOKEN"
$STORE_ID = "YOUR_STORE_ID"

# Новый webhook URL
Invoke-RestMethod "https://api.telegram.org/bot$BOT_TOKEN/setWebhook?url=https://api.sellgram.uz/webhook/$STORE_ID"

# Обновить miniAppUrl
$token = (Invoke-RestMethod -Method POST -Uri "http://localhost:4000/api/admin/auth/login" -ContentType "application/json" -Body '{"email":"admin@demo.com","password":"admin123"}').data.accessToken

Invoke-RestMethod -Method PATCH -Uri "http://localhost:4000/api/admin/stores/$STORE_ID" -ContentType "application/json" -Headers @{Authorization="Bearer $token"} -Body "{`"miniAppUrl`":`"https://miniapp.sellgram.uz?storeId=$STORE_ID`"}"
```

## Шаг 5: Перезапуск

```powershell
cd C:\Projects\shopbot
pnpm dev
```

## Проверка

- https://sellgram.uz → Лендинг
- https://app.sellgram.uz → Админка (логин)
- https://api.sellgram.uz/health → {"status":"ok"}
- Telegram бот → /start → "Открыть магазин" → https://miniapp.sellgram.uz
