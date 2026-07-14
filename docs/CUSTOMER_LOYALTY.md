# Customer / Loyalty — Architecture Specification

Status: **design only** — no `schema.prisma` changes, no code in this
pass. This document fixes the design for review; implementation is a
separate, later session per §13.

Field/endpoint names below are cross-checked against the current
`packages/prisma/schema.prisma` and `apps/api/src/modules/` (as of
2026-07-14) — anywhere a name is quoted, it is real, not hypothetical.
**Correction to the request that seeded this document:** the request
this document was written from assumed no loyalty system exists yet
("Базовая система лояльности" as something to design from scratch).
That's wrong — a full, tenant-configurable loyalty engine
(`LoyaltyConfig`, `LoyaltyTransaction`, tiers, referrals, point
redemption at checkout) already exists and is already live for the
Sellgram/Telegram channel. §3 documents it in full; §6 is a
correction of the request's assumed shape, not a from-scratch design.
See also: `docs/B2B_COUNTERPARTIES.md` (the structural precedent for
"design-only, implementation-order-at-the-end" documents this one
follows, and the source of the still-open `Counterparty`↔`Customer`
bridge question this document resolves — §9), `docs/PRODUCT_TYPES.md`
(§5's correction about a documented-but-never-persisted
`weightBarcode` field is the same class of mistake this document
flags for `SaleEvent.customerId` in §7 — a field a client might send
that the server silently drops today), and `docs/POS_SYNC_API.md`
(§9 catalog snapshot, §10 settings, §11 sale-event ingest — all
referenced below).

## 1. Purpose

Today `Customer` (`model Customer`, `schema.prisma`) is a
Telegram-only buyer profile — `telegramId` is required, and the row is
created by `telegramShopAuth()` the moment someone opens the Sellgram
miniapp. POS sales are completely anonymous — `SaleEvent` and
`FiscalEvent` have no customer reference of any kind. B2B wholesale
buyers are a fourth, entirely separate entity, `Counterparty`
(`docs/B2B_COUNTERPARTIES.md`), with no link back to `Customer`.

The result: the same real person — say, a regular who orders via the
Telegram bot *and* buys in person at the till — is three unrelated
database rows to SBGCloud today, with three unrelated purchase
histories and no shared loyalty balance. The goal of this document is
to extend `Customer` into a **universal buyer profile** ("Contact")
that a single person can be recognized as across all three channels,
while keeping every existing Sellgram code path — checkout, loyalty
accrual, referrals — working exactly as it does today for tenants who
never touch POS or B2B.

## 2. Participant taxonomy

Fixing vocabulary before touching schema — these four roles are
already distinct in the codebase (four separate models); this section
just names the boundary explicitly so the rest of the document doesn't
have to re-litigate it:

- **`Supplier`** (`model Supplier`) — who the tenant buys stock *from*.
  Real fields today: `name`, `contactName`, `phone`, `email`,
  `address`, `note`, `isActive`, plus `purchaseOrders` and an optional
  `counterparty` back-relation (`docs/B2B_COUNTERPARTIES.md` §5.1).
  **Not a buyer.** Out of scope for this document entirely — mentioned
  only to rule it out, since "Supplier" and "Contact" are easy to
  conflate by name alone.
- **`Customer`** (`model Customer`) — a person who buys *from* the
  tenant. Three channels, today only the first two exist as concepts
  in the schema at all:
  - **Sellgram** — identified by `telegramId` (`BigInt`, currently
    required). The only channel with an existing `Customer` row today.
  - **POS** — no identification mechanism exists at all today (§3).
    Target: phone number, a loyalty card number, or a scanned QR (§5).
  - **B2B** — not a `Customer` at all today; a wholesale buyer is a
    `Counterparty` row, a separate model (below). §9 covers whether/how
    the two connect.
- **`Counterparty`** (`model Counterparty`,
  `docs/B2B_COUNTERPARTIES.md` §5.1) — a wholesale buyer with its own
  negotiated pricing (`CounterpartyPrice`) and running debt
  (`CounterpartyLedger`/`currentDebt`). Can be `INDIVIDUAL` or
  `ORGANIZATION` (`CounterpartyType`). Already has one optional bridge
  field, `supplierId` (nullable, `@unique`, for the same partner acting
  as both supplier and wholesale buyer) — no equivalent bridge to
  `Customer` exists yet; that gap is `docs/B2B_COUNTERPARTIES.md` §12
  open question 1, which §9 below resolves.

