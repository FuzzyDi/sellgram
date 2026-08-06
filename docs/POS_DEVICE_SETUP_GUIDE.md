# Создание и подключение POS-кассы с нуля — практическое руководство

> Это не замена `docs/POS_SYNC_API.md` (1920 строк, канонический контракт device-facing API) — это входная точка: чего в том документе намеренно нет (admin-часть создания устройства — см. §20 Flow A, п.1: "not part of this contract"), плюс пошаговый чек-лист с готовыми payload'ами для первого запуска. За деталями/edge cases по каждому шагу — ссылка на конкретный раздел `POS_SYNC_API.md`.

## Предварительные условия

- Тариф тенанта — **PRO или BUSINESS** (`posEnabled` в `packages/shared/src/constants/plans.ts`; на FREE все `/pos-devices*`/`/pos/v1/*` эндпоинты вернут 403 через `planGuard('posEnabled')`).
- У вызывающего админ-пользователя — право **`manageSettings`**.
- Store (`storeId`) уже существует в системе.
- Все административные вызовы — `Authorization: Bearer <JWT владельца/менеджера>`, префикс `/api/store-admin`.
- Все вызовы от самой кассы — префикс `/api`, без JWT (кроме `/activate`, см. шаг 2).

---

## Шаг 1 — регистрация устройства в админке

**`POST /api/store-admin/pos-devices`**
(`apps/api/src/modules/pos-sync/admin-routes.ts:651`)

Права: `manageSettings` + план `posEnabled`.

**Запрос:**
```json
{
  "storeId": "string, обязательно",
  "name": "string, обязательно, 1–200 символов",
  "deviceType": "string, опционально, макс. 50 символов, по умолчанию \"till\""
}
```

**Ответ `201`:**
```json
{
  "success": true,
  "data": {
    "device": {
      "id": "string",
      "name": "string",
      "deviceType": "string",
      "status": "PENDING",
      "storeId": "string",
      "createdAt": "ISO datetime"
    },
    "activationCode": "XXXX-XXXX",
    "expiresAt": "ISO datetime"
  }
}
```

`activationCode` — короткий, для ручного ввода на кассе, ограниченный срок жизни (`ACTIVATION_CODE_TTL_MS`). Именно его нужно передать тому, кто настраивает кассу физически.

---

## Шаг 2 — активация устройством

**`POST /api/pos/v1/activate`**
(`apps/api/src/modules/pos-sync/routes.ts:746`, соответствует `POS_SYNC_API.md` §7)

Без авторизации (это и есть bootstrap выдачи токена). **Жёсткий rate-limit: 5 запросов/минуту/IP** (§19) — код активации короткий и вводится вручную, поэтому брутфорсибелен без лимита.

**Запрос:**
```json
{
  "activationCode": "string, обязательно — код из шага 1",
  "deviceFingerprint": "string, обязательно — уникальный отпечаток устройства",
  "deviceName": "string, обязательно",
  "deviceType": "WINDOWS | ANDROID | LANDI | WEB",
  "appVersion": "string, обязательно",
  "deviceCode": "string, обязательно — публичный идентификатор кассы (не секрет), например \"POS-1\""
}
```

**Ответ `201`:**
```json
{
  "success": true,
  "data": {
    "tenantId": "string",
    "storeId": "string",
    "deviceId": "string",
    "accessToken": "pos_<64 hex>",
    "refreshToken": "posr_<64 hex>",
    "deviceCode": "string",
    "catalogVersion": "number",
    "settingsVersion": "number"
  },
  "requestId": "string"
}
```

**Критично:** `accessToken`/`refreshToken` показываются **один раз** — на сервере хранится только SHA-256-хеш. Касса обязана сохранить их у себя.

**Ошибки:** `404 INVALID_ACTIVATION_CODE`, `400 ACTIVATION_CODE_EXPIRED`, `400 ACTIVATION_CODE_ALREADY_USED`, `409 DEVICE_CODE_ALREADY_IN_USE` (этот `deviceCode` уже занят другим активным устройством в этом тенанте).

**Открытый момент (§4/§22):** `refreshToken` возвращается, но эндпоинта `POST /token/refresh` не существует — `accessToken` на практике долгоживущий. Не пытаться строить refresh-флоу против несуществующего эндпоинта.

---

## Шаг 3 — аутентификация всех последующих вызовов

Каждый запрос от кассы (кроме `/activate`) обязан нести **два заголовка одновременно** (§4):

```
Authorization: Bearer <accessToken>
X-Device-Code: <deviceCode>
```

Проверяются **как пара**, не независимо: сервер сначала резолвит устройство по `Authorization`, затем сверяет его сохранённый `deviceCode` с заголовком `X-Device-Code`.

- `X-Device-Code` отсутствует → `400 VALIDATION_ERROR`.
- `X-Device-Code` не совпадает с ожидаемым (валидный токен, но чужой/неверный код) → `401 UNAUTHORIZED` (не `400`!) + security-warning в логах.
- `deviceCode` никогда не заменяет `Authorization` — валидный `X-Device-Code` с невалидным токеном всё равно `401`.

---

## Шаг 4 — первичная синхронизация (перед началом продаж)

**`GET /api/pos/v1/catalog/snapshot?storeId=...&sinceVersion=...`** (§9)
`storeId` обязателен, должен совпадать со storeId аутентифицированного устройства. `sinceVersion` пока не используется (delta sync — отдельный эндпоинт, §26).

Если снапшот ещё не построен — `404 NO_SNAPSHOT_AVAILABLE`. Триггерится вручную:
**`POST /api/store-admin/pos-devices/catalog-snapshot`** — `{"storeId": "string"}`, форсит построение снапшота + рассылает команду `REFRESH_CATALOG` всем активным устройствам магазина.

