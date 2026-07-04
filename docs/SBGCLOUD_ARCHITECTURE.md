# SBGCloud Architecture

> Status: direction document. Describes where the platform is going and the
> boundaries that must hold as it gets there. Nothing in the "future" sections
> of this document is implemented yet — see `apps/api/src/modules/pos-sync/`
> for the current (skeleton-only) state of the POS Sync API.

---

## 1. Product direction

SellGram started as a single-purpose product: Telegram-native shops for
merchants in Uzbekistan (bot-per-store, Mini App storefront, admin panel).
That product is being folded into a broader platform, **SBGCloud**, whose job
is to be the cloud backoffice for a merchant's *entire* retail operation —
not just their Telegram sales channel.

Concretely, SBGCloud's stated direction adds a **Local POS Core**: an
offline-first, in-store point-of-sale runtime that a merchant runs on a
till/tablet at a physical counter. SBGCloud is the cloud side that this
device talks to. The existing SellGram product does not disappear — it
becomes one module (channel) inside SBGCloud.

## 2. Sellgram Commerce module

Everything that exists in this repository today — bot-per-store, Mini App
checkout, store-admin panel, orders/customers/loyalty/procurement, payment
provider integrations — is retained as-is and renamed, conceptually, to the
**Sellgram Commerce module**: SBGCloud's Telegram/Mini App sales channel.

- It keeps its own domain model (`Order`, `Customer`, `Product`, ...).
- It keeps its own API surface (`/api/store-admin/*`, `/api/shop/*`, public
  API, payment webhooks — see `docs/SYSTEM_BOOTSTRAP.md`).
- It is not rewritten, merged with, or made aware of POS concepts. A `Product`
  sold through Sellgram Commerce and the same physical item sold through a
  till are related by catalog data, not by a shared transaction model (see
  §5, §9).

## 3. SBGCloud responsibilities

SBGCloud (the platform, as opposed to any single channel module) owns:

- **Catalog**: canonical product/category/price data, shared across channels.
- **Settings**: tenant-, store- and device-level configuration.
- **Device activation**: pairing a physical POS device to a tenant/store.
- **Monitoring**: device heartbeats, health, offline/online state.
- **Analytics**: cross-channel reporting (online + in-store).
- **Billing**: tenant subscription/plan billing (already exists today).
- **Sync**: moving catalog/settings down to devices, and sale/fiscal/shift
  events back up from devices.

## 4. What SBGCloud must not do

These are hard boundaries, not style preferences:

- **SBGCloud is not the fiscal cash register.** It must never be the system
  of record for "did this sale get fiscalized" at the moment of sale — that
  question is answered locally, on the device, in real time.
- **SBGCloud must not call fiscal module directly.**
- **SBGCloud must not print receipts directly.**
- SBGCloud must not perform local sale processing, fiscal receipt issuance,
  receipt printing, or any other action that a till needs to complete a sale
  in front of a customer.
- SBGCloud must not require a network round-trip to be on the critical path
  of an in-store sale. See §9 (Offline-first principle).
- SBGCloud must not become aware of, or depend on, POS hardware specifics
  (printer drivers, fiscal module vendor APIs, cash drawer control, etc.).
  That is Local POS Core's job entirely.

## 5. Local POS Core boundary

Local POS Core is a separate, offline-first runtime that lives on the
merchant's device (till/tablet), outside this repository's current runtime
boundary. Its responsibilities:

- Performs the **local sale**: cart, pricing, discounts, tender, receipt.
- Performs **fiscalization**: talks to whatever fiscal module/service is
  required in-market (see §7), synchronously, as part of completing a sale.
- Performs **printing**: receipt (fiscal and non-fiscal) and any local
  hardware output.
- Performs **recovery**: if the device crashes or loses power mid-sale, it
  must be able to resume/reconcile on next boot without duplicating or
  losing a sale.
- Owns a **durable outbox**: every sale/fiscal/shift event that needs to
  reach SBGCloud is written locally first (durable, survives restart) and
  drained to SBGCloud asynchronously, whenever connectivity allows.