## 3. Current state

### 3.1 `Customer` (Sellgram-only today)

```prisma
model Customer {
  id            String   @id @default(cuid())
  tenantId      String
  telegramId    BigInt
  telegramUser  String?
  firstName     String?
  lastName      String?
  languageCode  String?
  phone         String?
  loyaltyPoints Int      @default(0)
  totalSpent    Decimal  @default(0) @db.Decimal(12, 2)
  ordersCount   Int      @default(0)
  tags          String[] @default([])
  note          String?
  referralCode  String?  @unique
  referredBy    String?
  botBlocked    Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([tenantId, telegramId])
  @@index([tenantId])
}
```

`telegramId` is `BigInt`, **required** — the schema cannot represent a
buyer without a Telegram account. The row is created (not merely
looked up) by `telegramShopAuth()`
(`apps/api/src/modules/bot/shop-auth.ts:45`), an upsert keyed on
`tenantId_telegramId`, that runs on **every authenticated miniapp
request**, not just the first order — the request that seeded this
document said "created on first order," which is close but not quite
right; it's first *authenticated visit*. `phone` already exists as an
optional free-text field, but has no index and nothing populates it
automatically — a customer's phone is whatever they type into an
address form, not a verified identifier.

`referralCode` already exists too, but it is **not** a loyalty-card
identifier — it's generated lazily, on first `GET /shop/profile` call
(`apps/api/src/modules/bot/shop-api.ts:257-264`), as an 8-character
uppercase hex string (`randomBytes(4).toString('hex')`), and its only
use is the referral-bonus flow in §3.3. Worth naming explicitly because
§4/§8 introduce a *different* generated identifier
(`loyaltyCardNumber`) that must not be confused with it.

### 3.2 POS — zero customer concept

`SaleEvent` and `FiscalEvent` (`schema.prisma`) have no `customerId`
field, no phone field, nothing. `grep -rln "customer"
apps/api/src/modules/pos-sync/` returns no matches. Every POS sale
today is, and can only be, anonymous — the till has no way to tell
Cloud who bought anything, and nothing in the `docs/POS_SYNC_API.md`
wire contract has a slot for it either.

### 3.3 Loyalty — already fully implemented, Sellgram-only

This is the main correction to the request this document was written
from. A complete, tenant-configurable loyalty engine already exists:

```prisma
model LoyaltyConfig {
  id                  String  @id @default(cuid())
  tenantId            String  @unique
  isEnabled           Boolean @default(false)
  pointsPerUnit       Int     @default(1)
  unitAmount          Int     @default(1000) // 1 point per 1000 UZS
  pointValue          Int     @default(100)  // 1 point = 100 UZS
  maxDiscountPct      Int     @default(30)
  minPointsToRedeem   Int     @default(100)
  tiers               Json?   // [{name,nameUz,minSpend,multiplier,color}]
  referralEnabled     Boolean @default(false)
  referralBonus       Int     @default(500)  // points to referrer
  referralFriendBonus Int     @default(0)    // points to invited friend
}

enum LoyaltyTxnType {
  EARN
  REDEEM
  ADJUST
  EXPIRE
}

model LoyaltyTransaction {
  id           String         @id @default(cuid())
  customerId   String
  tenantId     String
  type         LoyaltyTxnType
  points       Int
  balanceAfter Int
  orderId      String?
  description  String?
  createdAt    DateTime       @default(now())
}
```

Not a fixed three-tier BASIC/SILVER/GOLD scheme as the seeding request
assumed — **tiers are per-tenant configurable JSON**
(`LoyaltyConfig.tiers`), each `{ name, nameUz, minSpend, multiplier,
color }`. Default, if a tenant never customizes it
(`apps/api/src/modules/loyalty/routes.ts:7-12`,
`DEFAULT_TIERS`/`computeTier()`):

| Tier | `minSpend` (UZS, lifetime `totalSpent`) | `multiplier` |
|---|---|---|
| Bronze | 0 | 1× |
| Silver | 500,000 | 1.5× |
| Gold | 2,000,000 | 2× |
| Platinum | 10,000,000 | 3× |

