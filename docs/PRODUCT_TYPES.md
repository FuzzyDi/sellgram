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

`ProductType.rules` is a `Json` object, not a fixed set of columns.
Documented shape (all keys optional; a key absent has the same meaning
as its documented default, mirroring `PlatformPolicy.match`'s "loose bag"
convention):

```json
{
  "ageConfirmation": false,
  "minAge": 18,
  "discountAllowed": true,
  "returnAllowed": true,
  "requireMarkCode": false,
  "cashAllowed": true,
  "timeLimited": false,
  "timeFrom": "09:00",
  "timeTo": "23:00",
  "requireManagerApproval": false,
  "customFlags": {}
}
```

- `ageConfirmation` — the till must prompt the cashier to confirm the
  buyer's age before completing the sale.
- `minAge` — the age threshold to confirm against; only meaningful when
  `ageConfirmation` is `true`.
- `discountAllowed` — whether a discount can be applied to a line item
  of this type at all (e.g. `WEIGHT`'s seed default is `false` — §7).
- `returnAllowed` — whether a refund/return is permitted for this type.
- `requireMarkCode` — the till must scan a marking code (КМ) before the
  sale completes, independent of `Product.isMarked`/`markType` — a type
  can require the scan as a *sale-time* rule even for goods whose
  marking status is otherwise informational only.
- `cashAllowed` — whether cash is an acceptable payment method for this
  type. This is a per-type, till-enforced default; it does **not**
  replace `PlatformPolicy`'s `PAYMENT`-scope, platform-wide cash bans
  (§2) — a tenant could in principle set `cashAllowed: true` on their
  own custom type while a `PlatformPolicy` row still blocks cash for the
  matching category/type, since `PlatformPolicy` always wins (a tenant
  can only tighten, never loosen, a platform rule —
  `docs/POS_POLICY_ENGINE.md` §7).
- `timeLimited` / `timeFrom` / `timeTo` — restrict the hours during
  which this type can be sold at all (e.g. `ALCOHOL`'s seed default,
  §7). `timeFrom`/`timeTo` are only meaningful when `timeLimited` is
  `true`. See §10 for the open question on server time vs. device time.
- `requireManagerApproval` — the sale needs a manager's confirmation
  before completing, independent of any specific `PlatformPolicy`
  `REQUIRE_MANAGER` severity rule (`docs/POS_POLICY_ENGINE.md` §3.1) —
  a type-level default rather than a matched platform rule.
- `customFlags` — an open bag for tenant- or future-specific flags that
  don't yet warrant a named key, same purpose as `PosSettings.payload
  .featureFlags` (`docs/POS_SYNC_API.md` §10).

**Inheritance.** A type with a `parentTypeId` does not repeat its
parent's rules — the till (or, server-side, the catalog snapshot
builder, §6) computes the **merged** rule object: parent's `rules` as
the base, overlaid with the child's own `rules` keys (a key present on
the child always wins; a key the child omits falls through to the
parent's value; a key present on neither falls through to the
documented default above). `BEER` (parent `ALCOHOL`, §7) inherits
`ageConfirmation`/`minAge`/`timeLimited`/`timeFrom`/`timeTo` from
`ALCOHOL` without repeating them, and can still override any one of
those keys, or add its own, without touching `ALCOHOL`'s row. Only one
level of inheritance is described here (child overlays parent); nothing
in the data model caps `parentTypeId` chains to one level, but multi-
level merge order (grandparent → parent → child) is left to the
implementation session (§11) to confirm against a real multi-level type
before committing to a precise merge algorithm.

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
  "productTypeRules": { "ageConfirmation": true, "minAge": 18, "timeLimited": true, "timeFrom": "09:00", "timeTo": "23:00" },
  "weightMode": "PIECE",
  "barcodePrefixes": []
}
```

- `productTypeCode` — `null` when the product has no `productTypeId`.
  Same "absent means unconfigured" convention as every other optional
  field in this snapshot.
- `productTypeRules` — the **merged** rule object (§4), computed once at
  snapshot-build time so the till never has to walk `parentTypeId`
  itself. `{}` when `productTypeCode` is `null`.
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

## 7. Predefined system types (seed)

Seven `isSystem: true` rows, seeded the same way
`packages/prisma/seed-platform-policies.ts` seeds the tobacco/alcohol
`PlatformPolicy` row — find-then-create/update by natural key (`code`
here, `(scope, severity)` there), safe to run repeatedly, not a Prisma
`upsert` since `code`'s `@unique` didn't exist until this migration
lands:

| `code` | `parentTypeId` | `weightMode` | `barcodePrefixes` | `markType` | notable `rules` |
|---|---|---|---|---|---|
| `STANDARD` | — | `PIECE` | `[]` | — | all defaults (§4) — the type an unassigned/ordinary product effectively behaves as |
| `ALCOHOL` | — | `PIECE` | `[]` | `ALCOHOL` | `ageConfirmation: true, minAge: 18, timeLimited: true, timeFrom: "09:00", timeTo: "23:00"` |
| `TOBACCO` | — | `PIECE` | `[]` | `TOBACCO` | `ageConfirmation: true, minAge: 18` |
| `BEER` | `ALCOHOL` | `PIECE` | `[]` | `BEER` | none of its own — inherits age/time from `ALCOHOL` (§4) |
| `WEIGHT` | — | `WEIGHT` | `["22"]` | — | `discountAllowed: false` |
| `PIECE_WEIGHT` | — | `PIECE_WEIGHT` | `["23"]` | — | all defaults |
| `DRUGS` | — | `PIECE` | `[]` | `DRUGS` | `requireMarkCode: true` |

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

1. **Age confirmation on Sellgram, or POS only?** `ageConfirmation`
   (§4) is framed as a till-side prompt throughout this document. Does
   an `ALCOHOL`/`TOBACCO` product sold through the Sellgram
   Telegram/miniapp channel need the same confirmation, and if so, at
   what point in that channel's checkout flow — a question this
   document does not resolve, since Sellgram order flow has no
   equivalent of a cashier prompt today.
2. **Time-limited sales — server clock or device clock?** `timeFrom`/
   `timeTo` (§4) assume *a* clock; whether the till evaluates against
   its own local time (consistent with offline-first operation,
   `docs/POS_SYNC_API.md` §16, since a device may be offline exactly
   when a time check matters) or a server-issued time (more resistant
   to a till's clock being wrong or deliberately altered) is unresolved.
   Local-device time is the more consistent choice given the existing
   offline-first posture, but the regulatory stakes of getting an
   alcohol/tobacco time restriction wrong argue for server time —
   needs a decision, not just a default, before `timeLimited` ships.
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