Local POS Core talks to SBGCloud only through the POS Sync API (§6, §8) —
never directly against Sellgram Commerce's internal services or database.

## 6. Target module map

```
SBGCloud (platform)
├── Sellgram Commerce           existing product, unchanged domain model
│   ├── store-admin API           (/api/store-admin/*)
│   ├── shop API (Mini App)       (/api/shop/*)
│   ├── Telegram bot layer        (apps/api/src/bot/, modules/bot/)
│   └── payments-integration      (apps/api/src/payments/)
│
├── Platform core                 existing, unchanged
│   ├── system-admin              (/api/system-admin/*)
│   ├── auth / api-keys / webhook
│   └── billing / subscription
│
└── POS platform                  new, additive
    ├── POS Sync API              (/api/pos/v1/*, apps/api/src/modules/pos-sync/)
    │     catalog snapshot, settings, device activation/heartbeat,
    │     sale/fiscal/shift event ingestion — cloud side only
    └── Local POS Core            separate runtime, not in this repo today
          local sale, fiscalization, printing, recovery, durable outbox
```

Sellgram Commerce and Platform core are unaffected by this map — it only adds
a new, parallel branch (POS platform) alongside them.

## 7. POS sync future module

The POS Sync API is the *only* channel between Local POS Core and SBGCloud.
Planned responsibilities (see `apps/api/src/modules/pos-sync/` for the
current skeleton, and §12 below for the data model it will eventually need):

- **Device activation**: exchange a pairing code / activation token for a
  device identity scoped to a tenant + store.
- **Heartbeat**: lightweight liveness/health signal so SBGCloud's monitoring
  knows a device is online, its app version, and basic status.
- **Catalog snapshot**: a versioned, downloadable snapshot of the catalog a
  device needs to operate offline (products, prices, barcodes) — pull-based,
  not a live query per sale.
- **Settings**: device/store-level POS configuration (tax rules, receipt
  templates, allowed payment tenders, etc.).
- **Sale events**: append-only ingestion of completed local sales, sent
  from the device's outbox, idempotent per event id.
- **Fiscal events**: append-only ingestion of fiscal receipt outcomes
  (including "fiscalization unknown/pending" — see §10), correlated to sale
  events, never generated by SBGCloud itself.
- **Shift events**: cashier shift open/close and till reconciliation data.