Full lifecycle, all already live:

- **Accrual** — on `Order` status transition to `COMPLETED`
  (`apps/api/src/modules/order/order.service.ts:90-118`), gated on
  `loyaltyConfig.isEnabled && order.customerId` (the `order.customerId`
  guard is exactly why B2B orders, which have no `customerId`, are
  already skip-guarded here — `docs/B2B_COUNTERPARTIES.md` §13 step 1).
  `pointsEarned = floor(floor(order.total / unitAmount) * pointsPerUnit
  * tier.multiplier)`, written onto `Customer.loyaltyPoints` and a
  `LoyaltyTransaction{type: EARN}` row in the same transaction.
- **Redemption** — at Telegram checkout time, not at order-completion
  time (`apps/api/src/modules/bot/checkout.service.ts:122-134`): capped
  by `min(requested, customer.loyaltyPoints, maxDiscountPct-of-subtotal
  ÷ pointValue)`, and only applied at all if the result clears
  `minPointsToRedeem`. Stored as `Order.loyaltyDiscount` /
  `Order.loyaltyPointsUsed`, decremented from the balance immediately
  (not waiting for `COMPLETED`) with a `LoyaltyTransaction{type:
  REDEEM}` row.
- **Reversal on cancel** — `order.service.ts:71-87`: cancelling an
  order with `loyaltyPointsUsed > 0` returns the points
  (`type: ADJUST`), same skip-guard for orders with no `customerId`.
- **Referrals** — `order.service.ts:120-164`, gated on
  `loyaltyConfig.referralEnabled && customer.referredBy &&
  customer.ordersCount === 0` (first completed order only): pays
  `referralBonus` points to the referrer and `referralFriendBonus` to
  the new customer, both `type: EARN`.
- **Manual adjustment** — already has an admin endpoint,
  `POST /customers/:id/loyalty` (`apps/api/src/modules/customer/
  routes.ts:133-170`, `permissionGuard('manageCustomers')`),
  `type: ADJUST`.
- **Admin config UI** — already exists,
  `apps/admin/src/pages/settings/LoyaltyTab.tsx`, backed by
  `GET`/`PATCH /loyalty/config`
  (`apps/api/src/modules/loyalty/routes.ts`).

`LoyaltyTxnType.EXPIRE` is defined in the enum but **nothing in the
codebase ever writes it** — point expiry has a reserved value and zero
implementation. Carried into §12 as a still-open question, not
resolved by this document.

**The actual gap is not "no loyalty system."** It's that every piece
of this — accrual, redemption, tiers, referrals — is wired
exclusively to `Order.customerId`, which only Sellgram orders ever
have. `Customer.totalSpent`/`ordersCount` (the tier-computation input)
only ever increments from `COMPLETED` Sellgram orders today; a
customer who spends millions at the till by phone-number lookup would
show `totalSpent: 0` and sit in the lowest tier forever, because
nothing connects a POS sale to a `Customer` row at all (§3.2). §6/§7
extend the *existing* engine to the other two channels; they do not
replace it.

### 3.4 B2B — separate entity, no bridge

`Counterparty` (§2) has no relation to `Customer` at all.
`docs/B2B_COUNTERPARTIES.md` §12 open question 1 flagged this exact
gap already and left it unresolved pending "its own design pass" —
this document is that pass; see §9.

## 4. Target state — universal `Customer` profile

```prisma
model Customer {
  // ...existing fields unchanged...

  // Nullable: a POS-registered buyer may never touch Telegram at all.
  // @@unique([tenantId, telegramId]) is UNAFFECTED by this — Postgres
  // does not treat NULL = NULL in a unique index (the same gotcha
  // flagged for CounterpartyPrice.variantId, docs/B2B_COUNTERPARTIES.md
  // §5.2), which for THIS field is actually the wanted behavior: any
  // number of POS-only customers can coexist with telegramId = NULL
  // without tripping the constraint, no partial-index workaround
  // needed here the way CounterpartyPrice needed one.
  telegramId       BigInt?

  // Loyalty-card identification (§5) — distinct from referralCode
  // (§3.1), which stays exactly what it is today.
  loyaltyCardNumber String? @unique
  loyaltyCardQr     String?

  // Which channel(s) this profile is known to — set-like, same
  // String[] shape as the existing `tags` field on this model, not a
  // new pattern. A customer can accumulate entries over time (starts
  // POS-only, later opens the Telegram bot) — this is append-only in
  // practice, never removed.
  channels String[] @default([])

  // Optional bridge to a B2B wholesale identity — see §9 for why this
  // is the mirror image of Counterparty.supplierId rather than a field
  // on Counterparty, and why NOT a field named counterpartyId here.

  @@index([tenantId, phone])
  @@index([tenantId, loyaltyCardNumber])
}
```

