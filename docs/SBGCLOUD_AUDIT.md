# SBGCloud Technical Audit

## 1. Current architecture

SellGram is a `pnpm`/Turborepo monorepo. The current runtime is split into:

- `apps/api`: Fastify API, tenant admin REST routes, Telegram bot webhook, Mini App shop API, uploads, Redis rate limit, MinIO image proxy.
- `apps/control-api`: separate Fastify control-plane API for system admin, tenants, invoices, stores, and diagnostics.
- `apps/admin`: React/Vite tenant admin panel.
- `apps/miniapp`: React/Vite Telegram Mini App.
- `packages/prisma`: Prisma schema and seed.
- `packages/shared`: shared constants and order/status utilities.

The stack is PostgreSQL, Redis, MinIO, Prisma, Fastify, BullMQ-related dependencies, Grammy, React, Vite, Tailwind, and JWT.

## 2. Existing modules

Admin API modules under `/api/admin`:

- Auth: register, login, refresh, current user, Telegram admin link code.
- Stores: store CRUD, activation metadata, payment methods.
- Products: product CRUD, variants, stock adjustment, image upload/delete.
- Categories: category CRUD and soft-delete.
- Orders: listing, details, status transitions, payment and delivery updates.
- Customers: listing, details, tags/note/phone, manual loyalty adjustment.
- Delivery: delivery zone CRUD.
- Loyalty: loyalty config.
- Procurement: purchase orders, receive flow, landed cost and stock increment.
- Analytics: dashboard, top products, revenue series.
- Subscription: plan usage, invoices, upgrade request, payment reference.
- Broadcast: Telegram broadcast campaign creation and send.

Other surfaces:

- Shop API under `/api/shop/*` for Mini App catalog, cart, checkout, orders, loyalty, delivery zones, and payment methods.
- Telegram webhook under `/webhook/:storeId`.
- Control API under `/api/system/*`.
- POS Sync skeleton under `/api/pos/v1/*` returns `501 Not Implemented`.

The requested `apps/api/src/modules/public-api/routes.ts` file is not present in this working tree.

## 3. Database/domain model summary

Core models are tenant-scoped: `Tenant`, `User`, `Store`, `Product`, `Category`, `Customer`, `Order`, `DeliveryZone`, `LoyaltyConfig`, `PurchaseOrder`, `Invoice`, `StorePaymentMethod`, `BroadcastCampaign`.

Catalog uses `Product.stockQty`, `Product.isActive`, `Product.price`, optional `costPrice`, variants, and images. Orders are online/commerce orders and should not be reused as local POS sale records. Procurement currently stores `supplierName` directly on `PurchaseOrder`; there is no `Supplier` model or `PurchaseOrder.supplierId` in the current schema.

## 4. Critical issues

- `packages/prisma/migrations` is absent, so production-safe schema evolution is not auditable from the repo.
- `pnpm install` is sensitive to non-interactive module purge confirmation unless `confirmModulesPurge=false` or CI mode is used.
- Root `package.json` uses the legacy `pnpm.overrides` field; current pnpm warns that this is ignored.
- Several source strings contain mojibake in comments/messages, which does not block TypeScript but hurts operator UX.
- Payment provider webhooks are documented as future work and are not implemented.

## 5. API/schema mismatches

No active code path was found using old product fields such as `qty`, `isVisible`, `comparePrice`, or `isArchived` against Prisma `Product`. The current shop/catalog/admin product APIs use `stockQty`, `isActive`, `price`, and `costPrice`.

The requested `public-api/routes.ts` module is not present. The Mini App public surface is `modules/bot/shop-api.ts`.

The requested runtime supplier bootstrap in `apps/api/src/app.ts` is not present. The current schema also does not contain `Supplier` or `PurchaseOrder.supplierId`; procurement uses `supplierName`.

## 6. Migration risks

- Missing migrations make it risky to know whether existing databases match `schema.prisma`.
- Adding suppliers, POS devices, sale events, fiscal receipts, and catalog snapshots should be done through additive migrations only.
- Future POS models must not alter online `Order` semantics or force local sales into the Telegram Commerce order lifecycle.
- Any migration from `PurchaseOrder.supplierName` to a normalized supplier model needs a backfill plan and must retain existing supplier names.

## 7. Security concerns

- `.env` exists locally and must remain uncommitted.
- Bot tokens are encrypted at rest, but the fallback seed encryption key is development-only and must not be used in production.
- Development auth bypass exists for Mini App Telegram init data and must stay disabled in production.
- Webhook provider integrations need signature verification and idempotency before enabling real payments.
- System admin credentials are seeded from environment variables and should be rotated outside source control.

## 8. What can be reused for SBGCloud

- Tenant/store/user boundaries.
- Catalog, category, product image, variant, stock quantity fields.
- Customer and loyalty foundation.
- Procurement and landed cost concepts.
- Store payment method configuration.
- Control API separation for system administration.
- Diagnostics health checks.
- Broadcast infrastructure for Telegram commerce.
- Existing Telegram/MiniApp Commerce module.

## 9. What must stay outside this repo

Local POS Core must remain outside this API. It should own local sale execution, fiscalization, printing, recovery, durable outbox, local shift operations, and offline availability. External fiscal/printer/cloud IO must not be inside the local sale transaction.

## 10. Recommended next steps

1. Restore or create a proper Prisma migration history before production schema changes.
2. Keep POS Sync additive and model it separately from online orders.
3. Add idempotency design for sale/fiscal/shift events before implementing ingestion.
4. Add payment webhook verification and reconciliation only after provider-specific specs are defined.
5. Fix mojibake strings in user-facing messages.
6. Move pnpm overrides to `pnpm-workspace.yaml` or `.npmrc` settings supported by the installed pnpm version.
7. Add focused tests for shop checkout, order status transitions, payment methods, and future POS sync idempotency.
