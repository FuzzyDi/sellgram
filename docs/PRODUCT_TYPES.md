# Product Types — Architecture Specification

Status: **design only** — no `schema.prisma` changes, no code in this
pass. This document fixes the design for review; implementation is a
separate, later session per §11.

Field/endpoint names below are cross-checked against the current
`packages/prisma/schema.prisma` and `apps/api/src/modules/pos-sync/`
(as of 2026-07-13) — anywhere a name is quoted, it is real, not
hypothetical. See also `docs/POS_POLICY_ENGINE.md` (the rules/severity
engine this document deliberately stays a separate entity from — §2),
`docs/POS_SYNC_API.md` (§9 Catalog snapshot and §10 Settings snapshot,
both of which this document extends), and `docs/B2B_COUNTERPARTIES.md`
(the structural precedent for "design-only, implementation-order-at-
the-end" documents in this repo, which this one and
`docs/POS_POLICY_ENGINE.md` both already follow).

## 1. Purpose

Give SBGCloud a single place to define **what kind of product something
is** — its weighted-goods behavior, its Uzbekistan goods-marking
classification, and the sale-time rules a till should enforce for it
(age check, cash restriction, time-of-day restriction, and so on) —
configured **once per type**, not once per product. Today these facts
live as scattered per-product columns (`Product.markType`,
`Product.isByWeight`, `Product.isWeightedPiece`, `Product.pluCode`) that
a tenant sets by hand on every single product, with no shared definition
of "what ALCOHOL means" that stays consistent across a tenant's whole
catalog, let alone across tenants. A `ProductType` fixes that: assign a
product to `ALCOHOL` once, and every till, for every tenant that uses
that type, applies the same age check and the same time restriction
without either the tenant or the Android team having to hardcode
category-specific logic anywhere.

## 2. Architecture boundary

**`ProductType` is a global entity, not tenant-scoped** — same
"managed centrally, not per-tenant" posture as `PlatformPolicy`
(`docs/POS_POLICY_ENGINE.md` §3.1). A tenant has no write path to a
system type at all: no create, no edit, no delete. A tenant admin's only
interaction with `ProductType` is **assigning an existing type to one of
their own products** (§8).

**Exception — tenant custom types.** A tenant may create its own
`ProductType` row for a case the system types don't cover (e.g. a
regional specialty good with its own sale-time restriction), under two
hard constraints:

- `isSystem` is always `false` for a tenant-created type — only the
  platform team can create `isSystem: true` rows (§7).
- `parentTypeId` is **required**, not optional, for a tenant-created
  type. A tenant type must always be declared as an extension of an
  existing type (system or, transitively, another tenant type) — a
  tenant can refine `ALCOHOL` into `ALCOHOL_CRAFT_BEER`, but cannot
  invent a type with no relationship to the platform's existing
  vocabulary. This keeps every tenant type resolvable to a known root
  type for rule-merging (§4) and for any future platform-wide reporting
  that groups by root type.

**`ProductType` and `PlatformPolicy` remain two separate entities, not
merged into one.** They answer different questions:

- `ProductType.rules` describes what the **till** should do when it
  handles a product of this type — an age check, a cash restriction, a
  time window. This is enforced locally, at sale time, per product.
- `PlatformPolicy` (`docs/POS_POLICY_ENGINE.md` §3.1) describes a
  platform-wide **restriction** independent of any one product — e.g.
  `NO_CASH_FOR_TOBACCO_ALCOHOL`, matched today via
  `PlatformPolicy.match.categorySlugs` against `Category.slug` (schema
  comment on `PlatformPolicy.match`), because a global rule cannot FK to
  any one tenant's `Category` row.

The two are allowed to reference the same **`productTypeCode`** string
(e.g. both a `ProductType` row and a `PlatformPolicy` row can carry
`"ALCOHOL"`) purely so a future platform-wide rule can be written
against product *type* instead of category slug, which is a more
reliable correlation key across tenants than a free-text category name
(schema comment on `PlatformPolicy.match` already flags category-slug
matching as convention-dependent, not guaranteed). This is a shared
vocabulary, not a foreign key — `PlatformPolicy` still has no relation
to `ProductType` in the schema, matching how it already has none to
`Category` today.