**Deviation from the request that seeded this document, flagged
explicitly:** the request asked for the bridge field in *both*
directions — `Customer.counterpartyId` in its §4 and
`Counterparty.customerId` in its §9, which is two different, mutually
exclusive schema shapes, not a typo in one place. This document picks
**`Counterparty.customerId`** (nullable, `@unique`) and drops
`Customer.counterpartyId` entirely — see §9 for the reasoning (it
mirrors the existing `Counterparty.supplierId` shape and matches the
exact wording of `docs/B2B_COUNTERPARTIES.md` §12 open question 1,
which already proposed this direction before this document existed).

No new `LoyaltyCard` model. A dedicated model was one option in the
seeding request ("Новая модель LoyaltyCard (или расширение
Customer)") — rejected in favor of extending `Customer` directly:
`loyaltyCardNumber`/`loyaltyCardQr` are 1:1 with a `Customer` row (a
person doesn't hold multiple cards), there is no independent lifecycle
a separate table would need to model (no card reissue history, no
multi-card-per-customer case in this pass), and every other loyalty
fact already lives directly on `Customer` (`loyaltyPoints`) or keyed
off `customerId` (`LoyaltyTransaction`) — a new join for two more
nullable string columns would be inconsistent with that existing
shape, not an improvement on it. Card **type** (BASIC/SILVER/GOLD, per
the seeding request) is **not** a new field either — it is already
exactly the *tier* concept in §3.3, computed from `totalSpent`, not a
separately stored value. Introducing a second, independently-settable
"card type" alongside the existing computed tier would let the two
disagree with each other for no benefit; §6 uses the existing tier
system as the card's displayed level.

## 5. POS identification flow

```
1. Cashier scans/enters a loyalty card, QR, or phone number.
   → GET /pos/v1/customer?loyaltyCard=XXXX
     or GET /pos/v1/customer?phone=+998901234567
2. Till resolves the Customer row, shows name/points/tier/discount.
3. POST /pos/v1/sale-events includes customerId (§7) — nullable,
   anonymous sale still allowed if no match / cashier skips it.
4. Server accrues points after the sale is confirmed sold (§7's
   accrual-timing gate), same LoyaltyTransaction ledger as §3.3.
```

`GET /pos/v1/customer` is a new endpoint, added to
`apps/api/src/modules/pos-sync/routes.ts` alongside every other
`/pos/v1/*` route, authenticated the same way every one of them already
is — `resolveAuthenticatedDevice()` (defined at
`pos-sync/routes.ts:51`, called by `GET /pos/v1/catalog/snapshot`,
`GET /pos/v1/settings`, and every other device-facing route in that
file) — not a new auth mechanism. Response shape:

```json
{
  "id": "cust_...",
  "name": "...",
  "phone": "+998901234567",
  "loyaltyPoints": 1240,
  "loyaltyLevel": "Silver",
  "discountPercent": null,
  "cardNumber": "SG-000123"
}
```

Lookup is by exact `loyaltyCardNumber` match or `(tenantId, phone)` —
both need the indexes added in §4 (`@@index([tenantId, phone])`,
`@@index([tenantId, loyaltyCardNumber])`); today's `Customer` has
neither, so a phone lookup at POS scale would be a sequential scan.
No match → `404`, same convention as every other not-found response in
this module, not a silent empty object.

**Discount vs. points — one open design choice this section does not
resolve on its own (carried to §12):** the response sketch above has
both `loyaltyPoints` (a balance) and `discountPercent` (seemingly a
flat rate). §3.3's *existing* redemption model has no flat
per-tier discount percentage at all — it converts points to a capped
cash discount at `pointValue` UZS/point, gated by `maxDiscountPct` of
the subtotal. Whether POS gets a *second*, independent discount
mechanism (a flat %, applied without spending points) or simply reuses
the existing points-to-discount conversion the cashier enters
manually is not decided here — `discountPercent` is included in the
response sketch only because the seeding request asked for it, not
because this document has picked a mechanism for it.

## 6. Loyalty program

**Not a new system — see §3.3 for what already exists and runs today
for Sellgram.** This section is what changes to make the *existing*
engine channel-aware rather than implicitly Sellgram-only:

- **Points** — accrual formula (`unitAmount`/`pointsPerUnit`/tier
  `multiplier`) is reused as-is; §7 wires a second call site (POS
  fiscal success) into the same `LoyaltyTransaction`-writing code path
  `order.service.ts` already uses, not a parallel implementation.
- **Discount / redemption** — the existing `pointValue`/
  `maxDiscountPct`/`minPointsToRedeem` mechanism (§3.3) is the one POS
  reuses too, pending §5's open question on whether POS also needs a
  flat-rate variant.
- **Tiers** — the existing tenant-configurable `LoyaltyConfig.tiers`
  (§3.3) is reused unchanged; `computeTier()`
  (`loyalty/routes.ts:35-38`) already takes a plain `totalSpent`
  number, so it needs no channel awareness itself. What *does* need to
  change: `Customer.totalSpent`/`ordersCount` currently only increment
  from Sellgram `COMPLETED` orders (§3.3) — §7 extends that increment
  to POS sales too, so a till-only regular actually reaches Silver/Gold
  the same way a Telegram regular does. Whether B2B order value should
  also count is `docs/B2B_COUNTERPARTIES.md` §12 open question 1's own
  unresolved sub-question, restated (not answered) in §9 below.
- **Applicability across channels** — Telegram: unchanged, exactly
  today's behavior (§3.3). POS: new, §7. B2B: explicitly optional, §9
  — a tenant may choose to keep B2B on its own credit-ledger-only
  system (`docs/B2B_COUNTERPARTIES.md` §7) with no loyalty points at
  all, which is a legitimate, expected configuration, not a gap to
  close.

## 7. POS Sync API additions

Two additive changes to `docs/POS_SYNC_API.md`'s existing contract:

**`GET /pos/v1/customer`** — new endpoint, §5.

**`SaleEvent.customerId`** — new, nullable field on the
`saleEventSchema` Zod object in `pos-sync/routes.ts:116-147` and the
`SaleEvent` Prisma model. Flagged explicitly, same class of mistake
`docs/PRODUCT_TYPES.md` §5 already caught once for `weightBarcode`:
**a Zod `z.object()` schema silently strips any key it doesn't
declare** (no `.passthrough()` on `saleEventSchema` today) — if a POS
device started sending `customerId` in its sale-event payload *before*
this field is added to the schema, it would vanish with no error,
exactly like `weightBarcode` did. This document exists specifically so
that doesn't happen again: the schema field and the Prisma column must
land in the same PR, not schema-first-code-later.

**Accrual timing** — not "after successful fiscalization" in the
vague sense the seeding request used; the existing precedent to copy
is the *stock-derivation* gate already documented in
`pos-sync/routes.ts` (`§11: only SALE_COMPLETED with a completed/
fiscalized status derives stock`) — loyalty accrual for a POS sale
should fire on that exact same condition
(`eventType === 'SALE_COMPLETED' && status ∈ {COMPLETED, FISCALIZED}`),
not on `FISCAL_STARTED` or any earlier, reversible stage. Reuses
`order.service.ts`'s accrual math (§3.3, §6) against
`SaleEvent.payload`'s total instead of `Order.total`, gated the same
way on `loyaltyConfig.isEnabled && customerId != null`.

**`triggeredRuleIds` interaction** — none. Loyalty accrual is
independent of `docs/POS_POLICY_ENGINE.md`'s rule engine and
`docs/PRODUCT_TYPES.md`'s per-type rules; a `BLOCK`-severity rule
already prevents the sale from reaching `SALE_COMPLETED` at all, so
there is no case where a blocked sale needs a separate loyalty-specific
guard.

## 8. Sellgram integration

Current behavior (§3.1, corrected from the seeding request's "at first
order" framing): a `Customer` row is created — not merely used — the
moment someone opens the miniapp with valid Telegram `initData`
(`shop-auth.ts:45`), regardless of whether they ever place an order.

`loyaltyCardNumber` generation follows the **existing** `referralCode`
precedent exactly (`shop-api.ts:257-264`) rather than inventing a new
scheme: lazy, on first access that needs it (`GET /shop/profile` or a
new equivalent), `randomBytes(n).toString('hex').toUpperCase()`,
retried on the (astronomically unlikely) unique-constraint collision.
Distinct prefix/length from `referralCode` so the two are visibly
different identifiers in support conversations, not because of any
technical collision risk between them (they are different columns).

Showing the QR in the bot/miniapp (encoding `loyaltyCardNumber`, or a
signed token derived from it so it isn't just a bare guessable string
scanned by anyone) is a new miniapp screen — no existing precedent to
reuse; `apps/miniapp/src` has no QR-rendering code today
(`grep -rln QR apps/miniapp/src` — no hits).

## 9. B2B integration

**Resolves `docs/B2B_COUNTERPARTIES.md` §12 open question 1.** That
document already sketched the answer ("a future optional, nullable
`Counterparty.customerId` (mirroring the `supplierId` link in shape)")
before this document existed — this section adopts that shape, not a
new one:

```prisma
model Counterparty {
  // ...existing fields unchanged...
  customerId String?  @unique
  customer   Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)
}
```

Same reasoning as the existing `supplierId` bridge
(`docs/B2B_COUNTERPARTIES.md` §5.1): nullable, `@unique` (at most one
`Counterparty` per `Customer`), never required, never backfilled for
existing `Counterparty` rows, one-directional (`Counterparty →
Customer`, no new field on `Customer` itself — this is the correction
noted in §4 against the seeding request's contradictory two-direction
ask).

**Whether a B2B order accrues loyalty points is a per-tenant choice,
not a fixed answer** — §6 already states this; restated here because
it's the actual content of `docs/B2B_COUNTERPARTIES.md` §12's own
unresolved sub-question ("should B2B order value count toward
`totalSpent`/`ordersCount`"). This document does not resolve that
sub-question either — it only makes the *mechanism* possible (the
bridge exists, so *if* a tenant wants B2B value to count, the order-
completion code path in `order.service.ts` has a `Customer` row to
credit via `counterparty.customerId`) without deciding the *policy*
question, which stays open in §12 below, carried over rather than
silently closed.

## 10. Admin surfaces

Already exist, unchanged by this document:

- **Workspace → Клиенты** (`apps/admin/src/pages/Customers.tsx`) —
  list view, already shows `telegramUser`/`telegramId`, `phone`,
  `loyaltyPoints` per row.
- **Loyalty config** (`apps/admin/src/pages/settings/LoyaltyTab.tsx`)
  — tier/points/referral configuration, §3.3.
- **Manual points adjustment** — `POST /customers/:id/loyalty`
  (§3.3), already has an admin-facing action.

New, needed for this document's target state:

- **Manual customer creation.** There is no `POST /customers` today
  (`grep -n "fastify\.\(get\|post\|patch\|delete\)"
  apps/api/src/modules/customer/routes.ts` — only `GET`/`PATCH`/
  `GET :id`/`GET export`/`POST :id/loyalty`, no create). Needed for a
  cashier or manager to register a POS-only buyer who has no Telegram
  account at all — the one gap that makes `telegramId` nullable (§4)
  necessary in the first place, not merely nice-to-have.
- **Cross-channel detail view.** The existing `Customers.tsx` list is
  Sellgram-shaped (columns keyed on `telegramUser`); a detail page
  showing purchase history *across* Sellgram orders, POS sale events,
  and (if bridged, §9) B2B orders for one `Customer` is new — no
  existing screen aggregates across `Order`/`SaleEvent`/B2B `Order`
  rows for a single buyer today.
- **Loyalty card issuance/lookup UI** — assigning/regenerating
  `loyaltyCardNumber` for a customer created through the admin (as
  opposed to the bot's lazy self-generation, §8).

## 11. Migration strategy

- **`telegramId: BigInt → BigInt?`.** Purely additive at the column
  level — every existing row already has a non-null value, so no data
  is lost or needs rewriting. The `@@unique([tenantId, telegramId])`
  constraint's behavior under multiple `NULL`s is *wanted*, not a risk
  to mitigate (§4) — the opposite framing from the same NULL-uniqueness
  gotcha as it applied to `CounterpartyPrice.variantId`
  (`docs/B2B_COUNTERPARTIES.md` §5.2/§12.3), where it needed a partial
  index workaround. No such workaround is needed here.
- **`loyaltyCardNumber` backfill.** Existing `Customer` rows get one
  generated by a one-off script reusing the `referralCode` generation
  pattern (§8) — not required for the feature to work (a `NULL`
  `loyaltyCardNumber` customer simply isn't POS-identifiable by card
  yet, same "unassigned behaves as today" framing
  `docs/PRODUCT_TYPES.md` §9 already used for `Product.productTypeId`),
  so this can run asynchronously after the migration, not as part of
  it.
- **POS-created customers.** No backfill needed — every POS-only
  `Customer` row is new, created going forward only, either by a
  cashier through the new admin create action (§10) or by the till
  itself the first time a phone number with no match is entered
  (mechanism/UX for the latter not decided in this pass — §12).

## 12. Open questions

1. **Phone verification (SMS OTP) at POS registration?** Not decided.
   A `phone` field with no verification is spoofable/typo-prone as an
   identifier (unlike `loyaltyCardNumber`, which the system generates
   itself) — whether that's acceptable for a first version or needs an
   OTP step is a product decision, not resolved here.
2. **Point expiry.** `LoyaltyTxnType.EXPIRE` already exists in the
   enum (§3.3) with zero implementation behind it — pre-existing gap,
   not introduced by this document, but relevant here since a
   cross-channel profile makes "how long is a point good for" a more
   pressing question than it was Sellgram-only.
3. **Merging two profiles of the same person.** If someone registers
   at POS by phone and later opens the Telegram bot (or the reverse),
   two `Customer` rows exist for one real person with no relationship
   between them. No merge mechanism is proposed in this pass — flagged
   as a real gap, not silently assumed away.
4. **Physical card vs. QR-only.** Not decided — `loyaltyCardNumber`
   (§4) works either way (printed on a card, or encoded as text in a
   bot-rendered QR, §8); this document does not commit to issuing
   physical cards.
5. **§5's discount mechanism at POS** — flat `discountPercent` vs.
   reusing the existing points-to-cash-discount conversion (§3.3).
   Not resolved; carried from §5.
6. **Does B2B order value count toward `totalSpent`/tier?**
   `docs/B2B_COUNTERPARTIES.md` §12 open question 1's own unresolved
   sub-question, restated in §9 — the bridge this document adds makes
   it *possible* either way, but does not answer it.

## 13. Implementation order (next session)

1. **`Customer.telegramId` → nullable + `loyaltyCardNumber`/
   `loyaltyCardQr`/`channels[]` + indexes** (§4) — one additive
   migration, no backfill required to ship it.
2. **`GET /pos/v1/customer`** (§5) — new route in
   `apps/api/src/modules/pos-sync/routes.ts`, reusing
   `resolveAuthenticatedDevice()`.
3. **`SaleEvent.customerId`** (§7) — schema column *and*
   `saleEventSchema` Zod field in the same PR, per the explicit
   `weightBarcode`-class warning in §7.
4. **Loyalty accrual for POS** — extend `Customer.totalSpent`/
   `ordersCount`/`loyaltyPoints` increments to the `SALE_COMPLETED` +
   `COMPLETED`/`FISCALIZED` gate (§7), reusing `order.service.ts`'s
   `LoyaltyTransaction`-writing logic rather than duplicating it.
5. **`Counterparty.customerId` bridge** (§9) — one additive,
   `@unique`, nullable column; no backfill.
6. **Admin UI**: `POST /customers` (manual POS-customer creation),
   cross-channel customer detail view (§10).
7. **Sellgram bot**: `loyaltyCardNumber` lazy-generation (mirroring
   `referralCode`, §8) + a QR-display miniapp screen (new, no existing
   precedent).
