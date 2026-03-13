# ☁️ SellGram + Cloudflare Tunnel (Windows)

> Бесплатный HTTPS для Telegram webhook без VPS и публичного IP.

---

## Как это работает

```
Telegram → https://sellgram.yourdomain.com → Cloudflare → cloudflared.exe → localhost:4000
```

Cloudflare Tunnel создаёт зашифрованный туннель от вашего компьютера до Cloudflare.
Бесплатный HTTPS, не нужен статический IP, не нужно открывать порты.

---

## Предварительные требования

- ✅ Аккаунт Cloudflare (бесплатный)
- ✅ Домен, добавленный в Cloudflare (NS-записи указывают на Cloudflare)
- ✅ `cloudflared.exe` уже установлен (вы сказали что есть 2 туннеля)

---

## Шаг 1: Создание туннеля

У вас уже есть `cloudflared.exe` и 2 туннеля. Создаём третий:

```powershell
# Проверить существующие туннели
cloudflared tunnel list

# Создать новый туннель для SellGram
cloudflared tunnel create sellgram
```

Запомните **Tunnel ID** (будет что-то вроде `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).

---

## Шаг 2: DNS-запись

Создайте CNAME для вашего домена:

```powershell
# Замените yourdomain.com на ваш домен
cloudflared tunnel route dns sellgram sellgram.yourdomain.com
```

Это создаст CNAME-запись `sellgram.yourdomain.com` → `TUNNEL_ID.cfargotunnel.com`.

Если хотите несколько поддоменов:

```powershell
cloudflared tunnel route dns sellgram admin.yourdomain.com
cloudflared tunnel route dns sellgram app.yourdomain.com
```

---

## Шаг 3: Конфигурация туннеля

Откройте (или создайте) файл конфигурации.

Если у вас уже есть `config.yml` для других туннелей, вам нужен **отдельный конфиг** для SellGram.

Создайте файл `C:\Users\<ВАШ_ЮЗЕР>\.cloudflared\sellgram-config.yml`:

### Вариант A: Один поддомен (всё через один URL)

```yaml
tunnel: TUNNEL_ID_HERE
credentials-file: C:\Users\<ВАШ_ЮЗЕР>\.cloudflared\TUNNEL_ID_HERE.json

ingress:
  # Всё на один домен → API на порту 4000
  - hostname: sellgram.yourdomain.com
    service: http://localhost:4000
  # Catch-all (обязательно)
  - service: http_status:404
```

### Вариант B: Разные поддомены для Admin и Mini App

```yaml
tunnel: TUNNEL_ID_HERE
credentials-file: C:\Users\<ВАШ_ЮЗЕР>\.cloudflared\TUNNEL_ID_HERE.json

ingress:
  # API + Webhook
  - hostname: sellgram.yourdomain.com
    service: http://localhost:4000
  # Admin Panel
  - hostname: admin.yourdomain.com
    service: http://localhost:5173
  # Mini App (Telegram)
  - hostname: app.yourdomain.com
    service: http://localhost:5174
  # Catch-all
  - service: http_status:404
```

> **Рекомендую Вариант A** — проще настроить. Nginx не нужен, Vite proxy всё разрулит.

---

## Шаг 4: Запуск туннеля

```powershell
cloudflared tunnel --config C:\Users\<ВАШ_ЮЗЕР>\.cloudflared\sellgram-config.yml run sellgram
```

Должны увидеть:
```
INF Connection established connIndex=0 ...
INF Connection established connIndex=1 ...
```

### Запуск как сервис Windows (чтобы работал в фоне)

```powershell
# От администратора
cloudflared service install --config C:\Users\<ВАШ_ЮЗЕР>\.cloudflared\sellgram-config.yml
```

> ⚠️ Если у вас уже есть cloudflared service, то нельзя создать второй.
> В этом случае используйте **один конфиг** с несколькими ingress-правилами
> для всех ваших туннелей (см. Шаг 6).

---

## Шаг 5: Проверка

1. Убедитесь что SellGram запущен:
   ```powershell
   # Терминал 1: Docker
   docker compose up -d

   # Терминал 2: API
   cd C:\Projects\sellgram\apps\api
   pnpm dev
   # → Server running on http://localhost:4000

   # Терминал 3: Admin (опционально, для dev)
   cd C:\Projects\sellgram\apps\admin
   pnpm dev
   ```

2. Проверьте туннель:
   - https://sellgram.yourdomain.com/health → `{"status":"ok"}`
   - https://sellgram.yourdomain.com → Admin Panel (если запущен)

---

## Шаг 6: Если уже есть 2 туннеля на одном сервисе

Если cloudflared уже запущен как сервис Windows с другими туннелями,
лучше **добавить SellGram в существующий конфиг**, а не создавать отдельный.

Найдите ваш текущий `config.yml`:
```powershell
# Обычно здесь:
type C:\Users\<ВАШ_ЮЗЕР>\.cloudflared\config.yml
```

Добавьте SellGram в существующий `ingress`:

```yaml
tunnel: ВАШ_СУЩЕСТВУЮЩИЙ_TUNNEL_ID
credentials-file: ...

ingress:
  # === Ваши существующие правила ===
  - hostname: existing1.yourdomain.com
    service: http://localhost:XXXX
  - hostname: existing2.yourdomain.com
    service: http://localhost:YYYY

  # === Добавить SellGram ===
  - hostname: sellgram.yourdomain.com
    service: http://localhost:4000

  # Catch-all (должен быть последним!)
  - service: http_status:404
```

Затем просто перезапустите сервис:
```powershell
# Перезапуск cloudflared service
net stop cloudflared
net start cloudflared
```

И добавьте DNS-запись:
```powershell
cloudflared tunnel route dns ВАШ_TUNNEL_NAME sellgram.yourdomain.com
```

---

## Шаг 7: Настройка Telegram Webhook

Теперь у вас есть HTTPS URL! Настройте вебхук:

```powershell
# Замените значения
$BOT_TOKEN = "7123456789:AAHxxxxxxx"
$STORE_ID = "id-из-admin-panel"
$WEBHOOK_URL = "https://sellgram.yourdomain.com/webhook/$STORE_ID"

# Установить вебхук
curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook?url=$WEBHOOK_URL"

# Проверить
curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

---

## Шаг 8: Обновить .env для Cloudflare

После настройки туннеля обновите `.env`:

```env
APP_URL=https://sellgram.yourdomain.com
ADMIN_URL=https://sellgram.yourdomain.com
MINIAPP_URL=https://sellgram.yourdomain.com/app
```

---

## Итоговая архитектура

```
┌─────────────────────────────────────────────────┐
│  Ваш Windows ПК                                │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ PostgreSQL│  │  Redis   │  │  MinIO   │     │
│  │  :5433   │  │  :6379   │  │  :9000   │     │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘     │
│       └──────────────┼─────────────┘           │
│                 ┌────┴─────┐                   │
│                 │ API :4000│ ← Fastify + Grammy │
│                 └────┬─────┘                   │
│                      │                         │
│              ┌───────┴───────┐                 │
│              │ cloudflared   │                 │
│              └───────┬───────┘                 │
└──────────────────────┼─────────────────────────┘
                       │ encrypted tunnel
               ┌───────┴───────┐
               │  Cloudflare   │
               │  HTTPS/SSL    │
               └───────┬───────┘
                       │
          https://sellgram.yourdomain.com
                       │
               ┌───────┴───────┐
               │   Telegram    │
               │   Webhook     │
               └───────────────┘
```

---

## FAQ

**Q: Нужно ли держать ПК включённым?**
A: Да, пока бот работает. Когда ПК выключен — бот не отвечает.

**Q: Сколько это стоит?**
A: Бесплатно. Cloudflare Tunnel бесплатный для любого количества.

**Q: Можно ли потом перенести на VPS?**
A: Да, просто скопируете проект, поменяете конфиг туннеля или уберёте его.

**Q: Мой ПК за NAT/без белого IP — будет работать?**
A: Да! В этом и суть Cloudflare Tunnel — не нужен белый IP.