**`GET /api/pos/v1/settings`** (§10) — без параметров, всегда для своего магазина. Магазин без настроенного POS всё равно получает валидный документ (8 пустых ключей, `version: 1`).

После получения обоих — касса помечает себя готовой к продажам.

---

## Шаг 5 — heartbeat (постоянно, на всё время работы)

**`POST /api/pos/v1/heartbeat`** (§8) — никогда не блокирует продажу; касса продолжает торговать и копить события в очереди независимо от успеха heartbeat.

**Запрос:**
```json
{
  "deviceId": "string",
  "localTime": "2026-07-03T10:00:00+05:00",
  "appVersion": "0.1.0",
  "localCoreVersion": "0.1.0",
  "shiftState": "CLOSED|OPEN|CLOSING|ERROR",
  "unsyncedEvents": 0,
  "fiscal": { "status": "OK|WARNING|ERROR|UNKNOWN", "terminalId": "string", "unsentCount": 0, "zRemaining": 0 },
  "printer": { "status": "OK|ERROR|UNKNOWN" },
  "network": { "status": "ONLINE|OFFLINE" }
}
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "serverTime": "ISO datetime",
    "licenseStatus": "ACTIVE|GRACE_PERIOD|EXPIRED|BLOCKED",
    "catalogVersion": 1,
    "settingsVersion": 1,
    "hasCommands": false,
    "pendingCommandsCount": 0
  }
}
```

`hasCommands: true` / `pendingCommandsCount > 0` — сигнал вызвать `GET /commands` (шаг 7). `catalogVersion`/`settingsVersion` изменились → перекачать шаг 4 заново.

---

## Шаг 6 — во время продажи: события

Все критичные события (`sale`, `fiscal`, `shift`, `stock` — **не** heartbeat) обязаны нести `idempotencyKey` формата:
```
deviceId:aggregateType:localId:eventType
```
Повтор с тем же ключом и тем же payload → тот же результат без побочных эффектов (не задвоит списание/начисление). Тот же ключ с другим payload → `409 IDEMPOTENCY_KEY_REUSED` (баг клиента).

| Эндпоинт | Раздел | Что фиксирует |
|---|---|---|
| `POST /api/pos/v1/sale-events` | §11 | `SALE_CREATED → SALE_PAID → SALE_FISCALIZED → SALE_COMPLETED`, последний деривит `StockLedgerEntry` |
| `POST /api/pos/v1/fiscal-events` | §12 | Реальный фискальный чек (ОФД): `FISCAL_STARTED/SUCCESS/FAILED/UNKNOWN`, `totalAmount` в **тийинах** |
| `POST /api/pos/v1/shift-events` | §13 | `SHIFT_OPENED`/`SHIFT_CLOSED` (закрытие = Z-отчёт, `zReportStatus`) |
| `POST /api/pos/v1/stock-events` | §14 | Движение остатка вне продажи; неизвестный товар — сохраняется с warning `UNKNOWN_PRODUCT`, без леджера |
| `POST /api/pos/v1/operator-events` | §24 | Логин/локаут кассира |
| `POST /api/pos/v1/payment-events` | §25 | Подтверждения от платёжных провайдеров (UzQR/Payme/Click) |

Продажа **никогда** не блокируется сетью — сначала локальная фискализация/печать, потом асинхронная отправка событий из очереди (Flow B/C в §20).

---

## Шаг 7 — облачные команды (опционально, по сигналу heartbeat)

**`GET /api/pos/v1/commands`** — до 10 `PENDING` за раз.
**`POST /api/pos/v1/commands/:id/ack`** — `{"status": "DONE|FAILED|IGNORED|RETRY_LATER"}`.

Команды создаются автоматически (`REFRESH_CATALOG`/`REFRESH_SETTINGS` при соответствующих admin-действиях) или вручную через `POST /api/store-admin/pos-devices/commands`.

---

## Управление устройствами из админки (справочно)

Полный список в `apps/api/src/modules/pos-sync/admin-routes.ts`, все под `/api/store-admin`:

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/pos-devices` | Список устройств магазина (флот) |
| GET/PUT | `/pos-devices/settings` | Настройки по умолчанию для магазина |
| GET/PUT | `/pos-devices/:deviceId/settings` | Настройки конкретного устройства |
| GET | `/pos-shifts` | Закрытые смены (Z-отчёты) |
| GET | `/pos-receipts` | Фискализированные чеки |
| GET | `/pos-analytics` | Агрегированная аналитика |
| GET/POST/PATCH/DELETE | `/pos-operators*` | Кассиры |
| GET/POST/PATCH/DELETE | `/payment-terminals*` | Платёжные терминалы |

---

## Критичные грабли (не изобретать заново)

1. **`FiscalEvent.totalAmount` — тийины, не сумы.** Делить на 100 при отображении (уже наступали на это в `PosReceipts.tsx`, см. коммит `a31da5b`).
2. **`totalAmount` всегда положительный** — направление (продажа/возврат) только в `receiptType`, не в знаке числа.
3. **Auth-заголовки — строго пара.** Отсутствие `X-Device-Code` ≠ то же самое, что его несовпадение (400 vs 401).
4. **`weightBarcode` в settings — известный баг**: схема на бэкенде не пропускает это поле (`.object()` без `.passthrough()`), UI тоже не умеет его слать. Если нужно — потребует правки схемы и панели в `PosSettings.tsx`, сейчас не работает.
5. **`refreshToken` — не используется.** Не строить refresh-флоу, эндпоинта нет.
6. **Идемпотентность у sale/stock-events vs fiscal/shift-events — два разных механизма** (payload-hash reuse-detection у первых, `eventId`-keyed silent replay у вторых) — не путать при реализации клиента.
