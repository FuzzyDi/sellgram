# SellGram → SBGCloud: технический аудит (Этап 1)

> Дата аудита: 2026-07-02
> Ветка: `feature/sbgcloud-audit`
> Объём: только чтение — код не менялся. Сборка и тесты не запускались.

Цель документа — зафиксировать фактическое состояние репозитория `sellgram` перед тем, как использовать его как основу (полностью или частично) для SBGCloud, включая находки, которые нужно решить до переиспользования кода.

---

## 1. Current architecture

**Тип:** монорепозиторий на pnpm workspaces (`pnpm-workspace.yaml`: `packages/*`, `apps/*`) + Turborepo (`turbo.json`) для оркестрации `build`/`dev`/`lint`/`test`.

**Приложения (`apps/`):**

| App | Стек | Назначение |
|---|---|---|
| `api` | Fastify 4 + Prisma 5 + TypeScript (ESM), tsx/vitest | Единый бэкенд: store-admin API, shop/mini-app API, public API, system-admin API, Telegram-боты (Grammy), фоновые джобы (BullMQ), платёжные вебхуки |
| `admin` | React 18 + Vite + Tailwind + Recharts | Админ-панель тенанта (owner/manager/operator/marketer) |
| `miniapp` | React 18 + Vite + Tailwind, `@tma.js/sdk` (по ADR-017) | Telegram Mini App — витрина/корзина/чекаут для покупателя |
| `landing` | Статический HTML (без `package.json`, не pnpm-пакет) | Лендинг, privacy/terms, отдаётся напрямую из `apps/api/src/app.ts` чтением файлов с диска (`fs.readFileSync(..'../landing'..)`) |

**Пакеты (`packages/`):**

| Package | Назначение |
|---|---|
| `prisma` | Единственная Prisma-схема (`schema.prisma`), миграции, `seed.ts` — общий источник данных для всего API |
| `shared` | Общие типы/константы: `order-status.ts` (машина статусов заказа), `plans.ts`, `payment-methods.ts` |

**Инфраструктура (`docker-compose.yml`):** Postgres 16, Redis 7, MinIO (S3-совместимое хранилище). Продакшн-деплой — отдельный `deploy/production/` со своим `docker-compose.prod.yml`, nginx-конфигами, bash/PowerShell скриптами бэкапа и мониторинга.

**Модель мультитенантности:** row-level, единая база данных, `tenantId` на большинстве таблиц (ADR-003). Нет schema-per-tenant и нет DB-per-tenant.

**Two admin domains:** `ARCHITECTURE_RULES.md` требует чёткого разделения Platform Admin / Tenant Admin — и в коде это в целом соблюдено: `system-admin` модуль (SystemAdmin-модель, отдельный `SYSTEM_JWT_SECRET`, отдельный логин) полностью отделён от tenant-scoped `store-admin/*` (User/Tenant, `JWT_SECRET`). Хорошее соответствие декларируемой архитектуре.

**Важно для SBGCloud:** `ARCHITECTURE_RULES.md` уже описывает предлагаемые доменные границы (`system-admin`, `tenant-admin`, `store`, `catalog`, `orders`, `payments-integration`, `notifications`) — по сути, это черновой чертёж SBGCloud, уже лежащий в этом репозитории. Текущий код лишь частично соответствует этой модульности (см. §4).

---

## 2. Existing modules

`apps/api/src/modules/` (23 модуля, все монтируются в `app.ts`):

- **Auth & identity:** `auth` (регистрация/логин/JWT/refresh/forgot-password через Telegram-код/team-users с permissions), `api-keys` (публичные API-ключи тенанта), `webhook` (исходящие вебхуки тенанта)
- **Платформенное управление:** `system-admin` (тенанты, инвойсы, dashboard, monitor-настройки, subscription reminders, plan overrides)
- **Каталог:** `product`, `category` (с `CategoryAttribute`)
- **Заказы и коммерция:** `order`, `customer`, `delivery`, `loyalty` (тиры, рефералы), `banner`, `broadcast`
- **Закупки:** `procurement` (Purchase Orders, landed cost — ADR-012), `supplier`
- **Платежи:** `payment` (shop-facing) и отдельно `payments-integration` (store-admin: `StorePaymentMethod` CRUD) — см. замечание о дублировании ниже
- **Интеграции:** `public-api` (внешний API по API-ключу), `import` (Excel/CSV импорт товаров)
- **Прочее:** `analytics`, `subscription`, `audit`, `bot` (Telegram-бот покупателя: `shop-api`, `cart.service`, `checkout.service`, `shop-auth` — HMAC-валидация `initData`)

