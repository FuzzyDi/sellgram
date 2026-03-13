# рџ›’ SellGram вЂ” РќР°СЃС‚СЂРѕР№РєР° РґРѕРјРµРЅРѕРІ sellgram.uz

## РђСЂС…РёС‚РµРєС‚СѓСЂР° РґРѕРјРµРЅРѕРІ

```
sellgram.uz          в†’ Landing (Р»РµРЅРґРёРЅРі РґР»СЏ РїСЂРёРІР»РµС‡РµРЅРёСЏ РєР»РёРµРЅС‚РѕРІ)
                       РџРѕСЂС‚: 4000 (РѕС‚РґР°С‘С‚СЃСЏ API РєР°Рє СЃС‚Р°С‚РёРєР°)

app.sellgram.uz      в†’ Admin Panel (СѓРїСЂР°РІР»РµРЅРёРµ РјР°РіР°Р·РёРЅРѕРј)
                       РџРѕСЂС‚: 5173 (Vite dev / nginx РІ РїСЂРѕРґРµ)

miniapp.sellgram.uz  в†’ Telegram Mini App (РјР°РіР°Р·РёРЅ РґР»СЏ РїРѕРєСѓРїР°С‚РµР»РµР№)
                       РџРѕСЂС‚: 5174 (Vite dev / nginx РІ РїСЂРѕРґРµ)

api.sellgram.uz      в†’ API Backend (Fastify + Prisma + Grammy)
                       РџРѕСЂС‚: 4000

admin.sellgram.uz    в†’ Р РµРґРёСЂРµРєС‚ РЅР° app.sellgram.uz
```

## РЁР°Рі 1: DNS Р·Р°РїРёСЃРё РІ Cloudflare

Р”РѕРјРµРЅ sellgram.uz РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РІ Cloudflare. Р”РѕР±Р°РІСЊС‚Рµ CNAME Р·Р°РїРёСЃРё:

```powershell
# РЎРѕР·РґР°Р№С‚Рµ DNS СЂРѕСѓС‚С‹ РґР»СЏ tunnel
cloudflared tunnel route dns sbg-local sellgram.uz
cloudflared tunnel route dns sbg-local app.sellgram.uz
cloudflared tunnel route dns sbg-local admin.sellgram.uz
cloudflared tunnel route dns sbg-local miniapp.sellgram.uz
cloudflared tunnel route dns sbg-local api.sellgram.uz
```

РР»Рё РІСЂСѓС‡РЅСѓСЋ РІ Cloudflare Dashboard:
| Type  | Name    | Content                                  | Proxy |
|-------|---------|------------------------------------------|-------|
| CNAME | @       | 171cfcbf-...cfunnel.com                  | вњ…    |
| CNAME | app     | 171cfcbf-...cfunnel.com                  | вњ…    |
| CNAME | admin   | 171cfcbf-...cfunnel.com                  | вњ…    |
| CNAME | miniapp | 171cfcbf-...cfunnel.com                  | вњ…    |
| CNAME | api     | 171cfcbf-...cfunnel.com                  | вњ…    |

## РЁР°Рі 2: Tunnel config

РЎРєРѕРїРёСЂСѓР№С‚Рµ `.cloudflared/config.yml` РІ `C:\Users\РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ\.cloudflared\config.yml`

```powershell
Copy-Item C:\Projects\sellgram\.cloudflared\config.yml C:\Users\РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ\.cloudflared\config.yml -Force
```

## РЁР°Рі 3: РџРµСЂРµР·Р°РїСѓСЃРє tunnel

```powershell
# РћСЃС‚Р°РЅРѕРІРёС‚Рµ С‚РµРєСѓС‰РёР№ tunnel (Ctrl+C РёР»Рё)
cloudflared tunnel run sbg-local
```

## РЁР°Рі 4: РћР±РЅРѕРІРёС‚Рµ webhook Р±РѕС‚Р°

```powershell
$BOT_TOKEN = "YOUR_BOT_TOKEN"
$STORE_ID = "YOUR_STORE_ID"

# РќРѕРІС‹Р№ webhook URL
Invoke-RestMethod "https://api.telegram.org/bot$BOT_TOKEN/setWebhook?url=https://api.sellgram.uz/webhook/$STORE_ID"

# РћР±РЅРѕРІРёС‚СЊ miniAppUrl
$token = (Invoke-RestMethod -Method POST -Uri "http://localhost:4000/api/store-admin/auth/login" -ContentType "application/json" -Body '{"email":"admin@demo.com","password":"admin123"}').data.accessToken

Invoke-RestMethod -Method PATCH -Uri "http://localhost:4000/api/store-admin/stores/$STORE_ID" -ContentType "application/json" -Headers @{Authorization="Bearer $token"} -Body "{`"miniAppUrl`":`"https://miniapp.sellgram.uz?storeId=$STORE_ID`"}"
```

## РЁР°Рі 5: РџРµСЂРµР·Р°РїСѓСЃРє

```powershell
cd C:\Projects\sellgram
pnpm dev
```

## РџСЂРѕРІРµСЂРєР°

- https://sellgram.uz в†’ Р›РµРЅРґРёРЅРі
- https://app.sellgram.uz в†’ РђРґРјРёРЅРєР° (Р»РѕРіРёРЅ)
- https://api.sellgram.uz/health в†’ {"status":"ok"}
- Telegram Р±РѕС‚ в†’ /start в†’ "РћС‚РєСЂС‹С‚СЊ РјР°РіР°Р·РёРЅ" в†’ https://miniapp.sellgram.uz


