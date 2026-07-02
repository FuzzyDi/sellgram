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

| Model | Purpose |
|---|---|
| `PosDevice` | Identity of a physical till/tablet: which tenant/store it belongs to, its device type, current app version, and activation state. |
| `DeviceActivation` | The pairing/activation lifecycle for a `PosDevice` — activation code issuance, redemption, expiry, revocation. |
| `ProductUzProfile` | Uzbekistan-specific fiscal/retail attributes attached to a `Product` (tax category, unit of measurement, fiscal product code) without modifying the core `Product` model used by Sellgram Commerce. |
| `Barcode` | One or more scannable codes (EAN-13/UPC/etc.) resolving to a `Product`/`ProductVariant`, for till-side scan lookup. |
| `CatalogSnapshot` | A versioned, immutable export of the catalog (products, prices, barcodes) that a device downloads to operate offline; each snapshot is a point-in-time pull target, not a live feed. |
| `PosSettings` | Device- or store-scoped POS configuration: tax rules, receipt template, allowed tenders, and similar operational settings. |
| `SaleEvent` | An append-only record of a completed local sale as reported by a device — the cloud-side mirror of something that already happened locally, ingested idempotently by event id. |
| `FiscalReceipt` | The fiscalization outcome for a `SaleEvent` (including the explicit "unknown" state from §10), never the trigger for fiscalization itself. |
| `ShiftProjection` | A read-side projection of cashier shift state (opened/closed, totals) built from shift events, for reporting/reconciliation. |
| `StockLedgerEntry` | An append-only stock movement record originating from POS sales, kept separate from (but eventually reconciled against) the existing `StockMovement` table used by Sellgram Commerce. |
| `SyncCursor` | Per-device bookkeeping of "what has this device already pulled/pushed", so catalog/settings sync and event ingestion can resume correctly after a gap. |
| `CloudCommand` | A narrow, non-blocking channel for SBGCloud to signal a device (e.g. "re-activate", "refresh settings") — explicitly not a channel for anything that could gate a local sale (§9). |
| `DeviceHeartbeat` | Time-series liveness/health pings from a device, feeding monitoring (§3) and offline/online detection. |

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
   `sale-events`. Define and document the stock reconciliation strategy
   against `StockMovement` before turning this on for real devices.
5. **Fiscal & shift ingestion**: introduce `FiscalReceipt`,
   `ShiftProjection`. Wire `fiscal-events` and `shift-events`, including the
   explicit "fiscal unknown" state end-to-end (ingestion → storage →
   reporting).
6. **Commands**: introduce `CloudCommand`, only after sync/ingestion is
   proven reliable, and only for operations that cannot regress into
   gating a local sale.
7. **Uzbekistan retail extensions**: introduce `ProductUzProfile` once a
   real fiscal-integration partner/spec is confirmed — avoid modeling this
   speculatively ahead of that.

At every step: Sellgram Commerce's API and domain model stay untouched, and
Local POS Core keeps working with zero connectivity regardless of what stage
the cloud side is at.
