# B2B / Counterparties — Architecture Specification

Status: **design only** — no migration, no code in this pass. This document
fixes the design for review; implementation is a separate, later session.
Field names below are cross-checked against the current
`packages/prisma/schema.prisma` (as of 2026-07-05) — anywhere a name is
quoted, it is the real name in the running schema, not a guess.

See also: `docs/SBGCLOUD_ARCHITECTURE.md` (Sellgram/POS channel split this
document extends into a third channel) and `docs/POS_SYNC_API.md` (the
`applyStockDelta()` / `StockLedgerEntry` pattern this document reuses for
debt accounting).

## 1. Purpose

Add a third sales channel — **B2B / wholesale** — to SBGCloud, alongside
the existing Sellgram (Telegram bot/miniapp) and POS (till/fiscal terminal)
channels. A store owner/manager can manually record a wholesale order for
a known business or individual counterparty who ordered by phone/WhatsApp,
at a negotiated price, on credit (with a due date), without that
counterparty ever touching the storefront or a POS device.

## 2. Problem statement

Sellgram has been marketed as an independent, simple system ("a shop in
Telegram in 5 minutes"). SBGCloud is now growing it into a multi-channel
ERP. The B2B module must add real capability for tenants who need it
without adding any surface area, cost, or complexity for tenants who only
use Sellgram:

- No schema change may alter the behavior of `Product.price` as read by
  the bot/miniapp.
- No schema change may break the existing required
  `Order.customerId` → `Customer` relationship for Telegram orders.
- The module must be **off by default** and invisible unless a tenant
  explicitly turns it on.

## 3. Cost price flow (unchanged, reused)

`Product.costPrice` (`Decimal? @db.Decimal(12, 2)`) already exists and is
already the sole source of unit cost in the schema. It is written in
exactly one place today:
`apps/api/src/modules/procurement/routes.ts` (`PurchaseOrder` receive
handler) — landed cost is allocated across the received `PurchaseOrderItem`
rows proportionally by each item's share of `totalCost`, combined with the
PO's `shippingCost`/`customsCost`, and the **last** receipt's per-unit
landed cost overwrites `Product.costPrice` via
`tx.product.updateMany({ data: { costPrice: Math.round(perUnitLanded) } })`.
This is last-batch landed cost, not a weighted average — already true
today, and this document does not change it.

**B2B reuses this unchanged.** Margin for a B2B order line is simply
`(resolved unit price) − Product.costPrice` at order-creation time. No new
cost-tracking model, no FIFO/LIFO, no per-batch costing is introduced by
this module — that would be a separate, much larger initiative if ever
needed.

## 4. Pricing model — exactly two price levels

1. **`Product.price`** (`Decimal @db.Decimal(12, 2)`, `ProductVariant.price`
   for variant overrides) — the retail price. Read by Sellgram (bot +
   miniapp) exactly as today; **zero changes** to that read path. POS does
   not read this field either (it already has its own price at time of
   sale, submitted after the fact via `sale-events`) — this predates B2B
   and is unaffected by it.
2. **`CounterpartyPrice`** (new) — an individual negotiated price for one
   `(counterparty, product[, variant])` tuple.

There is no third "Sellgram price" concept — `Product.price` *is* the
Sellgram price, unconditionally, as it is today.

**Resolution order when a manager adds a line item to a B2B order:**
`CounterpartyPrice` row for `(counterpartyId, productId, variantId)` if one
exists → else `ProductVariant.price` (if a variant is selected and has its
own price) → else `Product.price`. This mirrors how `OrderItem.price` is
already a point-in-time snapshot regardless of channel (`OrderItem.price`
already exists and is already populated at order-creation time for
Telegram orders) — B2B needs no new snapshot mechanism, just a different
resolution rule feeding the existing `OrderItem.price` field. A missing
`CounterpartyPrice` row never blocks order creation — it is a fallback,
not a validation failure.

## 5. Data model (proposed — not yet migrated)

### 5.1 `Counterparty` (new)

```prisma
enum CounterpartyType {
  INDIVIDUAL
  ORGANIZATION
}

model Counterparty {
  id           String            @id @default(cuid())
  tenantId     String
  tenant       Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  type         CounterpartyType
  name         String
  taxId        String?           // required for ORGANIZATION — app-level check, not a DB constraint (Prisma cannot express "required iff type=X")
  phone        String?
  email        String?
  address      String?
  note         String?
  isActive     Boolean           @default(true)

  // Optional link when the same partner both buys wholesale and supplies
  // stock. Nullable + unique: at most one Counterparty per Supplier, never
  // required, never backfilled for existing Supplier rows.
  supplierId   String?           @unique
  supplier     Supplier?         @relation(fields: [supplierId], references: [id], onDelete: SetNull)

  // Cached running balance — see §7. Updated atomically alongside every
  // CounterpartyLedger row in the same transaction; never computed by a
  // separate reconciliation job.
  currentDebt  Decimal           @default(0) @db.Decimal(12, 2)

  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  prices       CounterpartyPrice[]
  ledger       CounterpartyLedger[]
  orders       Order[]

  @@index([tenantId])
  @@map("counterparties")
}
```

`Counterparty` is **independent** of `Customer` (retail Sellgram buyers,
`model Customer` — keyed on `telegramId`) and `Supplier` (who the tenant
buys from, `model Supplier`). Neither existing model is touched, merged,
or renamed. The `supplierId` link is the only bridge, and it is optional
and one-directional (`Counterparty → Supplier`, not the reverse — `Supplier`
gets no new field). A `customerId` bridge (`Counterparty → Customer`) is
deliberately **not** included in this pass — see Open Questions §12.

### 5.2 `CounterpartyPrice` (new)

```prisma
model CounterpartyPrice {
  id             String        @id @default(cuid())
  counterpartyId String
  counterparty   Counterparty  @relation(fields: [counterpartyId], references: [id], onDelete: Cascade)
  productId      String
  product        Product       @relation(fields: [productId], references: [id], onDelete: Cascade)
  variantId      String?
  variant        ProductVariant? @relation(fields: [variantId], references: [id], onDelete: Cascade)
  price          Decimal       @db.Decimal(12, 2)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@unique([counterpartyId, productId, variantId])
  @@map("counterparty_prices")
}
```

**Implementation note carried over from the POS Sync work
(`docs/POS_SYNC_API.md` §22, `PosDevice.deviceCode`):** Postgres does not
treat `NULL = NULL` in a unique index. A product with no variants will
have `variantId = NULL` on its `CounterpartyPrice` row, and
`@@unique([counterpartyId, productId, variantId])` will **not** stop two
such rows from being inserted for the same counterparty+product pair. The
same gotcha applied to `PosDevice.deviceCode` and was resolved there by
making the column non-nullable; that fix does not apply here since
`variantId` is genuinely absent for non-variant products. The eventual
implementation must either (a) enforce uniqueness for the
`variantId IS NULL` case with a Postgres partial unique index
(`CREATE UNIQUE INDEX ... WHERE "variantId" IS NULL`), added as a
follow-up raw-SQL migration alongside the Prisma-generated one, or (b) do
the uniqueness check in the write path inside the same transaction. Flag
this explicitly in the implementation PR — do not rely on the
`@@unique` line alone.

### 5.3 `CounterpartyLedger` (new — append-only, `StockLedgerEntry` pattern)

```prisma
enum CounterpartyLedgerType {
  ORDER_CHARGE
  PAYMENT_RECEIVED
  ADJUSTMENT
}

model CounterpartyLedger {
  id             String                  @id @default(cuid())
  tenantId       String
  tenant         Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  counterpartyId String
  counterparty   Counterparty            @relation(fields: [counterpartyId], references: [id], onDelete: Cascade)
  type           CounterpartyLedgerType
  // Signed, same convention as StockLedgerEntry.delta: positive increases
  // currentDebt, negative decreases it. ORDER_CHARGE rows are always
  // positive; PAYMENT_RECEIVED rows are always negative; ADJUSTMENT can
  // be either.
  delta          Decimal                 @db.Decimal(12, 2)
  // Only ever set for ORDER_CHARGE — a payment is a free-standing amount
  // against the counterparty's overall balance, not tied to one order
  // (see §7).
  orderId        String?
  order          Order?                  @relation(fields: [orderId], references: [id], onDelete: SetNull)
  // ORDER_CHARGE only. originalDueDate is written once at creation and
  // never changes. dueDate starts equal to originalDueDate and is the
  // one field on this row that IS mutated after creation, when a due
  // date is extended — see §7 for why this is a deliberate, narrow
  // exception to "append-only".
  originalDueDate DateTime?
  dueDate        DateTime?
  note           String?
  createdAt      DateTime                @default(now())

  @@index([tenantId, counterpartyId, createdAt])
  @@map("counterparty_ledger")
}
```

### 5.4 `Product` / `ProductVariant`

No field changes. Both gain a new back-relation (`counterpartyPrices`) for
the Prisma relation on `CounterpartyPrice` above — additive, no behavior
change to either model.

### 5.5 `Tenant`

One new field:

```prisma
model Tenant {
  // ...existing fields unchanged...
  b2bEnabled Boolean @default(false)
}
```

See §9 for why this is a plain tenant-level boolean rather than a
plan-gated feature like `posEnabled`.

### 5.6 `User` / permissions

No schema change (`User.permissions Json?` already exists and is
schemaless by design). See §8.

## 6. Order model changes and risks

Two additive fields on `Order`:

```prisma
enum SalesChannel {
  TELEGRAM
  B2B
}

model Order {
  // ...existing fields...
  salesChannel   SalesChannel  @default(TELEGRAM)
  counterpartyId String?
  counterparty   Counterparty? @relation(fields: [counterpartyId], references: [id])
}
```

`salesChannel` defaults to `TELEGRAM`, so every existing row is correct
with no backfill needed — this part is low-risk and reversible.

### 6.1 `customerId` becoming optional — the highest-risk change in this document

Today, `Order.customerId` is:

```prisma
customerId String
customer   Customer @relation(fields: [customerId], references: [id])
```

**Required, not nullable.** Making it `String?` / `Customer?` is
necessary — a B2B order has a `Counterparty`, not a `Customer` — but it is
a breaking type change for every piece of code that currently assumes
`order.customerId` and `order.customer` are always present. Confirmed call
sites in the current codebase that rely on this:

- **`apps/api/src/modules/order/order.service.ts:19`** —
  `tx.order.findFirst({ include: { items: true, customer: true }, ... })`,
  then reads `order.customer.loyaltyPoints`, `order.customer.totalSpent`,
  `order.customer.referredBy`, `order.customer.ordersCount` directly
  (lines ~70–151) to run loyalty-points award and referral-bonus logic.
  With `customer` becoming optional, every one of these reads becomes a
  potential null-dereference for a B2B order — this logic must be
  explicitly skipped for `salesChannel === 'B2B'` (or, equivalently,
  wherever `customerId === null`), not just null-guarded reactively.
- **`apps/api/src/modules/bot/checkout.service.ts`** — the entire
  Telegram checkout flow takes `customerId: string` (required, non-null)
  as an input parameter (line 6) and threads it through cart lookup,
  order creation, loyalty debit, and referral-bonus crediting (roughly
  lines 11–295). This file is Telegram-only in practice (it is *the*
  bot checkout path) — it should never be called for a B2B order, but
  nothing today makes that structurally impossible; the B2B order-creation
  code path must be a **new, separate** function, not a shared one with an
  optional-customer branch bolted on.
- **`OrderReview.customerId`** (schema, required, unrelated model but
  worth checking during implementation) and any admin/reporting query that
  joins `Order` to `Customer` and assumes the join always matches (e.g.
  customer order-history views, `totalSpent`/`ordersCount` aggregates) —
  needs a full `grep -rn "\.customerId\|order\.customer\b"` across
  `apps/api/src` and `apps/web/src` before implementation, not just the
  two files above.

**Recommendation:** treat this as its own PR, landed and verified
independently of the rest of the B2B module (new models, new endpoints),
with `tsc --noEmit` as the first checkpoint — the type change from
`string` to `string | null` will surface every affected call site as a
compile error, which is the cheapest way to find them all.

### 6.2 Business rule (application-level, not a DB constraint)

- `salesChannel = B2B` ⇒ `counterpartyId` required, `customerId` must be
  `null`.
- `salesChannel = TELEGRAM` ⇒ `customerId` required, `counterpartyId` must
  be `null`.

Prisma/Postgres cannot express "exactly one of these two FKs is set,
conditioned on a third enum column" as a schema-level constraint — this is
enforced in the B2B order-creation service code, analogous to how
`resolveAuthenticatedDevice()` in `pos-sync/routes.ts` enforces a pairing
invariant that the schema alone can't.

## 7. Debt / credit ledger

Pattern: identical in shape to `applyStockDelta()` in
`apps/api/src/modules/pos-sync/routes.ts` (atomic signed-delta update of a
cached total + an append-only ledger row, in one `$transaction`, no async
reconciliation job) — applied here to money instead of stock.

- **`ORDER_CHARGE`** — written when a B2B order is created.
  `delta = +total` (positive, increases `Counterparty.currentDebt`).
  `originalDueDate` is fixed at creation (e.g. "net 30" computed by the
  manager at order time) and never changes afterward.
- **`PAYMENT_RECEIVED`** — written when a manager records a payment.
  `delta = −amount` (negative, decreases `currentDebt`). **Not** tied to a
  specific order — `orderId` is `null` for these rows. A counterparty's
  debt can be paid down in arbitrary partial amounts across multiple
  orders' worth of charges; the ledger tracks the running total, not a
  per-order "paid/unpaid" flag. This mirrors real-world wholesale
  bookkeeping (a partner pays down what they owe, not invoice-by-invoice)
  and avoids needing a payment-allocation/matching system in v1.
- **`ADJUSTMENT`** — manual correction (either sign), e.g. a
  write-off or a manager-entered fix.

**Due-date extension** is *not* a new ledger row. It is an in-place update
of the `dueDate` field on the original `ORDER_CHARGE` row (`originalDueDate`
stays frozen as the record of what was promised at order time). The
extension event itself is logged via the **existing**
`writeAuditLog()` helper (`apps/api/src/lib/audit.ts`) into the existing
`TenantAuditLog` model — no new history/versioning table for due-date
extensions. Suggested `action` string, following the codebase's existing
dot-separated convention (`store.create`, `payment.method.update`, etc.):
`b2b.debt.duedate_extended`, with `details: { orderId, previousDueDate,
newDueDate }`.

This is the one deliberate exception to "the ledger is append-only" in
this design — call it out explicitly in the implementation PR so it isn't
mistaken for an oversight when a reviewer notices a ledger row being
`UPDATE`d.

## 8. Permissions

One new permission key, added to the existing granular-permission system
(`apps/api/src/modules/auth/service.ts`'s `TeamPermissionKey` type, which
today is `manageCatalog | manageOrders | manageCustomers | manageMarketing
| manageSettings | manageBilling | manageUsers | viewReports`, backed by
`User.permissions Json?` and enforced via
`apps/api/src/plugins/permission-guard.ts`'s `permissionGuard()`):

```
manageB2B
```

Defaults, following the existing `OPERATOR_DEFAULT_PERMISSIONS` /
`MARKETER_DEFAULT_PERMISSIONS` pattern in `auth/service.ts`: `true` for
`OWNER`/`MANAGER` (who already bypass all permission checks entirely —
`permissionGuard()` short-circuits for those two roles before ever
consulting the permission map), `false` by default for `OPERATOR` and
`MARKETER`, overridable per-user the same way every other permission is
today.

Covers: creating/editing B2B orders, recording `CounterpartyLedger`
payments, and cost/margin visibility **within the B2B module's own
screens** (e.g. a margin column on the B2B order-entry form).

**Decision — scope of `manageB2B` relative to `costPrice`, does not change
existing behavior:** `Product.costPrice` is already returned by the
general product endpoints (`GET /products`, `GET /products/:id` etc. in
`apps/api/src/modules/product/routes.ts`) under the existing
`manageCatalog` permission, which `OPERATOR` has `true` by default.
`manageB2B` gates cost/margin visibility **only** within the new B2B
surfaces this module introduces — creating/editing B2B orders,
`CounterpartyPrice` management, and `CounterpartyLedger` payment recording.
It is a deliberate, scoped decision **not** to touch the existing
product-catalog endpoints or narrow who can already see `costPrice` there:
that visibility is `manageCatalog`'s concern, unchanged by this module.
Any future push for cross-surface consistency (e.g. also gating
`costPrice` on the general product endpoints behind something stricter)
is a separate initiative, out of scope here — not tracked as an open
question, since no change is planned.

## 9. Module toggle and monetization

`Tenant.b2bEnabled` (`Boolean @default(false)`) — a plain per-tenant
switch, checked directly (`if (!tenant.b2bEnabled) return 404/403`),
**not** routed through `planGuard()` / `packages/shared/src/constants/plans.ts`
the way `posEnabled` is today (`posEnabled` is a boolean *inside* each
plan's `limits` object — `FREE: false`, `PRO: true`, `BUSINESS: true` —
enforced by `planGuard('posEnabled')` as a `preHandler`). B2B is
deliberately **not** wired into `PLANS` in this version: any tenant, on
any plan (Free/Pro/Business), can flip it on. This is a conscious
monetization decision, not an oversight — see Open Questions §12 for the
plan to revisit it once real usage data exists.

## 10. Workflow

- No self-service portal for the counterparty in this version — no login,
  no customer-facing UI. A manager or owner creates the B2B order manually
  in the admin, from information received out-of-band (phone call,
  WhatsApp, etc.).
- Future admin navigation (not implemented in this pass): a third top-level
  section, "B2B / Опт", alongside the existing Sellgram and POS sections —
  a navigation/redesign concern for a later UI pass, not something this
  document's implementation needs to touch.

## 11. What this does NOT change

- **`Customer`** (`model Customer`) — untouched. Retail Sellgram buyers
  keyed on `telegramId` remain exactly as they are. No merge, no shared
  table, no new fields.
- **`Supplier`** (`model Supplier`) — untouched, aside from gaining an
  optional inbound relation from the new, nullable, unique
  `Counterparty.supplierId`. No existing `Supplier` row is migrated,
  backfilled, or altered.
- **`PurchaseOrder` / `PurchaseOrderItem`** — untouched. Landed-cost
  calculation and the `Product.costPrice` write in
  `procurement/routes.ts` are reused exactly as they exist today; nothing
  in this module changes how costing is computed.
- **Sellgram (bot + miniapp) / `checkout.service.ts`** — untouched.
  `Product.price` remains the sole price source for that channel. The
  Telegram checkout flow (`apps/api/src/modules/bot/checkout.service.ts`)
  is not modified by this design; B2B order creation is a new, separate
  code path (see §6.1).
- **POS Sync** (`docs/POS_SYNC_API.md`, `pos-sync/routes.ts`) — untouched
  and unrelated. POS continues to submit its own price at time of sale via
  `sale-events`/`fiscal-events`; this module does not read or write
  anything in the `pos-sync` module.

## 12. Open questions

1. **`Counterparty.customerId` bridge.** Not implemented in this pass. If
   a person who is already a retail `Customer` later becomes a B2B
   counterparty, there is currently no link between the two records. A
   future optional, nullable `Counterparty.customerId` (mirroring the
   `supplierId` link in shape) would let the admin surface "this
   counterparty is also a Sellgram customer" without merging the models.
   Needs its own design pass (in particular: what happens to
   `Customer.totalSpent`/`ordersCount` — should B2B order value count
   toward those, given they currently only reflect Telegram orders?).
2. **UI treatment for products with no `CounterpartyPrice` row.** The
   design says this falls back silently to `Product.price` and never
   blocks order creation (§4) — but from a UX standpoint, should the
   order-entry screen visually distinguish "this line uses the
   counterparty's negotiated price" from "this line is using the default
   retail price as a fallback because none was set"? Left to the
   implementation/design pass — functionally it makes no difference to the
   order or the ledger, only to what the manager sees while building the
   order.
3. **`CounterpartyPrice` NULL-variant uniqueness** — see the implementation
   note in §5.2. Needs a decision (partial unique index vs.
   transactional check) before the first migration is written, not after.
4. **Monetization reconsideration.** `b2bEnabled` is free on every plan
   today (§9) — deliberately, to gather real usage data before deciding
   whether B2B becomes a paid add-on (e.g. Business-only, or its own
   line item) once it's clear which tenants actually use it. Revisit
   after a few months of production data.

## 13. Recommended implementation order for next session

1. **`Order.customerId` → optional**, isolated PR: schema migration +
   `tsc --noEmit` audit of every resulting compile error across
   `apps/api/src` and `apps/web/src` + explicit skip-guards for
   loyalty/referral logic in `order.service.ts` when there is no
   `customerId`. Land and verify this alone before anything else — it is
   the one change touching a hot, battle-tested path.
2. **New models**: `Counterparty`, `CounterpartyPrice` (with the
   partial-unique-index decision from §5.2/§12.3 resolved first),
   `CounterpartyLedger`, plus the `Tenant.b2bEnabled`,
   `Order.salesChannel`, `Order.counterpartyId` additive fields — one
   migration, no data backfill needed (all new/nullable/defaulted).
3. **`manageB2B` permission** — add to `TeamPermissionKey` and both
   default-permission maps in `auth/service.ts`.
4. **Admin CRUD**: `Counterparty` management, `CounterpartyPrice`
   list/edit per counterparty, module toggle endpoint gated on
   `manageSettings` (matching how other tenant-level toggles are gated
   today).
5. **B2B order creation** — new service function (not a branch inside
   `checkout.service.ts`), applying §4's price-resolution order and
   writing the `ORDER_CHARGE` ledger row + `currentDebt` update in one
   transaction, following `applyStockDelta()`'s shape.
6. **Payment recording** — `PAYMENT_RECEIVED` ledger endpoint, gated on
   `manageB2B`.
7. **Due-date extension** — `dueDate` update + `writeAuditLog()` call.
8. Tests throughout, mirroring the existing `pos-sync/routes.test.ts`
   style (mock Prisma, assert transaction contents, assert ledger +
   cached-balance consistency) — not deferred to the end.
