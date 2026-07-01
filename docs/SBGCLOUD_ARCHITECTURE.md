# SBGCloud Architecture

## 1. Product direction

SellGram is evolving into SBGCloud: a cloud retail platform for Uzbekistan with Telegram commerce, backoffice, POS device management, sync, analytics, billing, and monitoring.

The current SellGram product must remain functional during this transition. Expansion should be additive and incremental.

## 2. Sellgram Commerce module

Sellgram Commerce remains the Telegram/MiniApp sales channel inside SBGCloud. Existing stores, products, categories, carts, orders, customers, loyalty, delivery zones, payment methods, broadcasts, and bot webhooks remain part of this module.

## 3. SBGCloud responsibilities

SBGCloud provides cloud backoffice and control-plane responsibilities:

- tenant and store management
- product and category catalog management
- customers and loyalty
- procurement and stock visibility
- subscriptions and billing
- POS device activation and settings distribution
- catalog snapshots for POS devices
- fiscal monitoring, not fiscal execution
- analytics and diagnostics
- additive sync APIs for future local POS runtimes

## 4. What SBGCloud must not do

SBGCloud is not the fiscal cash register. It must not execute the local sale transaction, block local sale completion on cloud availability, print receipts from the cloud, or perform fiscal/printer/cloud IO inside a local sale transaction.

## 5. Local POS Core boundary

SBG Lite POS is a separate offline-first local runtime. Local POS Core performs local sale, fiscalization, printing, recovery, shift operations, local stock effects, and durable outbox writes.

The cloud can activate, configure, synchronize, monitor, and analyze POS devices, but it does not own the critical local sale path.

## 6. Target module map

- Commerce: current Telegram/MiniApp storefront and online orders.
- Control API: system admin, tenant oversight, diagnostics, billing confirmation.
- Catalog: products, categories, images, variants, future barcodes and Uzbekistan-specific product profiles.
- Customers and loyalty: customer profiles, points, transaction history.
- Procurement: purchase orders, landed cost, stock replenishment inputs.
- POS Sync: future additive API for device activation, catalog snapshots, settings, sale events, fiscal events, shift events, heartbeats, and cloud commands.
- Monitoring: device health, fiscal unknown states, sync lag, failed outbox events.
- Billing: plans, invoices, subscription limits.

## 7. POS sync future module

POS Sync API must be additive and must not break the current SellGram API. Sale events from POS must be idempotent. Devices should send durable event IDs, device IDs, store IDs, sequence numbers, and timestamps so the cloud can deduplicate and reconstruct projections.

Initial endpoint skeleton:

- `POST /api/pos/v1/activate`
- `POST /api/pos/v1/heartbeat`
- `GET /api/pos/v1/catalog/snapshot`
- `GET /api/pos/v1/settings`
- `POST /api/pos/v1/sale-events`
- `POST /api/pos/v1/fiscal-events`
- `POST /api/pos/v1/shift-events`

## 8. Uzbekistan retail extensions

Future Uzbekistan-specific extensions should cover barcode-heavy retail, unit profiles, package sizes, fiscal metadata, payment provider metadata, local tax/fiscal state projections, and stock ledger reporting.

These extensions belong in cloud configuration and monitoring unless they are required to execute a local offline sale, in which case the authoritative execution belongs to Local POS Core.

## 9. Fiscal responsibility boundary

SBGCloud records and monitors fiscal state, but does not perform fiscalization. Fiscal unknown must be treated as a first-class state in Local POS Core and projected to the cloud for operator attention.

Cloud records may show `known_fiscalized`, `known_failed`, `unknown`, or similar projection states, but the local runtime remains responsible for retry, recovery, and durable fiscal outbox behavior.

## 10. Offline-first principle

Cloud outage must not stop local sales. Local POS Core must be able to sell, fiscalize, print, recover, and queue outbound events without SBGCloud. No external fiscal, printer, or cloud IO should be inside the local sale transaction.

When connectivity returns, POS devices synchronize idempotent sale, fiscal, shift, stock, and heartbeat events.

## 11. Migration roadmap

1. Stabilize the current SellGram monorepo, schema, build, and tests.
2. Preserve existing Commerce APIs and Telegram/MiniApp behavior.
3. Add SBGCloud architecture and audit documentation.
4. Add a non-invasive POS Sync skeleton with 501 responses.
5. Add Prisma migrations history before production schema evolution.
6. Introduce POS device and catalog snapshot models in a later migration.
7. Implement idempotent POS event ingestion after model review.
8. Build monitoring and projections before operational automation.
9. Keep Local POS Core in a separate repo/runtime boundary.

## Future POS-ready models

- `PosDevice`: registered physical or virtual POS terminal assigned to a tenant/store.
- `DeviceActivation`: activation challenge, token issuance, and device onboarding audit trail.
- `ProductUzProfile`: Uzbekistan-specific product metadata, units, tax/fiscal classification, and retail flags.
- `Barcode`: product and variant barcode registry with uniqueness rules per tenant.
- `CatalogSnapshot`: immutable catalog/settings package published for POS download.
- `PosSettings`: POS behavior, payment method, receipt, sync, and store-level runtime settings.
- `SaleEvent`: idempotent cloud record of a completed or attempted local sale event.
- `FiscalReceipt`: projected fiscal receipt state received from Local POS Core.
- `ShiftProjection`: cloud projection of local POS shift open/close state and totals.
- `StockLedgerEntry`: stock movement projection from sales, procurement, adjustments, and sync.
- `SyncCursor`: per-device cursor for catalog, command, and event synchronization.
- `CloudCommand`: command queued by cloud for a POS device, such as refresh catalog or rotate settings.
- `DeviceHeartbeat`: device health, version, clock, connectivity, and sync lag signal.