Отдельно от `modules/`: `apps/api/src/payments/` — провайдер-агностичный слой (providers: cash/click/manual-transfer/payme/telegram/external; webhooks: click/generic/payme/uzum с проверкой подписи), `apps/api/src/bot/bot-manager.ts` (управление множеством Telegram-ботов, по одному на Store — ADR-002/ADR-006), `apps/api/src/jobs/` (daily-digest, broadcast, scheduled-reports — BullMQ, ADR-014).

**Наблюдение:** есть заметное покрытие тестами (`*.test.ts` рядом почти с каждым модулем, плюс несколько `*.integration.test.ts`), что нетипично хорошо для проекта такого масштаба и облегчает безопасный рефакторинг при выделении модулей под SBGCloud.

---

## 3. Database/domain model summary

`packages/prisma/schema.prisma` — 891 строка, ~35 моделей, 12 enum'ов. Основные кластеры:

1. **Tenant & Auth:** `Tenant`, `User` (роли OWNER/MANAGER/OPERATOR/MARKETER + JSON `permissions` для гранулярных прав), `ApiKey`, `Webhook`
2. **Store:** `Store` (bot-per-store, `botToken` шифруется AES-256-GCM — ADR-007)
3. **Каталог:** `Category`(дерево через `parentId`) → `CategoryAttribute`, `Product` → `ProductImage`/`ProductVariant`/`StockMovement`
4. **Customers:** `Customer` (уникален по `tenantId+telegramId`), `CustomerAddress`, `CartItem` (server-side cart — ADR-004)
5. **Orders:** `Order` (9-статусная машина — ADR-010) → `OrderItem`, `OrderStatusLog`, `OrderReview`; `WishlistItem`, `PromoCode`, `PaymentWebhookEvent` (идемпотентность вебхуков через `@@unique([orderId, eventId])`)
6. **Delivery:** `DeliveryZone`
7. **Loyalty:** `LoyaltyConfig` (тиры в JSON), `LoyaltyTransaction`
8. **Procurement:** `Supplier`, `PurchaseOrder`, `PurchaseOrderItem` (fx rate, shipping/customs → landed cost)
9. **Billing/Platform:** `Invoice` (ручные инвойсы, expiry 48ч), `StorePaymentMethod`, `BroadcastCampaign`/`BroadcastRecipient`, `SystemAdmin`, `TenantAuditLog`/`SystemAuditLog`, `SystemSetting`, `ScheduledReport`

Индексация в целом продуманная (составные индексы под частые запросы — `@@index([tenantId, status])` и т.п., отдельная миграция `20260328000000_perf_indexes`). Все денежные поля — `Decimal(12,2)`, не float — корректно.

**Заметная деталь:** оба enum `PaymentMethod` и `PaymentProvider` почти дублируют друг друга (CASH_ON_DELIVERY/CASH разница) — исторический артефакт двух параллельных систем оплаты (заказ vs метод оплаты магазина), см. §5.

---

## 4. Critical issues