The API is intentionally one-directional-heavy: devices push events up and
pull catalog/settings down. SBGCloud does not push commands into the middle
of a sale (see §11, `CloudCommand`, for the narrow exception and why it must
stay out of the sale's critical path).

## 8. Uzbekistan retail extensions

Local retail (as opposed to Telegram commerce) in Uzbekistan carries
market-specific requirements that Sellgram Commerce's current `Product`
model was never designed for:

- Fiscal-relevant product attributes (e.g. tax category / IKPU-style codes,
  unit of measurement) — modeled as an extension of `Product`, not a
  replacement (see `ProductUzProfile`, §12), so Sellgram Commerce's existing
  product data is untouched.
- Barcode-based lookup (EAN-13/UPC and similar), which Telegram/Mini App
  commerce has never needed but a till needs on every scan (see `Barcode`,
  §12).
- Fiscal receipt semantics driven by local fiscal law/hardware, handled
  entirely inside Local POS Core (§7, §10) — SBGCloud only ever receives the
  *outcome* of fiscalization, never performs it.

These extensions are additive tables/fields layered on top of the existing
catalog, not a fork of it.

## 9. Offline-first principle

**A cloud outage must not stop local sales.** This is the single most
important invariant of the whole POS direction:

- Local POS Core must be able to complete a full sale — cart, pricing,
  tender, fiscal receipt, printed receipt — with zero network connectivity.
- No external fiscal/printer/cloud I/O may sit inside the local sale
  transaction's critical path. If it's not on the device and not local, it
  is not allowed to block a sale from completing.
- Sync to SBGCloud is a background concern: the durable outbox (§5) drains
  when connectivity is available; it never gates the sale itself.
- SBGCloud, symmetrically, must be built assuming devices can be offline for
  extended periods and will reconnect with a backlog — the sync API must be
  designed for bulk, idempotent, out-of-order-tolerant ingestion, not a
  live/synchronous request-response assumption per sale.

## 10. Fiscal responsibility boundary

- Fiscalization is performed exclusively by Local POS Core, synchronously,
  as part of completing a local sale.
- SBGCloud never fiscalizes, never talks to fiscal hardware/services, and
  never generates a fiscal receipt on a device's behalf.
- **"Fiscal unknown" is a first-class state**, not an error to be papered
  over. If Local POS Core cannot confirm whether a sale was fiscalized
  (device crash mid-print, fiscal module timeout, etc.), it must record and
  eventually sync that sale with an explicit "fiscal status unknown" state —
  never silently assume success, never silently assume failure, and never
  block the register from continuing to operate while that ambiguity is
  resolved (manually or via later reconciliation).
- SBGCloud's job with fiscal data is limited to ingesting, storing, and
  surfacing these outcomes (including "unknown") for reporting/reconciliation
  — never adjudicating or retrying fiscalization itself.

## 11. Sale event idempotency

- Every sale event, fiscal event, and shift event sent from a device to
  SBGCloud must carry a stable, device-generated event id.
- SBGCloud's ingestion endpoints must be safe to call more than once with the
  same event id (retries from an unreliable network, or an outbox re-drain
  after a device restart, are the expected normal case, not an edge case).
- Idempotency is enforced on the cloud side (dedupe by event id), so a device
  never has to know whether a previous sync attempt actually landed.

## 12. Future data model (not implemented)

The following models describe *intent only* — none of them exist in
`packages/prisma/schema.prisma` yet, and nothing in this repository should
start writing to tables that don't exist. They are listed here so the
eventual schema design has a single point of reference.

`PosDevice`, `DeviceActivation`, `CatalogSnapshot`, `SyncCursor` and
`StockLedgerEntry` are the exception — they already exist (POS Sync first
wave), so their "Key fields" column below is taken directly from
`packages/prisma/schema.prisma`, not hypothetical. Everything else in this
table is still intent-only.

| Model | Purpose | Key fields | Written by | Read by | Risks |
|---|---|---|---|---|---|
| `PosDevice` | Identity of a physical till/tablet: which tenant/store it belongs to, its device type, current app version, and activation state. | `id`, `tenantId`, `storeId`, `name`, `deviceType`, `status` (PENDING/ACTIVE/SUSPENDED/REVOKED), `apiKeyHash`/`apiKeyPrefix`, `deviceCode` (public, non-secret — checked against `X-Device-Code`, docs/POS_SYNC_API.md §4), `lastSeenAt` | store-admin `POST /pos-devices` (create); POS Sync `/activate` (confirms, sets credential + `deviceCode`); `/heartbeat` (`lastSeenAt`) | POS Sync device auth (`resolveDevice` for the credential, `resolveAuthenticatedDevice` for the `deviceCode` match on every other endpoint) | Leaked `apiKeyHash` input (raw key) = device impersonation; a caller must check `status === ACTIVE`, not just "hash matches". `deviceCode`'s origin (device-generated vs. Cloud-issued) is unconfirmed with the Android team — see POS_SYNC_API.md §22 |
| `DeviceActivation` | The pairing/activation lifecycle for a `PosDevice` — activation code issuance, redemption, expiry, revocation. | `id`, `deviceId`, `activationCode` (unique), `status` (PENDING/CONFIRMED/EXPIRED), `expiresAt`, `confirmedAt` | store-admin `POST /pos-devices` (create, PENDING); POS Sync `/activate` (confirm or mark EXPIRED) | POS Sync `/activate` (lookup by code) | Short, hand-typed code is brute-forceable without a tight rate limit (mitigated — `/activate` is capped at 5/min/IP in `routes.ts`) |
| `ProductUzProfile` | Uzbekistan-specific fiscal/retail attributes attached to a `Product` (tax category, unit of measurement, fiscal product code) without modifying the core `Product` model used by Sellgram Commerce. | *(future)* `productId`, tax/fiscal category code, unit of measurement | *(future)* store-admin catalog editing / import tooling | *(future)* catalog snapshot generation, Local POS Core fiscal flow | Modeling this ahead of a confirmed fiscal partner/spec risks guessing wrong — see §13 step 7 |
| `Barcode` | One or more scannable codes (EAN-13/UPC/etc.) resolving to a `Product`/`ProductVariant`, for till-side scan lookup. | *(future)* `productId`/`variantId`, `code`, `codeType` | *(future)* store-admin catalog editing / import tooling | *(future)* catalog snapshot generation, Local POS Core scan lookup | Duplicate/conflicting codes across products in the same tenant need a uniqueness rule before this ships |
| `CatalogSnapshot` | A versioned, immutable export of the catalog (products, prices, barcodes) that a device downloads to operate offline; each snapshot is a point-in-time pull target, not a live feed. | `id`, `tenantId`, `storeId`, `version` (Int), `payload` (Json), `createdAt` | store-admin `POST /pos-devices/catalog-snapshot` (manual trigger only — no auto-generation on product/category change yet) | POS Sync `GET /catalog/snapshot` (always latest version for the device's store) | `payload` has no size cap/pagination yet; snapshot is only as fresh as the last manual trigger |
| `PosSettings` | Store-scoped POS configuration: the eight-key settings document from `docs/POS_SYNC_API.md` §10 (tax profile, payment methods, receipt template, printer/fiscal profiles, offline limits, rounding rules, feature flags). | `id`, `tenantId`, `storeId` (unique — one row per store), `version` (bumped on every write), `payload` (Json — nested shapes intentionally unconstrained pending a fiscal partner) | store-admin `PUT /pos-devices/settings` (upsert) | POS Sync `GET /settings` (full document), `/activate` + `/heartbeat` (`settingsVersion`) | Nested payload shapes are unvalidated beyond top-level keys — a fiscal-partner-specific schema will need retrofitting; device-level (per-till) overrides not modeled |
| `StockEvent` | An append-only record of a non-sale stock movement reported by a till (stock-count correction, manual restock) — ingested idempotently, same §5 semantics as `SaleEvent`. | `id`, `tenantId`, `storeId`, `deviceId`, `productId` (no FK — must survive an unknown product), `variantId?`, `delta` (signed), `reason` (`StockLedgerReason`, API accepts only `POS_ADJUSTMENT/RESTOCK/OTHER`), `idempotencyKey` (unique), `payloadHash`, `occurredAt`, `note?`, `warnings` (Json) | POS Sync `POST /stock-events` | `StockLedgerEntry` derivation (known product only) | `POS_SALE` must never be accepted here — that reason stays exclusive to sale-event derivation (POS_SYNC_API.md §14) |
| `SaleEvent` | An append-only record of a completed local sale as reported by a device — the cloud-side mirror of something that already happened locally, ingested idempotently. | `id`, `tenantId`, `storeId`, `deviceId`, `localSaleId`/`localShiftId`, `eventType`/`status` (enums), `receiptNumber`, `idempotencyKey` (unique), `payloadHash`, `occurredAt`, `payload` (Json: items/payments/totals/fiscal/print), `warnings` (Json, per-item ingest warnings) | POS Sync `POST /sale-events` (idempotent: identical replay returns the stored result, key reuse with a different payload → 409) | `StockLedgerEntry` derivation (SALE_COMPLETED only); *(future)* analytics, `ShiftProjection` | Batching not supported (one event per request); never mutate a stored event — corrections are new events (POS_SYNC_API.md §5) |
| `FiscalEvent` | The cloud-side append-only mirror of a fiscal-module receipt lifecycle, per the **real** SBG Lite POS Android contract (fiscal/shift/commands v1, 2026-07-04) — supersedes the originally-planned `FiscalReceipt` shape below, which was never built against a real device. | `id`, `tenantId`, `storeId`, `deviceId`, `eventId` (unique per device — the idempotency key), `eventType` (FISCAL_STARTED/SUCCESS/FAILED/UNKNOWN), `aggregateType`/`aggregateId`, `idempotencyKey`, `schemaVersion`, `shiftNumber`, `localReceiptId`, `daemonJournalId?`, `receiptNumber?`/`receiptType?` (SALE/REFUND), `originalLocalReceiptId?`/`originalReceiptNumber?`, `totalAmount`, `currency`, `payments`/`items` (Json), `createdAtMs`/`fiscalizedAtMs?`, `fiscalStatus`/`printStatus` (free-form strings), `fiscalReceiptNumber?`/`fiscalSign?`/`fiscalQr?`/`ofdStatus?`, `errorCode?`/`errorMessage?`, `rawDaemonResponse` (Json), `rawFiscalPayload?` (Json), `payloadHash` | POS Sync `POST /fiscal-events` (idempotent by `eventId`; identical replay is a no-op, no 409 — the real contract doesn't define one) | *(future)* reporting/reconciliation | Never generated by SBGCloud itself (§10); a stored `FISCAL_UNKNOWN`/`FAILED` is never rewritten into a success — a later success is a new row. Auth mismatch open question — see `docs/POS_SYNC_API.md` §22. `FiscalReceipt` (a normalized, `saleEventId`-linked reporting projection derived from these raw events) remains future/unbuilt — this table is the raw ingestion mirror, not that projection. |
| `ShiftEvent` | The cloud-side append-only mirror of a till shift lifecycle, per the real contract §13 — supersedes the originally-planned `ShiftProjection` shape below. | `id`, `tenantId`, `storeId`, `deviceId`, `eventId` (unique per device), `eventType` (SHIFT_OPENED/CLOSED), `aggregateType`/`aggregateId`, `idempotencyKey`, `schemaVersion`, `shiftNumber`, `shiftState`/`zReportStatus` (free-form strings), `openedAtMs?`/`closedAtMs?`, `rawDaemonResponse`/`rawShiftPayload` (Json), `payloadHash` | POS Sync `POST /shift-events` (same `eventId`-keyed idempotency as `FiscalEvent`) | *(future)* reporting/reconciliation | Same auth open question as `FiscalEvent`. `ShiftProjection` (a read-side aggregation *derived from* these events — totals, reporting) remains future/unbuilt. |
| `StockLedgerEntry` | An append-only, POS-specific stock movement record — the audit trail of *why* a `stockQty` change happened from the POS side (POS_SALE/POS_ADJUSTMENT/RESTOCK/OTHER), distinct from `StockMovement`'s job of being the actual audit trail of `stockQty` itself. | `id`, `tenantId`, `productId`, `variantId`, `delta`, `reason`, `sourceType`, `sourceId`, `createdAt` | POS Sync `POST /sale-events` (one row per known line item of a `SALE_COMPLETED` event, `reason: POS_SALE`) and `POST /stock-events` (one signed-delta row per event with a known product, `reason: POS_ADJUSTMENT/RESTOCK/OTHER`) | *(future)* POS-specific reporting/troubleshooting | Reconciliation against `StockMovement` is resolved (§13 step 4): both writers atomically apply the same signed `delta` to `Product`/`ProductVariant.stockQty` and write a paired `StockMovement` row **in the same transaction** — POS and the online storefront share one physical warehouse, so this is synchronous, not an async job, and relies on event ingestion already being idempotent (exactly-once by construction). The resulting `stockQty` is never clamped at zero — a negative value is an honest oversell signal. |
| `SyncCursor` | Per-device bookkeeping of "what has this device already pulled/pushed", so catalog/settings sync and event ingestion can resume correctly after a gap. | `id`, `deviceId` (unique), `lastCatalogVersion`, `lastSyncAt` | POS Sync `/activate` (seeds at 0); `GET /catalog/snapshot` (updates on every pull) | *(future)* delta sync / stale-device detection | Currently write-only — nothing reads it back yet; delta sync via `?since=` is explicitly out of scope this sprint |
| `CloudCommand` | A narrow, non-blocking channel for SBGCloud to signal a device (e.g. "re-activate", "refresh settings") — explicitly not a channel for anything that could gate a local sale (§9). Allowed types narrowed to the real contract's v1 list: `PING`/`REFRESH_CATALOG`/`REFRESH_SETTINGS`/`SHOW_MESSAGE`. | `id`, `tenantId`, `deviceId`, `type`, `payload` (Json), `status` (PENDING/ACKED), `createdAt`, `ackedAt?`, `ackStatus?` (DONE/FAILED/IGNORED/RETRY_LATER), `ackMessage?` | *(future)* system-admin/tenant admin action — **no admin UI creates rows yet** | POS Sync `GET /commands` (returns `[]` until something creates rows), acked via `POST /commands/:id/ack` (tenant/device isolation enforced — 404 on a foreign command) | Polling/ack surface is implemented; command *creation* is not. Must stay strictly non-blocking — never a channel for anything that could gate a local sale (§9). |
| `DeviceHeartbeat` | Time-series liveness/health pings from a device, feeding monitoring (§3) and offline/online detection. | *(future)* `deviceId`, timestamp, app version, status | *(future)* POS Sync `POST /heartbeat` | *(future)* monitoring dashboards | No history is kept today — `/heartbeat` only updates `PosDevice.lastSeenAt` directly, no time-series table yet |

## 13. Migration roadmap

This is a direction, not a sprint plan. Rough sequencing, each step additive
and independently shippable:

1. **Now**: `docs/SBGCLOUD_ARCHITECTURE.md` (this document) + POS Sync API
   skeleton (`apps/api/src/modules/pos-sync/`, all endpoints stubbed,
   returning `501 Not Implemented`). No schema changes.
2. **Catalog & device identity**: introduce `PosDevice`, `DeviceActivation`,
   `Barcode`, `CatalogSnapshot` and `SyncCursor`. Wire `activate` and
   `catalog/snapshot` endpoints against real data. No sale ingestion yet.
3. **Settings & monitoring**: introduce `PosSettings`, `DeviceHeartbeat`.
   Wire `heartbeat` and `settings` endpoints. Add device status to
   system-admin/tenant monitoring surfaces.
4. **Sale ingestion**: introduce `SaleEvent`, `StockLedgerEntry`. Wire
   `sale-events`. **Done** — the stock reconciliation strategy against
   `StockMovement` is defined and implemented: synchronous atomic
   `stockQty` update in the same transaction as the event (see the
   `StockLedgerEntry` row above, `docs/POS_SYNC_API.md` §11).
5. **Fiscal & shift ingestion**: **Done, against the real contract** — a
   real SBG Lite POS Android contract (fiscal/shift/commands v1,
   2026-07-04, backed by a real LANDI M20SE fiscalization exchange)
   arrived before `FiscalReceipt`/`ShiftProjection` were designed against
   speculation, so `FiscalEvent`/`ShiftEvent` (raw append-only mirrors,
   see §12 rows above) were built directly against it instead. The
   explicit "fiscal unknown" state is end-to-end at the ingestion/storage
   layer (append-only, never rewritten); reporting/projection
   (`FiscalReceipt`/`ShiftProjection` proper) remains future work.
6. **Commands**: **Done, against the real contract** — `CloudCommand`
   introduced with the real contract's narrowed v1 type list (`PING`/
   `REFRESH_CATALOG`/`REFRESH_SETTINGS`/`SHOW_MESSAGE`); polling/ack only,
   no command-creation surface yet. Sequenced after sale/stock ingestion
   (steps 2-4) as this roadmap intended, though "proven reliable on a real
   fleet" per the original step-6 caveat has not been separately verified
   — this was implemented as part of the same real-contract delivery as
   step 5, not gated on fleet-proven reliability first.
7. **Uzbekistan retail extensions**: introduce `ProductUzProfile` once a
   real fiscal-integration partner/spec is confirmed — avoid modeling this
   speculatively ahead of that.

At every step: Sellgram Commerce's API and domain model stay untouched, and
Local POS Core keeps working with zero connectivity regardless of what stage
the cloud side is at.