## 3. Data model

```prisma
enum WeightMode {
  PIECE
  WEIGHT
  PIECE_WEIGHT
}

// Global, not tenant-scoped (§2) — managed via System Admin. A tenant's
// only write path is assigning an EXISTING type to a Product, or (§2
// exception) creating its own isSystem=false type as a declared
// extension of one.
model ProductType {
  id          String   @id @default(cuid())
  // "STANDARD"/"ALCOHOL"/"TOBACCO"/"WEIGHT_22"/etc. — String, not an
  // enum, so a new type is a row insert through the System Admin UI
  // (§8), not a migration. Same reasoning as PolicySeverity/PolicyScope
  // staying real enums (closed, small, rarely-changing vocabularies)
  // while match/rules stay Json (open-ended) — code here is closer to
  // the latter: the whole point of this model is that the type
  // vocabulary grows without a deploy.
  code        String   @unique
  name        String
  description String?
  // Hierarchy — e.g. ALCOHOL_BEER inherits ALCOHOL's age check and time
  // window (§4). Same self-relation shape as the existing
  // Category.parentId/children pattern (schema.prisma model Category),
  // not a new pattern invented for this model.
  parentTypeId String?
  parentType   ProductType?  @relation("ProductTypeTree", fields: [parentTypeId], references: [id])
  childTypes   ProductType[] @relation("ProductTypeTree")

  weightMode      WeightMode @default(PIECE)
  // One type can cover several scale-printed barcode prefixes — e.g. a
  // single WEIGHT type matching both "22" and "20" if a tenant's scales
  // print either. See §5 for how this is actually matched at sale time.
  barcodePrefixes String[]   @default([])
  // TOBACCO/ALCOHOL/BEER/DRUGS/... — correlates with Product.markType
  // (schema.prisma: "String, not an enum — the classification list can
  // grow without a migration"). Assigning a ProductType writes this
  // value onto Product.markType directly (§3.1 below) — ProductType
  // does not replace that column, it becomes its authoritative source
  // once a type is assigned.
  markType    String?
  // Extensible rule bag — see §4 for the documented shape. Json, not a
  // fixed column per rule, same "shape settles with real usage"
  // reasoning as PlatformPolicy.match/extra (§2) — sale-time rules for
  // goods types are exactly the kind of thing that gains fields as real
  // regulatory/tenant needs surface, not something to lock down now.
  rules       Json       @default("{}")
  // System types (§7) can be disabled but never deleted — isSystem is
  // a delete guard, checked by the System Admin route handler, not a
  // DB constraint (Prisma has no "conditionally immutable row" concept,
  // same limitation noted for Counterparty.taxId in
  // docs/B2B_COUNTERPARTIES.md §5.1).
  isSystem    Boolean    @default(false)
  enabled     Boolean    @default(true)
  sortOrder   Int        @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  products Product[]

  @@index([parentTypeId])
  @@map("product_types")
}
```

### 3.1 `Product` additions

```prisma
model Product {
  // ...existing fields unchanged...

  productTypeId String?
  productType   ProductType? @relation(fields: [productTypeId], references: [id], onDelete: SetNull)
}
```

`productTypeId` is nullable — an unassigned product behaves exactly as
it does today (§9 covers backfilling existing products onto a type).