1. **Runtime DDL bootstrap в `app.ts` (строки 486–539).** При каждом старте API выполняется набор `prisma.$executeRawUnsafe` (`CREATE TABLE IF NOT EXISTS "suppliers"`, добавление колонки `supplierId` в `purchase_orders`, добавление FK через `DO $$ ... IF NOT EXISTS`). Это **дословно повторяет** миграцию `20260316191403_add_suppliers`. То есть в какой-то момент миграция не применилась штатно на проде, и вместо восстановления состояния миграций кто-то захардкодил защитный DDL прямо в код приложения. Риски: (а) под чужим DB-пользователем без прав `ALTER TABLE` приложение будет падать в логах при каждом старте; (б) при масштабировании на несколько инстансов API — гонки при одновременном `CREATE TABLE`/`ALTER TABLE ADD CONSTRAINT`; (в) маскирует реальный дрейф `_prisma_migrations` от факта в БД — при следующей `prisma migrate deploy` неизвестно, будет ли Prisma считать эту миграцию применённой. **Для SBGCloud такой паттерн переносить нельзя** — миграции обязаны быть единственным источником схемы.

2. **Смешение npm и pnpm в одном репозитории.** В корне одновременно лежат `pnpm-lock.yaml` (150 КБ, актуальный, `packageManager: pnpm@9.1.0`) и **новый `package-lock.json`** (владелец файла — `root`, не текущий пользователь), при этом `pnpm-workspace.yaml` — единственное объявление воркспейсов (в `package.json` нет `"workspaces"`). Похоже, что `npm install` был непреднамеренно выполнен (вероятно от root, в рамках деплой-скрипта) поверх pnpm-репозитория. Это создаёт риск рассинхронизации зависимостей и порчи `node_modules` при следующем `pnpm install`. Файл не закоммичен (виден в `git status` как `??`) — до коммита стоит удалить `package-lock.json` и разобраться, что его сгенерировало.

3. **Незакоммиченный дрейф в `deploy/production/`.** `.env.prod`, `post-deploy-checklist.sh`, `verify-backup.sh` изменены на рабочем дереве, плюс лежат **рядом посторонние бэкап-файлы** `deploy/production/.env.prod.bak.2026-06-22-180421` и `post-deploy-checklist.sh.bak.2026-06-22-180421`, а также пустой файл `deploy/production/ERROR`. `.env.prod.bak.*` — это план-текстовая копия прод-секретов рядом с публично отслеживаемой (см. §7) конфигурацией, лежащая в рабочей директории репозитория. Это надо явно разобрать/удалить, а не просто закоммитить как есть.

4. **Версии `sharp` разъехались.** Корневой `package.json` (незакоммичено) добавляет `"sharp": "^0.34.5"` как dependency верхнего уровня, при этом `apps/api/package.json` требует `"sharp": "^0.33.0"`. `sharp` — нативный биндинг, дублирование версий в монорепе увеличивает размер установки и риск несовместимости платформенных бинарников.

5. **Документация с системной порчей текста.** `ARCHITECTURE_RULES.md` и `docs/SYSTEM_BOOTSTRAP.md` содержат систематическую замену букв (`s→y`, `p→l`: "yeparation" вместо "separation", "AlI" вместо "API", "llatform" вместо "platform", "SkilInytall" вместо "SkipInstall" и т.д.) по всему тексту. Документ, который называет себя "mandatory for all product and engineering work", частично нечитаем. Похоже на баг в каком-то автоматическом find-replace/генераторе документации. Нужно восстановить эти файлы из истории git или переписать вручную — при переносе в SBGCloud эти правила будут ключевым документом, и их нельзя тащить в текущем виде.

6. **Дублирование доменной логики платежей: `payment` vs `payments-integration`.** Два разных модуля, разные enum'ы (`PaymentMethod` для `Order.paymentMethod`, `PaymentProvider` для `StorePaymentMethod.provider`), почти идентичный набор значений (`CASH_ON_DELIVERY` vs `CASH`). Работает, но название/границы модулей вводят в заблуждение и заслуживают объединения перед тем, как выделять "payments-integration" как отдельный домен для SBGCloud (как это уже предполагает `ARCHITECTURE_RULES.md`).

---

## 5. API/schema mismatches

**Самая серьёзная находка аудита:** модуль `apps/api/src/modules/public-api/routes.ts` (внешний API `/api/v1/*`, авторизация по API-ключу) обращается к полям, которых **не существует** в текущей `schema.prisma`:

| Используется в `public-api/routes.ts` | Модель | В схеме есть |
|---|---|---|
| `product.isArchived` | `Product` | нет (есть `isActive`) |
| `product.comparePrice` | `Product` | нет |
| `product.qty` | `Product` | нет (есть `stockQty`) |
| `product.isVisible` | `Product` | нет |
| `order.customerName` | `Order` | нет (только через relation `customer.firstName/lastName`) |
| `order.customerPhone` | `Order` | нет (только через relation `customer.phone`) |

Эти поля нигде больше в кодовой базе не используются (проверено grep'ом) — то есть это не переименование, а код, писавшийся под другую/более раннюю версию схемы и никогда не приводившийся в соответствие. **Следствие: любой вызов `GET /api/v1/products`, `GET /api/v1/products/:id`, `GET /api/v1/orders`, `GET /api/v1/orders/:id` упадёт с Prisma `PrismaClientValidationError`** (обращение к несуществующему полю в `select`/`include`/`where`). При этом в `STATUS.md` пункт "10.1 Public API для интеграторов" отмечен как "✅ готово" — это не так в текущем состоянии кода.

**Второй самостоятельный дефект в том же файле:** `PATCH /api/v1/orders/:id/status` меняет `order.status` напрямую через `prisma.order.update`, **в обход** `modules/order/order.service.ts::updateOrderStatus`, которая:
- валидирует переход через `canTransition()` (машина статусов, `packages/shared/src/constants/order-status.ts`);
- восстанавливает `stockQty`/пишет `StockMovement` при отмене;
- начисляет лояльность и реферальные бонусы при переходе в `COMPLETED` (ADR-011);
- обновляет `Customer.totalSpent`/`ordersCount`.

Даже после исправления полей public-api позволит внешним интеграторам произвольно переключать статус заказа (например, сразу в `COMPLETED`) без прогона через бизнес-правила — заказ получит баллы лояльности, но не отработает восстановление остатков при "отмене" и т.п. Это отдельный баг логики, не только схемы.

**Рекомендация:** до включения public-api в SBGCloud-периметр — переписать модуль поверх текущей схемы и существующего `order.service.ts`, покрыть интеграционными тестами (сейчас у `public-api` нет `*.test.ts`, в отличие от большинства других модулей).

---

## 6. Migration risks

- 21 миграция, линейная история, `migration_lock.toml` присутствует — сам механизм не сломан.
- Часть миграций названа без временной точности до секунды (`20260329_add_password_reset`, `20260329_add_referral_friend_bonus`, `20260329_add_tenant_deleted_at` — все датированы одним днём без времени в имени, в отличие от более ранних `20260324100000_...`). Риск коллизии порядка применения низкий (Prisma сортирует по имени папки целиком), но стоит унифицировать формат для консистентности при переносе в новый репозиторий.
- **Главный риск — расхождение `suppliers`/`purchase_orders.supplierId` между декларативной миграцией и рантайм-DDL в `app.ts`** (см. §4.1). Перед тем как переносить схему в SBGCloud, нужно на реальной prod-БД выполнить `prisma migrate status`, чтобы подтвердить, что `20260316191403_add_suppliers` действительно отмечена как применённая, и только после этого убрать raw-SQL блок из `app.ts`.
- `STATUS.md` прямо предупреждает: "Миграции — Только новые файлы — не редактировать применённые" — то есть команда уже знает о хрупкости продовой миграционной истории; это подтверждает находку выше не как гипотезу, а как известную операционную боль.
- Money/points arithmetic поверх `Decimal`/`Int` в JS-коде (`order.service.ts`, `loyalty`) не оборачивается в `Prisma.Decimal`-safe операции везде одинаково (местами `Number(order.total)`) — при переносе на SBGCloud с более требовательной финансовой отчётностью стоит аудитировать округления отдельно (вне рамок Этапа 1).

---

## 7. Security concerns

1. **Прод-секреты закоммичены в git.** `.gitignore` в корне игнорирует только `.env`, но **не** `deploy/production/.env.prod`. `git ls-files` подтверждает: `deploy/production/.env.prod` отслеживается с "Initial import" и содержит в истории prod-значения `DB_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SYSTEM_JWT_SECRET`, `SYSTEM_ADMIN_PASSWORD`, `S3_SECRET_KEY`, `RESEND_API_KEY` и т.д. Судя по текущему diff, часть этих значений недавно **ротировали** (что правильно), но старые значения остаются в истории git навсегда, если её не переписать. Более того, там же закоммичены `deploy/production/ssl/selfsigned.crt` **и `selfsigned.key`** (приватный TLS-ключ) — тоже в истории репозитория.
   **Действие:** прежде чем этот код станет основой публичного/шарового SBGCloud-репозитория — исключить `deploy/production/.env.prod` и `ssl/*.key` из будущей истории (BFG/`git filter-repo`), перевести на `.env.prod.example` + секрет-менеджер, ротировать все значения, которые когда-либо коммитились.
2. **`ALLOW_DEV_AUTH_BYPASS`.** Флаг существует и корректно заблокирован проверкой `process.env.NODE_ENV !== 'production'` в обоих местах использования (`modules/bot/shop-auth.ts`, `modules/bot/routes.ts`) — не найдено способа включить его в проде. Это хорошо спроектировано, но стоит держать в поле зрения ревью (single point of failure — если кто-то уберёт `NODE_ENV` проверку).
3. **Аутентификация в целом сделана аккуратно:** `verifyAccessToken`/JWT (ADR-008), Telegram `initData` HMAC-SHA256 с `crypto.timingSafeEqual` и защитой от replay через `auth_date`+`maxAgeSec` (ADR-009), bcrypt (`SALT_ROUNDS=12`), forgot-password не палит существование email (возвращает `success:true` даже при отсутствии юзера), API-ключи хранятся только как `sha256(raw)` — сырое значение показывается один раз при создании. Webhook create/patch защищён SSRF-фильтром (`isSafeWebhookUrl`: только `https:`, блок приватных диапазонов/localhost/докер-имён сервисов) — качественная деталь, редко встречающаяся в проектах такого размера.
4. **Store-admin модули (`product`, `loyalty`, и по выборке — остальные) последовательно скоупят все запросы по `tenantId`** (через `findFirst`/`updateMany` с `tenantId` в `where`), что снижает риск IDOR между тенантами. Контрастирует с плохо протестированным `public-api` (§5).
5. **`app.ts` глобальный error handler** не протекает внутренние сообщения при 5xx ("Internal server error"), плюс базовые security-заголовки (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) выставлены вручную без `@fastify/helmet` — работает, но при переносе в SBGCloud разумнее подключить `@fastify/helmet` вместо ручной поддержки списка заголовков.
6. **Rate limiting** глобальный через `@fastify/rate-limit` + Redis, плюс точечные лимиты на `/auth/register`, `/auth/login`, `/api/leads` — адекватно.
7. **`suppliers`/`purchase_orders` DDL bootstrap** (§4.1) технически не уязвимость, но выполнение `$executeRawUnsafe` при каждом старте — плохая практика с точки зрения security review: раз шаблон разрешён, легко случайно добавить туда что-то с интерполяцией пользовательского ввода в будущем.

---

## 8. What can be reused for SBGCloud

- **Доменная модель целиком:** tenant/store/catalog/order/customer/loyalty/procurement/billing — зрелая, покрыта тестами, деньги через `Decimal`, мультитенантность на уровне строк уже работает и проверена продом.
- **`ARCHITECTURE_RULES.md`** как черновик целевой модульной архитектуры SBGCloud (после исправления порчи текста, §4.5) — доменные границы, разделение Platform Admin / Tenant Admin, финансовая политика ("мы не являемся стороной платёжной транзакции") напрямую переносимы.
- **Auth/permission-стек:** JWT access+refresh, `permissionGuard`/`planGuard` middleware-паттерн, ролевая модель OWNER/MANAGER/OPERATOR/MARKETER с гранулярными JSON-permissions — готовый переиспользуемый примитив авторизации.
- **Платёжная абстракция** `apps/api/src/payments/` (providers + webhooks с проверкой подписи per-provider, идемпотентность через `PaymentWebhookEvent`) — хорошо изолированный слой, расширяемый под новых провайдеров без переписывания ядра.
- **API-key + webhook исходящая инфраструктура** (`api-keys`, `webhook` модули, `webhook-dispatcher.ts`) — конструкция годная, SSRF-защита уже встроена; сам `public-api` endpoint нужно переписать (§5), но инфраструктура ключей — нет.
- **Order status state machine** (`packages/shared/src/constants/order-status.ts`) — маленький, чистый, легко переносимый примитив.
- **Encryption/telegram-auth утилиты** (`lib/encrypt.ts`, `lib/telegram-auth.ts`) — корректны, независимы от остального кода, переносимы как есть.
- **Тестовая культура** (vitest, `*.test.ts` рядом с сервисами, отдельные integration-тесты) — стоит сохранить как стандарт для SBGCloud-репозитория.

## 9. What must stay outside this repo

- **`deploy/production/.env.prod`, `ssl/*.key` и вся история секретов** — не переносить как часть кодовой базы SBGCloud; секреты живут в секрет-менеджере/CI, история с ними не должна попасть в новый репозиторий как есть (либо переписывается перед переносом).
- **Bot-per-store / Telegram-специфичный слой** (`bot-manager.ts`, Grammy-боты, `shop-auth.ts` initData-валидация, `/webhook/system-pay`) — это специфика продукта SellGram (Telegram-магазины), а не платформенный примитив SBGCloud; если SBGCloud — более общая платформа, этот слой должен остаться опциональным плагином/модулем, а не частью ядра.
- **Landing-страницы и вшитая в `app.ts` раздача HTML/скриншотов/аналитики (GA/Яндекс.Метрика снипеты)** — маркетинговый контент конкретного бренда SellGram, не часть платформенного ядра.
- **`deploy/production/*` bash/PowerShell скрипты, заточенные под конкретный VPS** (`192.168.80.29`, конкретные домены `*.sellgram.uz`) — переносить только как референс, не как готовую инфраструктуру.
- **Runtime DDL bootstrap в `app.ts`** (§4.1) — паттерн категорически не должен появиться в SBGCloud; если переносить код, этот блок нужно удалить и заменить нормальной проверкой `prisma migrate status` в CI/CD.
- **Захардкоженные CORS origins и дефолтные billing-плейсхолдеры** (`LEGAL_ENTITY_INN: 'XXXXXXXXX'` и т.п. в `config/index.ts`) — специфика юрлица SellGram, для SBGCloud нужна отдельная, не захардкоженная конфигурация на тенанта/инстанс.

---

## 10. Recommended next steps

1. **Немедленно (до любого дальнейшего коммита в этой ветке):** разобраться с `package-lock.json` (кто/что его создал под root), удалить его или явно решить перейти на npm; вычистить `deploy/production/*.bak.*` и пустой `ERROR`; решить судьбу `.env.prod` в git-истории.
2. **Починить или временно отключить `public-api`** (§5) — либо привести поля в соответствие со схемой и провести через `order.service.ts`, либо выключить роут до готовности (сейчас документация утверждает, что фича готова, а по факту она вернёт 500 на первом же запросе).
3. **Разобраться с миграцией `suppliers`** на реальной prod-БД (`prisma migrate status`), убрать raw-SQL bootstrap из `app.ts` после подтверждения консистентности.
4. **Восстановить читаемость `ARCHITECTURE_RULES.md` и `docs/SYSTEM_BOOTSTRAP.md`** — это будущий эталонный документ для SBGCloud, использовать его в порченном виде нельзя.
5. **Секреты:** ротация всех значений, которые когда-либо попадали в git (не только текущего diff), перенос на секрет-менеджер до старта SBGCloud.
6. Только после пп. 1–5 переходить к следующему этапу (проектирование доменных границ SBGCloud на основе `ARCHITECTURE_RULES.md` и выделение переиспользуемых модулей из §8).

---

*Этот файл — единственное изменение, внесённое в рамках Этапа 1. Сборка (`pnpm build`) и тесты (`pnpm test`) не запускались, как и было указано.*
