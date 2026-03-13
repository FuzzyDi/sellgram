# 🤖 SellGram — Telegram Store Bot SaaS Platform

> Build and run your online store entirely inside Telegram.

## Architecture

**Monorepo** (Turborepo + pnpm) with 3 apps:
- `apps/api` — Fastify backend (REST API + Telegram Bot + BullMQ jobs)
- `apps/admin` — Admin Panel (React + Vite + Tailwind + React Query)
- `apps/miniapp` — Telegram Mini App (React + Vite + Tailwind + @tma.js/sdk)

**Shared packages:**
- `packages/shared` — Types, constants, utils
- `packages/prisma` — Prisma schema, migrations, seed

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url> sellgram && cd sellgram
pnpm install

# 2. Start infrastructure
docker compose up -d

# 3. Setup database
cp .env.example .env
pnpm db:generate
pnpm db:migrate --name init
pnpm db:seed

# 4. Start dev
pnpm dev
```

## Full Bootstrap (recommended)

```powershell
pnpm bootstrap
```

See `docs/SYSTEM_BOOTSTRAP.md` for system-admin API, payment methods, broadcasts, and demo credentials.

**URLs:**
- API: http://localhost:4000
- Admin: http://localhost:5173
- Mini App: http://localhost:5174
- MinIO Console: http://localhost:9001

**Demo login:** admin@demo.com / admin123

## Tech Stack

Node.js 20 | TypeScript | Fastify 4 | Prisma 5 | PostgreSQL 16 | Redis 7 | BullMQ | Grammy | MinIO | React 18 | Vite 5 | TailwindCSS | @tma.js/sdk | Zod | JWT

## Features

- **Multi-tenant SaaS** — each business gets isolated data
- **Bot-per-store** — own Telegram bot for each store
- **Mini App** — full shopping experience inside Telegram
- **Catalog** — products, variants, categories, images
- **Orders** — full lifecycle with status machine (9 states)
- **Delivery** — pickup, local zones (free-from threshold), national postal
- **Loyalty** — earn/redeem points system
- **Procurement** — purchase orders, FX rates, landed cost calculation
- **Analytics** — dashboard, revenue, top products, repeat rate
- **Daily Digest** — automated summary via Telegram to store owner
- **Subscription** — Free / Pro / Business plans with limit enforcement

## Project Structure

```
sellgram/
├── apps/
│   ├── api/           # Backend (Fastify + Grammy)
│   │   ├── src/
│   │   │   ├── modules/     # Business modules (auth, product, order, ...)
│   │   │   ├── bot/         # Grammy bot manager
│   │   │   ├── jobs/        # BullMQ background workers
│   │   │   ├── plugins/     # Fastify plugins (auth, plan-guard)
│   │   │   └── lib/         # Shared libs (prisma, redis, s3, jwt, encrypt)
│   ├── admin/         # Admin Panel (React)
│   └── miniapp/       # Telegram Mini App (React)
├── packages/
│   ├── shared/        # Shared types & constants
│   └── prisma/        # Database schema & migrations
├── deploy/            # Dockerfiles, nginx
└── docs/              # Documentation
```

## Environment Variables

See `.env.example` for all required variables.

## License

Proprietary — All rights reserved.


