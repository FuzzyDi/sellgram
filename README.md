# SellGram

SellGram is a Telegram-first commerce platform for running a store inside Telegram.

The repository is a `pnpm` monorepo with:
- `apps/api` - Fastify API, Telegram bot integration, background jobs
- `apps/admin` - React admin panel
- `apps/miniapp` - Telegram Mini App storefront
- `packages/shared` - shared types and constants
- `packages/prisma` - Prisma schema and seed scripts

## Stack

- Node.js 20
- pnpm 9
- Turborepo
- TypeScript
- Fastify
- Prisma
- PostgreSQL
- Redis
- BullMQ
- React
- Vite
- Tailwind CSS
- MinIO

## Requirements

- Node.js 20+
- pnpm 9+
- Docker Desktop

## Quick Start

```powershell
git clone https://github.com/FuzzyDi/sellgram.git
cd sellgram
pnpm install
Copy-Item .env.example .env
docker compose up -d
pnpm db:generate
pnpm db:migrate --name init
pnpm db:seed
pnpm dev
```

## Bootstrap Script

For Windows development, the fastest setup path is:

```powershell
pnpm bootstrap
```

This runs the bootstrap script from [scripts/bootstrap.ps1](scripts/bootstrap.ps1) and starts the local stack.

Useful variants:

```powershell
.\scripts\bootstrap.ps1 -Mode dev
.\scripts\bootstrap.ps1 -Mode dev -SkipInstall
.\scripts\bootstrap.ps1 -Mode dev -NoRun
.\scripts\bootstrap.ps1 -Mode prod
```

More details are in [docs/PLATFORM_BOOTSTRAP.md](docs/PLATFORM_BOOTSTRAP.md).

## Local URLs

- API: `http://localhost:4000`
- Admin: `http://localhost:5173`
- Mini App: `http://localhost:5174`
- MinIO Console: `http://localhost:9001`
- PostgreSQL: `localhost:5433`

## Environment

The main template is [`.env.example`](.env.example).

Important variables:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `SYSTEM_JWT_SECRET`
- `SYSTEM_ADMIN_EMAIL`
- `SYSTEM_ADMIN_PASSWORD`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- `ENCRYPTION_KEY`
- `APP_URL`
- `ADMIN_URL`
- `MINIAPP_URL`
- `LANDING_URL`

## Common Commands

```powershell
pnpm dev
pnpm build
pnpm test
pnpm db:generate
pnpm db:migrate --name <migration_name>
pnpm db:seed
pnpm db:studio
```

## Repo Layout

```text
sellgram/
|-- apps/
|   |-- admin/
|   |-- api/
|   `-- miniapp/
|-- packages/
|   |-- prisma/
|   `-- shared/
|-- deploy/
|-- docs/
`-- scripts/
```

## Current Notes

- Package names still use the internal `@shopbot/*` naming convention.
- The root package name in [package.json](package.json) is still `shopbot`.
- GitHub Actions CI is configured in [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Demo Access

- Tenant admin: `admin@demo.com / admin123`
- System admin: values from `.env` in `SYSTEM_ADMIN_EMAIL` and `SYSTEM_ADMIN_PASSWORD`

## Deployment

Production deployment assets live under [deploy/production](deploy/production).

Useful docs:
- [SETUP_WINDOWS.md](SETUP_WINDOWS.md)
- [SETUP_SELLGRAM.md](SETUP_SELLGRAM.md)
- [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)
- [deploy/production/VPS_GUIDE.md](deploy/production/VPS_GUIDE.md)
