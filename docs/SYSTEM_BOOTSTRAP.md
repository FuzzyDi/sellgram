# SellGram Platform Bootstrap

## One-command bootstrap

```powershell
pnpm bootstrap
```

Equivalent direct script:

```powershell
.\scripts\bootstrap.ps1 -Mode dev
```

Flags:

- `-SkipInstall` - skip `pnpm install`
- `-NoRun` - do not start long-running process (`pnpm dev` in dev mode, log tail in prod mode)
- `-SkipSeed` - skip database seed
- `-MigrationName <name>` - migration name for `db:migrate` (default: `platform_bootstrap`)

Production mode:

```powershell
.\scripts\bootstrap.ps1 -Mode prod
```

Prod notes:
- requires `deploy/production/.env` to exist (the production stack currently in use is run with `--env-file deploy/production/.env.prod` — keep the filename passed to `docker compose` consistent with whichever env file you maintain on the server)
- runs `docker compose -f docker-compose.prod.yml --env-file .env up -d --build`
- runs `prisma migrate deploy` inside the API container

## What bootstrap does

1. Creates `.env` from `.env.example` if missing
2. Starts Docker services (`postgres`, `redis`, `minio`) via `docker compose up -d`
3. Installs dependencies
4. Runs `prisma generate`
5. Runs migrations (`pnpm db:migrate --name platform_bootstrap`)
6. Seeds demo data (`pnpm db:seed`)
7. Starts all apps in dev mode

## New API capabilities

## System admin API (`/api/system-admin/*`)

- `POST /api/system-admin/auth/login`
- `GET /api/system-admin/dashboard`
- `GET /api/system-admin/tenants`
- `GET /api/system-admin/invoices/pending`
- `PATCH /api/system-admin/invoices/:id/confirm`
- `PATCH /api/system-admin/invoices/:id/reject`

Uses a separate system token (not tenant JWT).

## Store payment methods

- `GET /api/store-admin/stores/:id/payment-methods`
- `POST /api/store-admin/stores/:id/payment-methods`
- `PATCH /api/store-admin/stores/:id/payment-methods/:methodId`
- `DELETE /api/store-admin/stores/:id/payment-methods/:methodId`
- `GET /api/shop/payment-methods`

Checkout now accepts `paymentMethodId`.

## Broadcasts

- `POST /api/store-admin/broadcasts/send`
- `GET /api/store-admin/broadcasts`
- `GET /api/store-admin/broadcasts/:id`

Target modes:

- `ALL` - all store customers with orders
- `SELECTED` - specific customer IDs

## Demo credentials

- Tenant owner: `admin@demo.com / admin123`
- System admin: `SYSTEM_ADMIN_EMAIL / SYSTEM_ADMIN_PASSWORD` from `.env` (defaults to `root@sellgram.uz` / `ChangeMe_123!` if unset — change this in any real deployment)


## Store payment providers

Store owners configure payment providers on their side (the platform does not process store revenue).

Supported provider values:
- CASH
- MANUAL_TRANSFER
- TELEGRAM
- CLICK
- PAYME
- UZUM
- STRIPE
- CUSTOM

TELEGRAM provider requires in meta:
- providerToken (string)
- currency (3-letter code, e.g. UZS)

CLICK provider requires in meta:
- serviceId (string)
- merchantId (string)

PAYME provider requires in meta:
- merchantId (string)

UZUM, STRIPE, MANUAL_TRANSFER, CASH and CUSTOM have no required meta fields at configuration time — meta is free-form for these providers. UZUM optionally uses `uzumSecret` for webhook signature verification (see below).

## Payment webhook endpoint

Public provider callback endpoint:
- POST /api/payments/webhook/:provider

Provider examples: telegram, click, payme, uzum, stripe, manual_transfer, cash, custom.

Body (minimum):
- status: PENDING | PAID | REFUNDED
- orderId OR (orderNumber + storeId)

Optional:
- paymentRef
- eventId
- payload (raw provider payload)
- secret (or header x-payment-secret)

If the payment method's meta has webhookSecret, the endpoint validates it before updating order payment status.

CLICK webhook example payload fields (supported):
- merchant_trans_id (can be <storeId>:<orderNumber> or orderId)
- click_trans_id
- error, status, sign_time
- sign / signature (optional; required if meta.clickSecret is configured)

PAYME webhook example payload fields (supported):
- JSON-RPC method (PerformTransaction, CancelTransaction, etc.)
- params.id as payment reference
- params.account.orderId OR params.account.storeId + params.account.orderNumber
- Authorization header required if meta.paymeAuthKey is configured

UZUM webhook example payload fields (supported):
- transaction_id (or transactionId / uzum_transaction_id)
- merchant_trans_id (can be <storeId>:<orderNumber> or orderId)
- status / state / result (CONFIRMED, CANCELLED, REVERSED, REFUNDED, or numeric/boolean)
- X-Uzum-Signature header (or x-signature / body.signature) required if meta.uzumSecret (or meta.webhookSecret) is configured — HMAC-SHA256 over `{transaction_id}:{merchant_trans_id}:{amount}`

STRIPE, MANUAL_TRANSFER, CASH and CUSTOM use the generic webhook normalizer (no provider-specific payload parsing) — they read `status`, `orderId`/`order_id`, `orderNumber`/`order_number`, `storeId`/`store_id`, `paymentRef`/`payment_ref`, `eventId`/`event_id` directly from the body, and rely on the generic `webhookSecret` / `x-payment-secret` check for authentication.

Webhook security meta options on payment method:
- webhookSecret (generic fallback via header x-payment-secret)
- clickSecret (HMAC-SHA256 verification for CLICK)
- paymeAuthKey (Authorization header verification for PAYME)
- uzumSecret (HMAC-SHA256 verification for UZUM; falls back to webhookSecret if unset)