**Assigning `productTypeId` synchronizes `Product.markType` and
`Product.isByWeight`/`isWeightedPiece` from the type, at write time —
not a live join.** The same denormalization reasoning already applied
to `Product.isMarked` (schema comment: "a till can check one boolean
instead of a null check") applies here one level up: a till reading
`GET /pos/v1/catalog/snapshot` needs `markType`/`isByWeight` inline on
each product row (§6) without the snapshot builder having to join
`ProductType` per product, and without every till on every version
needing to understand the `ProductType` relation at all. The route
handler that sets `productTypeId` (§11 step 3) writes
`markType := ProductType.markType`, `isByWeight := (ProductType.weightMode
!= PIECE)`, `isWeightedPiece := (ProductType.weightMode == PIECE_WEIGHT)`
onto the `Product` row in the same transaction — the same "write the
denormalized copy in the same transaction as the source-of-truth change"
discipline already used for `Counterparty.currentDebt`
(`docs/B2B_COUNTERPARTIES.md` §7) and `PosSettings.staffVersion`
(`docs/POS_POLICY_ENGINE.md` §14.2). If a product's `markType`/
`isByWeight` is later edited **directly** (bypassing `productTypeId`),
that is allowed and does not retroactively change or clear
`productTypeId` — the sync only fires on a `productTypeId` write, it is
not a standing invariant enforced on every product update. Open question
about whether it should be a stronger invariant: §10.

## 4. Rules schema

**Revised after review with the Android team — this replaces the
previous flat-object shape entirely, not an extension of it.**
`ProductType.rules` is a `Json` **array** of explicit rule objects, not
a bag of named booleans. A type can carry any number of independent
rules; an absent `ruleId` simply means that restriction doesn't apply
(the old schema's all-permissive defaults are now just "no rule entry
for that concern," e.g. `STANDARD`'s `rules: []` — §7):

```json
[
  {
    "ruleId": "AGE_CONFIRMATION",
    "severity": "BLOCK",
    "channels": ["POS", "TELEGRAM"],
    "params": { "minAge": 18 }
  },
  {
    "ruleId": "NO_CASH_PAYMENT",
    "severity": "BLOCK",
    "channels": ["POS"]
  },
  {
    "ruleId": "MARKING_REQUIRED",
    "severity": "BLOCK",
    "channels": ["POS", "TELEGRAM"]
  }
]
```

(`ALCOHOL`'s actual seeded rule set, §7 — reused here as the worked
example instead of a synthetic one.)

- `ruleId` — unique **within one type's `rules[]`**, not globally.
  Final vocabulary, all four confirmed with the Android team:
  `AGE_CONFIRMATION`, `NO_CASH_PAYMENT`, `MARKING_REQUIRED`,
  `WEIGHT_REQUIRED` — a string, not an enum, same "grows without a
  migration" reasoning as `ProductType.code` itself (§3). **The list is
  open** — a new rule is a new `ruleId` value and a new entry in some
  type's `rules[]`, never a schema change.
  - `AGE_CONFIRMATION` — require age confirmation. `params: { minAge: N }`.
  - `NO_CASH_PAYMENT` — forbid cash as a tender. POS only — a Telegram
    order is online payment by definition, so there is no cash tender
    to forbid on that channel.
  - `MARKING_REQUIRED` — require scanning a marking code (КМ) before
    the sale completes.
  - `WEIGHT_REQUIRED` — require entering/capturing a weight for this
    line item. POS only — for `WEIGHT`/`PIECE_WEIGHT` goods; Telegram
    has no scale to capture a weight from.

  An earlier revision of this document also listed `TIME_RESTRICTION`,
  `CASH_FORBIDDEN`, `DISCOUNT_FORBIDDEN`, `RETURN_FORBIDDEN`, and
  `MARK_CODE_REQUIRED`. `CASH_FORBIDDEN`/`MARK_CODE_REQUIRED` are
  superseded by `NO_CASH_PAYMENT`/`MARKING_REQUIRED` above (same
  concept, renamed). `DISCOUNT_FORBIDDEN`/`RETURN_FORBIDDEN` are
  dropped — not confirmed with the Android team, not part of any
  seeded type (§7). `TIME_RESTRICTION` is dropped from this pass too —
  not in the confirmed four, not used by any of the seven seed types —
  but unlike the other two, it is not rejected, only deferred: sale-time
  windows are a real, likely-future need, and can be reintroduced later
  as a new `ruleId` (the list being open, per above, means that needs
  no schema change either) once its shape is actually confirmed.
- `severity` — `BLOCK` (the till must not let the sale proceed while
  this rule is unresolved) or `WARN` (shown to the cashier, sale can
  still proceed). Deliberately only two values, narrower than
  `PlatformPolicy`'s five-value `PolicySeverity`
  (`docs/POS_POLICY_ENGINE.md` §3.1) — a `ProductType` rule is a fixed
  per-type default, not a matched platform policy with its own
  escalation ladder. All four confirmed `ruleId`s above are seeded at
  `BLOCK` (§7); nothing about the schema requires that — `WARN` is a
  valid choice for a future rule, just not one any current seed type
  uses.
- `channels` — which sales channel(s) this rule applies to, e.g.
  `["POS"]` for `NO_CASH_PAYMENT`/`WEIGHT_REQUIRED` vs.
  `["POS", "TELEGRAM"]` for `AGE_CONFIRMATION`/`MARKING_REQUIRED` (§10
  item 4 confirms `channels` stays per-rule, not hoisted to
  `ProductType`). Valid values today: `POS`, `TELEGRAM`, matching
  `schema.prisma`'s `SalesChannel` enum values in use for retail sale
  (`SalesChannel` also has `B2B`, not listed as a rule channel yet — a
  B2B order is placed by a tenant-admin operator, not a walk-in buyer,
  and none of the four `ruleId`s above have an obvious B2B analog; left
  for a future revision if one comes up).
- `params` — free-form, per-`ruleId` object. Of the four confirmed
  `ruleId`s, only `AGE_CONFIRMATION` currently has any:
  `{ minAge: number }`. `NO_CASH_PAYMENT`, `MARKING_REQUIRED`, and
  `WEIGHT_REQUIRED` all take `{}` (or an absent `params` key
  entirely, as in the worked example above) — the `ruleId` alone is
  the whole rule for these three.

**Inheritance.** A child type (`parentTypeId` set) inherits its
parent's `rules[]` **in full** — it may *add* a rule whose `ruleId` the
parent doesn't have, and it may *tighten* a `ruleId` it shares with the
parent, but it can never remove or silently drop a parent rule. Same
"a tenant can only tighten, never loosen, a platform rule" invariant
already enforced structurally for `PlatformPolicy`
(`docs/POS_POLICY_ENGINE.md` §7), applied one level down: **when parent
and child both define the same `ruleId` at different severities, the
merged result uses `BLOCK`** — whichever of the two specified it,
`BLOCK` always wins over `WARN` for that `ruleId`. `BEER` (parent
`ALCOHOL`, §7) inherits all three of `ALCOHOL`'s rules
(`AGE_CONFIRMATION`/`NO_CASH_PAYMENT`/`MARKING_REQUIRED`) unchanged and
may append its own additional `ruleId`s without touching `ALCOHOL`'s
row. As before, only one level of inheritance is worked through here by
example; a multi-level `parentTypeId` chain's exact merge order is
still left to the implementation session (§11) to confirm.

## 5. Barcode prefix matching

Till-side resolution order when a scanned barcode does not resolve
through the normal product lookup (consistent with the weight-barcode
decoding problem `docs/POS_SYNC_API.md` §10's `weightBarcode` key was
meant to solve — see the caveat below):

1. **Exact match** against a `barcode` in the catalog snapshot's
   `barcodes[]` array (`docs/POS_SYNC_API.md` §9) → resolve straight to
   that product and use its (already-synced, §3.1) `productTypeCode`.
2. **No exact match** → check the scanned barcode's prefix against every
   `ProductType.barcodePrefixes` entry present in the snapshot (§6).
3. **Prefix match found** → the type is resolved automatically; apply
   that type's `weightMode` and merged `rules` (§4) — this is how a
   till decodes a scale-printed weight barcode into a product/PLU
   without a 1:1 catalog entry for every possible weight value, the
   same problem `weightBarcode` (§10 of the sync contract) was scoped
   to solve.
4. **No prefix match either** → `PRODUCT_BARCODE_NOT_FOUND`, same error
   shape as an unresolved plain barcode today.

**Correction to the premise that this "replaces a temporary
mechanism":** `docs/POS_SYNC_API.md` §10 documents `weightBarcode` as
the *intended* shape for this problem, but its own caveat states
plainly that `weightBarcode` **is not actually persisted today** —
`posSettingsSchema` in `pos-sync/admin-routes.ts` has no
`.passthrough()`, so Zod silently strips any `weightBarcode` key before
it reaches `PosSettings.payload`, and `PosSettings.tsx` has no UI panel
for it either. There is nothing currently working to migrate away from;
`ProductType.barcodePrefixes` is better read as **replacing the plan**
documented at §10 (which was never implemented) rather than replacing a
live mechanism. §9 below reflects this.

### 5.1 Rule evaluation order at the till

Agreed with the Android team as the fixed order a till checks things in
once a product (and therefore its resolved type, if any) is known —
each stage can fail before the next is ever reached:

1. **Baseline till validation** — shift is open, the product is active,
   weight/marking-code capture happens where the resolved type requires
   it. Nothing `ProductType`-specific; this is the till's existing
   pre-sale validation, unchanged by this document.
2. **`productTypeRules`** — the merged, type-derived rule array (§4)
   evaluated as local, product-scoped restrictions.
3. **`PlatformPolicy`/`policies.rules`** — the centralized,
   platform-wide restrictions (`docs/POS_POLICY_ENGINE.md` §3.1),
   evaluated after type rules, not instead of them — a product can be
   blocked by either layer independently, and a platform rule always
   wins if it's stricter (§2/§4).
4. **Payment-sensitive checks repeat at the payment step** — a rule
   whose outcome depends on the tender chosen (`CASH_FORBIDDEN`, or a
   `PlatformPolicy` `PAYMENT`-scope rule) is evaluated again once the
   cashier selects a payment method, not only once at step 2/3 — a sale
   that started as "card, allowed" and pivots to cash mid-transaction
   must not slip through on a check that only ran before the tender was
   chosen.

## 6. `CatalogSnapshot` integration

Each entry in the snapshot's `products[]` array (`docs/POS_SYNC_API.md`
§9; built by `POST /store-admin/pos-devices/catalog-snapshot` in
`apps/api/src/modules/pos-sync/admin-routes.ts`, which today already
selects `vatRate`/`vatExempt`/`markType`/`isMarked`/`mxikCode`/
`packageCode`/`unit`/`isByWeight`/`isWeightedPiece`/`pluCode`/
`pricePerKg` per product) gains four additive fields:

```json
{
  "productTypeCode": "ALCOHOL",
  "productTypeRules": [
    { "ruleId": "AGE_CONFIRMATION", "severity": "BLOCK", "channels": ["POS", "TELEGRAM"], "params": { "minAge": 18 } },
    { "ruleId": "NO_CASH_PAYMENT", "severity": "BLOCK", "channels": ["POS"] },
    { "ruleId": "MARKING_REQUIRED", "severity": "BLOCK", "channels": ["POS", "TELEGRAM"] }
  ],
  "weightMode": "PIECE",
  "barcodePrefixes": []
}
```

- `productTypeCode` — `null` when the product has no `productTypeId`.
  Same "absent means unconfigured" convention as every other optional
  field in this snapshot.
- `productTypeRules` — the **merged rule array** (§4 — array, not
  object, as of the Android-team revision), computed once at
  snapshot-build time so the till never has to walk `parentTypeId`
  itself. `[]` when `productTypeCode` is `null`.
- `weightMode` — sourced from `ProductType.weightMode` when a type is
  assigned; a product with no type falls back to deriving it from the
  existing `Product.isByWeight`/`isWeightedPiece` pair (`PIECE_WEIGHT`
  if `isWeightedPiece`, else `WEIGHT` if `isByWeight`, else `PIECE`) so
  every snapshot row gets a value regardless of migration state (§9).
- `barcodePrefixes` — sourced from `ProductType.barcodePrefixes`; `[]`
  when the product has no type or its type has none configured. This is
  the field §5's step 2 actually matches against, aggregated across
  every distinct type present in the snapshot (not per-product — a till
  needs the full prefix table once per snapshot, not repeated per row;
  the exact top-level placement, e.g. a sibling `productTypes[]` array
  alongside `categories`/`products`/`barcodes`/`uzProfiles` vs. inline
  per-product duplication, is left open for §11 step 4 to settle against
  real snapshot-size constraints).

**`storeTimezone`.** Not tied to any one rule's own `params.timezone` —
a store needs a timezone default independent of whether any current
rule uses one. Resolved with the Android team as an additive field on
`GET /pos/v1/settings`'s response (`docs/POS_SYNC_API.md` §10), at the
top level of the `settings` object (a sibling of `taxProfile`/
`paymentMethods`/etc., not nested inside any one rule):
`"storeTimezone": "Asia/Tashkent"`. A future rule with its own
`params.timezone` (§4 — e.g. a reintroduced `TIME_RESTRICTION`, deferred
for now) would override `storeTimezone` when present; `storeTimezone`
is what such a rule falls back to when it omits `timezone`, and what
any till-side check with no specific rule context (e.g. §5.1 step 1's
baseline validation) uses by default today. This is a change to the
`POS_SYNC_API.md` §10 contract tracked here; implementing it is listed
under §11.

### 6.1 Triggered rule id namespace

`triggeredRuleIds` (`SaleEvent`/`FiscalEvent`'s additive
policy-engine fields — `docs/POS_POLICY_ENGINE.md` §8) records which
rule(s) fired for a given sale/fiscal event. With two independent rule
sources now feeding it — a type's own `rules[]` (§4) and
`PlatformPolicy` (`docs/POS_POLICY_ENGINE.md` §3.1) — a bare `ruleId`
or `PlatformPolicy.id` is no longer enough for Cloud-side audit to tell
which system a triggered id came from. Agreed namespace, a colon-
prefixed source tag on every entry:

- `productType:AGE_CONFIRMATION` — a rule from a product's resolved
  `ProductType.rules[]` (the `ruleId` value itself, §4).
- `policy:NO_CASH_FOR_TOBACCO_ALCOHOL` — a rule from `PlatformPolicy`
  (an application-level code for the policy, not literally
  `PlatformPolicy.id`, which is an opaque cuid unsuitable for a
  human-readable audit trail).

This is purely an event-logging convention — it does not change how
either rule source is evaluated or merged (§4, §5.1), only how Cloud
labels the outcome once a sale/fiscal event reports it.

## 7. Predefined system types (seed)

Seven `isSystem: true` rows, seeded the same way
`packages/prisma/seed-platform-policies.ts` seeds the tobacco/alcohol
`PlatformPolicy` row — find-then-create/update by natural key (`code`
here, `(scope, severity)` there), safe to run repeatedly, not a Prisma
`upsert` since `code`'s `@unique` didn't exist until this migration
lands:

| `code` | `parentTypeId` | `weightMode` | `barcodePrefixes` | `markType` | `rules[]` |
|---|---|---|---|---|---|
| `STANDARD` | — | `PIECE` | `[]` | — | `[]` |
| `ALCOHOL` | — | `PIECE` | `[]` | `ALCOHOL` | `AGE_CONFIRMATION` (BLOCK, POS+TELEGRAM, minAge 18); `NO_CASH_PAYMENT` (BLOCK, POS); `MARKING_REQUIRED` (BLOCK, POS+TELEGRAM) |
| `TOBACCO` | — | `PIECE` | `[]` | `TOBACCO` | same three as `ALCOHOL`: `AGE_CONFIRMATION` (BLOCK, POS+TELEGRAM, minAge 18); `NO_CASH_PAYMENT` (BLOCK, POS); `MARKING_REQUIRED` (BLOCK, POS+TELEGRAM) |
| `BEER` | `ALCOHOL` | `PIECE` | `[]` | `BEER` | `[]` of its own — inherits all three of `ALCOHOL`'s rules unchanged (§4) |
| `WEIGHT` | — | `WEIGHT` | `["22"]` | — | `WEIGHT_REQUIRED` (BLOCK, POS) |
| `PIECE_WEIGHT` | — | `PIECE_WEIGHT` | `["23"]` | — | `WEIGHT_REQUIRED` (BLOCK, POS) |
| `DRUGS` | — | `PIECE` | `[]` | `DRUGS` | `MARKING_REQUIRED` (BLOCK, POS+TELEGRAM) |

Final values agreed with the Android team for all seven types — no
inference or carry-over left in this table (superseding the previous
revision's caveat that only `ALCOHOL` had been confirmed).

`STANDARD` is listed explicitly (not left implicit as "no type
assigned") so a tenant can deliberately assign it — distinguishing "this
product is ordinary, on purpose" from "this product has never been
classified" (`productTypeId: null`), which matters once §9's backfill
question ("should every product eventually have a type") is settled.

## 8. Admin surfaces

- **System Admin** — full CRUD over every `ProductType` row, including
  creating new global (`isSystem: true`) types. Same screen shape and
  same protection (`system-admin` JWT auth, not tenant `permissionGuard`)
  as the existing `PlatformPolicy` CRUD screen
  (`apps/admin/src/pages/sys/SysPolicies.tsx` +
  `apps/api/src/modules/system-admin/policy-routes.ts`) — a
  `ProductType` screen is the direct sibling of that one, not a new
  pattern.
- **Tenant admin** — no CRUD at all. The only surface is a `ProductType`
  `Select` in the product form (`apps/admin/src/pages/products/
  ProductForm.tsx`), alongside the existing category `Select` — pick a
  type, the sync described in §3.1 happens server-side on save.
- **Tenant custom types** (§2 exception) — created via a tenant-admin
  API endpoint distinct from the System Admin CRUD routes (so
  `permissionGuard`-protected, not `system-admin`-JWT-protected), which
  enforces `isSystem: false` and a required `parentTypeId` server-side
  regardless of what the request body claims — the same "server decides
  the trust-sensitive fields, client input for them is ignored or
  rejected" posture already used for `PosDevice` activation and other
  tenant-facing writes.

## 9. Migration strategy

- **Existing marked products.** `Product.markType = 'TOBACCO'` (and
  similarly for `'ALCOHOL'`/`'BEER'`/`'DRUGS'`, if present) can be
  backfilled to the matching seeded type's `productTypeId` by an
  optional script, mirroring the read-only, explicitly-optional framing
  of `docs/POS_POLICY_ENGINE.md` §13 step 5 ("not required for steps 1–4
  to function"). Not required for the feature to work — an unassigned
  product with `markType` already set keeps behaving exactly as it does
  today; the backfill only adds the `ProductType` benefits (shared rule
  updates, §1) retroactively.
- **Existing weighted products.** `Product.isByWeight = true` (with
  `isWeightedPiece` distinguishing `WEIGHT` vs. `PIECE_WEIGHT`) can be
  backfilled to `productTypeId` pointing at the matching seeded type by
  the same optional script.
- **`weightBarcode` in `PosSettings`.** Per §5's correction, there is no
  live `weightBarcode` mechanism to keep running "temporarily" — it was
  never persisted. This migration strategy simply means the intended
  `weightBarcode` schema change flagged in `docs/POS_SYNC_API.md` §10
  ("needs both a schema change... and a ninth panel in
  `PosSettings.tsx` — neither done here") is superseded: implement
  `ProductType.barcodePrefixes` instead of ever finishing that key.

## 10. Open questions

1. **Age confirmation on Sellgram, or POS only? Resolved.** Rules are
   now channel-aware via `channels[]` (§4) instead of applying
   uniformly wherever evaluated — `AGE_CONFIRMATION` explicitly lists
   `["POS", "TELEGRAM"]` in the worked example (§4, §7), so a product
   sold through the Sellgram Telegram/miniapp channel gets the same age
   gate as POS by putting `TELEGRAM` in that rule's `channels[]`,
   opted into per-rule rather than assumed. Where exactly in Sellgram's
   checkout flow that confirmation happens is still an implementation
   detail for §11, not an open design question anymore.
2. **Time-limited sales — server clock or device clock? Resolved.**
   Local store time — `storeTimezone` on `GET /pos/v1/settings` (§6) is
   the store-level default the till applies for any time-of-day check,
   keeping it evaluable while a device is offline (consistent with
   offline-first operation, `docs/POS_SYNC_API.md` §16) rather than
   depending on a server round-trip at the moment of sale. A specific
   `TIME_RESTRICTION`-style `ruleId` for sale-time windows is deferred,
   not part of the confirmed vocabulary (§4) or any seeded type (§7) —
   `storeTimezone` exists now regardless, ready for such a rule to
   resolve against once one is actually added.
3. **Are tenant custom types visible in the catalog snapshot the same
   way system types are?** §6 does not distinguish `isSystem` when
   describing `productTypeCode`/`productTypeRules` — presumably a
   tenant custom type flows through identically (a till has no reason to
   treat it differently), but this document does not explicitly confirm
   that, nor whether a `productTypeCode` naming collision between two
   different tenants' custom types (both, say, choosing `"CRAFT_BEER"`)
   is possible given `code` is globally `@unique` — it would need
   tenant-scoped uniqueness instead, or a server-generated/prefixed
   `code` for tenant-created types, which §3 does not currently specify.
4. **Channels per-rule vs. per-type? Resolved.** `channels` stays a
   per-`rule` field (§4), not hoisted to the `ProductType` level — the
   till filters `productTypeRules` down to entries whose `channels`
   includes `"POS"` before applying any of them, rather than a type
   being POS-only or Telegram-only as a whole. This is what already
   lets a single type mix rules with different channel scopes (§7's
   `ALCOHOL`: `AGE_CONFIRMATION`/`MARKING_REQUIRED` apply on both
   channels, `NO_CASH_PAYMENT` is POS-only) — confirming it here closes
   any remaining ambiguity about whether that was intentional or an
   artifact of the worked example.

## 11. Implementation order (next session)

1. **`ProductType` model + `WeightMode` enum + migration** — new table,
   fully additive; `Product.productTypeId` added in the same or a
   follow-up migration (§3/§3.1).
2. **Seed the seven system types** (§7) — a script following
   `seed-platform-policies.ts`'s find-then-create/update-by-natural-key
   pattern, run once `code`'s uniqueness constraint exists.
3. **`Product.productTypeId` write path + `markType`/`isByWeight`/
   `isWeightedPiece` sync** (§3.1) — the product-update route handler
   (`apps/api/src/modules/product/routes.ts`) writes the denormalized
   fields in the same transaction as `productTypeId`, the same
   discipline already used for `Counterparty.currentDebt` and
   `PosSettings.staffVersion`.
4. **`CatalogSnapshot` integration** (§6) — extend the snapshot builder
   in `apps/api/src/modules/pos-sync/admin-routes.ts` with
   `productTypeCode`/`productTypeRules`/`weightMode`/`barcodePrefixes`,
   settling the open placement question (per-product vs. a shared
   `productTypes[]` table) noted in §6.
5. **System Admin UI** — `ProductType` CRUD screen, sibling of
   `apps/admin/src/pages/sys/SysPolicies.tsx` (same protection, same
   list/edit-modal shape).
6. **Tenant admin: type `Select` in the product form** —
   `apps/admin/src/pages/products/ProductForm.tsx`, alongside the
   existing category `Select` (§8).
7. **Backfill existing products** (§9) — optional script, not a
   blocker for steps 1–6, assigning `productTypeId` to already-marked
   and already-weighted products retroactively.
