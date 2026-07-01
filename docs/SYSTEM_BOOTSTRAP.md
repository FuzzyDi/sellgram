# SellGram System Bootstrap

This document describes the local and production bootstrap flow for SellGram/SBGCloud control-plane development.

## One-command bootstrap

Run the default development bootstrap from the repository root:

```powershell
pnpm bootstrap
```

The command delegates to `scripts/bootstrap.ps1` and prepares the local Docker services, dependencies, Prisma client, database schema, seed data, and development processes.

## Direct script usage

```powershell
.\scripts\bootstrap.ps1 -Mode dev
.\scripts\bootstrap.ps1 -Mode prod
```

Use direct script mode when you need explicit flags or when running the bootstrap outside the package script.

## Flags

- `-Mode dev` starts the local development stack.
- `-Mode prod` starts the production Docker Compose stack from `deploy/production`.
- `-SkipInstall` skips `pnpm install`.
- `-SkipSeed` skips demo seed data.
- `-NoRun` prepares the environment without starting long-running application processes.
- `-MigrationName <name>` passes a migration name to the database migration step.

## Dev mode

Development mode is intended for local work. It starts PostgreSQL, Redis, and MinIO through the root Docker Compose file, installs dependencies, generates Prisma Client, applies development migrations, optionally seeds demo data, and starts the monorepo dev processes.

Typical flow:

```powershell
.\scripts\bootstrap.ps1 -Mode dev
```

When dependencies are already installed:

```powershell
.\scripts\bootstrap.ps1 -Mode dev -SkipInstall
```

When you only want preparation:

```powershell
.\scripts\bootstrap.ps1 -Mode dev -NoRun
```

## Prod mode

Production mode expects `deploy/production/.env` to exist. It starts the production Compose stack, builds production images, and applies Prisma migrations with deploy semantics inside the API container.

Typical flow:

```powershell
.\scripts\bootstrap.ps1 -Mode prod
```

Production bootstrap must not rely on demo credentials, local auth bypass, or development-only bot tokens.

## What bootstrap does

1. Creates `.env` from `.env.example` when missing.
2. Starts required infrastructure services.
3. Installs workspace dependencies unless skipped.
4. Runs `pnpm db:generate`.
5. Runs database migrations.
6. Seeds demo data unless skipped.
7. Starts the API, control API, admin, and mini app in development mode, or production containers in production mode.

## System admin API

System administration lives in the control-plane API under `/api/system/*` and uses a separate system admin JWT, not tenant JWT authentication.

Key endpoints:

- `POST /api/system/auth/login`
- `GET /api/system/dashboard`
- `GET /api/system/tenants`
- `PATCH /api/system/tenants/:id/plan`
- `GET /api/system/stores`
- `GET /api/system/invoices/pending`
- `PATCH /api/system/invoices/:id/confirm`
- `PATCH /api/system/invoices/:id/reject`
- `GET /api/system/diagnostics/health`
- `GET /api/system/diagnostics/summary`

## Store payment methods

Store payment methods are tenant-scoped and store-scoped. They are configured by admins and exposed to the Mini App checkout.

Admin endpoints:

- `GET /api/admin/stores/:id/payment-methods`
- `POST /api/admin/stores/:id/payment-methods`
- `PATCH /api/admin/stores/:id/payment-methods/:methodId`
- `DELETE /api/admin/stores/:id/payment-methods/:methodId`

Shop endpoint:

- `GET /api/shop/payment-methods`

Checkout accepts `paymentMethodId` and stores payment method code, title, and metadata snapshot on the order for historical consistency.

## Broadcasts

Broadcast campaigns are sent through the Telegram bot integration.

Endpoints:

- `POST /api/admin/broadcasts/send`
- `GET /api/admin/broadcasts`
- `GET /api/admin/broadcasts/:id`

Target modes:

- `ALL` sends to store customers with orders.
- `SELECTED` sends to explicit customer IDs.

## Demo credentials

- Tenant owner: `admin@demo.com / admin123`
- Tenant manager: `manager@demo.com / admin123`
- System admin: `SYSTEM_ADMIN_EMAIL / SYSTEM_ADMIN_PASSWORD` from `.env`

Demo credentials are for local development only and must not be used in production.

## Payment webhook endpoint

The current cloud API has payment method configuration and checkout payment snapshots, but provider webhook processing is not implemented yet. Future provider callbacks should be added under a dedicated idempotent webhook surface such as:

```text
POST /api/webhooks/payments/:provider
```

Webhook handlers must verify provider signatures, be idempotent, avoid leaking secrets, and update payment state without changing unrelated order data.

## Provider-specific notes

### Telegram

Telegram is the current storefront channel. Bot webhook calls use `/webhook/:storeId` and validate `x-telegram-bot-api-secret-token` against the store webhook secret outside development bypass mode.

### Click

Click is represented as a configurable `StorePaymentMethod` provider. Real payment confirmation, signature verification, and reconciliation are still future work.

### Payme

Payme is represented as a configurable provider. Future integration must keep Payme transaction state separate from order lifecycle transitions and process callbacks idempotently.

### Uzum

Uzum is represented as a configurable provider. Provider-specific credentials should live in encrypted metadata or a secrets store, not in source code.

### Stripe

Stripe is represented as a configurable provider for possible non-local payments. Future webhook handlers must verify Stripe signatures and use Stripe event IDs for idempotency.

### Manual Transfer

Manual transfer is supported through instructions and tenant/admin confirmation flows. Operators should record payment references without storing sensitive bank credentials in code.

### Cash

Cash is supported as a store payment method and is suitable for cash on delivery. It is not fiscalization and does not replace a local POS/fiscal register.

### Custom

Custom methods allow tenant-specific instructions. Custom metadata must be treated as configuration, not executable payment logic.
