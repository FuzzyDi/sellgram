# SellGram Platform Bootstrap

## One-command startup

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
- `-MigrationName <name>` - migration name for `db:migrate`

Production mode:

```powershell
.\scripts\bootstrap.ps1 -Mode prod
```

Prod notes:
- requires `deploy/production/.env` to exist
- runs `docker compose -f docker-compose.prod.yml --env-file .env up -d --build`
- runs `prisma migrate deploy` inside API container

## What bootstrap does

1. Creates `.env` from `.env.example` if missing
2. Starts Docker services (`postgres`, `redis`, `minio`) via `docker compose up -d`
3. Installs dependencies
4. Runs `prisma generate`
5. Runs migrations (`pnpm db:migrate --name platform_bootstrap`)
6. Seeds demo data (`pnpm db:seed`)
7. Starts all apps in dev mode

## New API capabilities

## System admin API (`/api/system/*`)

- `POST /api/system/auth/login`
- `GET /api/system/dashboard`
- `GET /api/system/tenants`
- `GET /api/system/invoices/pending`
- `PATCH /api/system/invoices/:id/confirm`
- `PATCH /api/system/invoices/:id/reject`

Uses a separate system token (not tenant JWT).

## Store payment methods

- `GET /api/admin/stores/:id/payment-methods`
- `POST /api/admin/stores/:id/payment-methods`
- `PATCH /api/admin/stores/:id/payment-methods/:methodId`
- `DELETE /api/admin/stores/:id/payment-methods/:methodId`
- `GET /api/shop/payment-methods`

Checkout now accepts `paymentMethodId`.

## Broadcasts

- `POST /api/admin/broadcasts/send`
- `GET /api/admin/broadcasts`
- `GET /api/admin/broadcasts/:id`

Target modes:

- `ALL` - all store customers with orders
- `SELECTED` - specific customer IDs

## Demo credentials

- Tenant owner: `admin@demo.com / admin123`
- System admin: `SYSTEM_ADMIN_EMAIL / SYSTEM_ADMIN_PASSWORD` from `.env`
