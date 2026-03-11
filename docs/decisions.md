# Architecture Decisions

## ADR-001: Monorepo with Turborepo
Using Turborepo + pnpm workspaces for shared code between API, Admin, and Mini App.

## ADR-002: Bot-per-store model
Each store gets its own Telegram bot token. Simplifies UX and allows custom branding per store.

## ADR-003: Row-level multi-tenancy
All tables include tenantId. Prisma middleware auto-filters. Chosen over schema-per-tenant for simplicity at MVP scale.

## ADR-004: Server-side cart
Cart stored in PostgreSQL (CartItem table) instead of Redis/client. Ensures persistence across devices and sessions.

## ADR-005: Simplified inventory (MVP)
Single stockQty field on Product. No lot tracking or warehouse model. Sufficient for MVP single-location stores.

## ADR-006: Grammy for Telegram bots
Grammy chosen over node-telegram-bot-api for better TypeScript support, webhook support, and middleware architecture.

## ADR-007: AES-256-GCM for bot token encryption
Bot tokens encrypted at rest using AES-256-GCM with IV and auth tag. Key stored in environment variable.

## ADR-008: JWT auth with refresh tokens
15-minute access tokens + 7-day refresh tokens. Stateless authentication for admin panel.

## ADR-009: Telegram initData for Mini App auth
Using Telegram's HMAC-SHA256 validation of initData for Mini App authentication. No additional login required.

## ADR-010: Order status machine with validation
9-state machine with explicit transition rules. Prevents invalid status changes.

## ADR-011: Loyalty points on COMPLETED status
Points earned only when order reaches COMPLETED, not on creation or delivery. Prevents fraud.

## ADR-012: Landed cost calculation on PO receive
Cost price updated when purchase order is received. Shipping + customs allocated proportionally by item value.

## ADR-013: Plan enforcement via middleware
Subscription limits checked at resource creation time via reusable planGuard middleware.

## ADR-014: BullMQ for background jobs
Daily digest, order reminders, and subscription checks run as BullMQ workers with Redis.

## ADR-015: MinIO for file storage
S3-compatible object storage. Easy to swap for AWS S3 in production.

## ADR-016: Zod for runtime validation
All API inputs validated with Zod schemas. Type-safe and generates helpful error messages.

## ADR-017: @tma.js/sdk for Mini App
Official Telegram Mini App SDK for React. Provides type-safe access to WebApp API.

## ADR-018: Manual FX rates
FX rates entered manually on purchase orders. Auto-fetch from CBU API planned for vNext.
