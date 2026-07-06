# POS Policy Engine — Architecture Specification

Status: **design only** — no `schema.prisma` changes, no code in this
pass. Agreed with the SBG Lite POS Android team; implementation is a
separate, later session per §13.

Field/endpoint names below are cross-checked against the current
`packages/prisma/schema.prisma` and
`apps/api/src/modules/pos-sync/routes.ts` (as of 2026-07-06) — anywhere a
name is quoted, it is real, not hypothetical. See also
`docs/POS_SYNC_API.md` (the contract this document extends — specifically
§10 Settings snapshot, whose response shape this document changes) and
`docs/B2B_COUNTERPARTIES.md` (the most recent precedent for
"design-only, implementation-order-at-the-end" documents in this repo).

## 1. Purpose

Give SBGCloud a way to enforce **business rules** on POS sales/refunds/
shifts/payments/etc — both platform-wide (e.g. "no cash payment for
tobacco/alcohol" as required by Uzbekistan regulation) and per-tenant
(e.g. "discounts over 20% need manager approval") — without touching
device firmware or physical hardware configuration, and without a
till ever being blocked by a rule it can't yet fetch (offline-first, per
`docs/POS_SYNC_API.md` §16).

## 2. Architecture boundary — hardware vs. business policy

**Cloud never sees or manages physical hardware configuration.** This
stays entirely on the device (Local POS Core), unconditionally:
printer IP/port, connection type (USB/network/Bluetooth), the local URL
of `SbgHardwareCoreService`, barcode scanner mode/prefix/suffix,
hardware self-diagnostics. None of this is part of this document, and
none of it should ever appear in a future `PlatformPolicy` or
`PosSettings` row — if a future engineer is tempted to add a printer IP
field to either model, that's a sign this boundary has been crossed.

**Cloud manages business *policy* about printing behavior** — not the
printer itself, but what the till is supposed to *do*:

- `autoPrintReceipt` — print automatically on sale completion vs. only
  on demand.
- `requirePrintSuccess` — whether a failed print blocks completing the
  sale or is a soft failure.
- `printCopies.sale` / `printCopies.refund` / `printCopies.zReport` —
  how many copies of each receipt type to print.
- `printOfdQr` — whether the OFD/fiscal QR code is printed on the
  receipt.
- `printBarcode` — whether a barcode is printed on the receipt.
- `allowReprint` — whether reprinting a past receipt is allowed at all.
- `reprintRequiresManager` — if reprinting is allowed, whether it needs
  manager authorization.
- `receiptPaperWidth`, `receiptLanguage`, `printerCodepage` — these are
  **preferred/default** values from Cloud; the physical device may
  override them locally (e.g. a device with a narrower printer than the
  store's usual model). Cloud states a preference, never a hardware
  fact.

These are business decisions a tenant (or the platform, for
regulation-driven ones) makes, independent of which physical printer
model happens to be plugged into a given till.

## 3. Data model

### 3.1 `PlatformPolicy` (new, proposed — not yet migrated)

Deliberately **not** tenant-scoped — global to the whole platform,
versioned independently of any tenant, managed centrally by the SBGCloud
team (see §11, future System Admin screen). One row per rule, matching
the unified Rule schema (§4) so a `PlatformPolicy` row and a tenant rule
object have the same shape once merged (§6):

```prisma
enum PolicyScope {
  SALE
  REFUND
  SHIFT
  PAYMENT
  MARKING
  DISCOUNT
  CASHIER
  PRINT
}

enum PolicySeverity {
  BLOCK
  WARN
  REQUIRE_MANAGER
  REQUIRE_ACTION
  INFO
}

model PlatformPolicy {
  id        String         @id @default(cuid())
  scope     PolicyScope
  severity  PolicySeverity
  enabled   Boolean        @default(true)
  // Scope-specific matcher — e.g. { "categorySlugs": ["tobacco","alcohol"] }
  // for a MARKING/PAYMENT rule. Deliberately Json, not a fixed column per
  // possible matcher field: the real shape needed per scope will only
  // settle once the Android team implements matching against real
  // categories/products, same reasoning as pos-sync's
  // rawFiscalPayload/rawDaemonResponse staying unconstrained until usage
  // settles the shape (docs/POS_SYNC_API.md §12).
  match     Json
  message   Json           // { "ru": string, "uz": string } — shown to the cashier
  // Scope-specific fields that don't fit `match` (e.g. PAYMENT rules'
  // denyPayments: string[]) — same "loose bag" reasoning as `match`.
  extra     Json?
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@index([scope])
  @@map("platform_policies")
}

// Global version counter — same "atomic cached counter, bumped in the
// same transaction as the underlying write" pattern already used for
// Counterparty.currentDebt/CounterpartyLedger (docs/B2B_COUNTERPARTIES.md
// §7) and applyStockDelta()/StockLedgerEntry (pos-sync/routes.ts) — just
// applied to a global counter instead of a per-row one. "Singleton" here
// is an application-level convention (code always reads/writes the one
// row with a well-known id via upsert), not a database-enforced
// constraint — Postgres has no native "exactly one row" constraint, and
// adding one (e.g. a unique boolean trick) would be over-engineering for
// what's fundamentally one counter.
model PlatformPolicyVersion {
  id      String @id @default(cuid())
  version Int    @default(1)

  @@map("platform_policy_version")
}
```

### 3.2 `PosSettings` — current shape, additive changes

Current model (unchanged fields kept exactly as-is):

```prisma
model PosSettings {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  storeId   String   @unique
  store     Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  version   Int      @default(1)
  payload   Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId])
  @@map("pos_settings")
}
```

`version`/`payload` are **not renamed** — purely additive, no risk to the
already-deployed `GET /pos/v1/settings`/`PUT /store-admin/pos-devices/
settings` code paths. `version` is simply what the API response below
now calls `settingsVersion`; `payload` is what it calls `settings` — same
storage, new API-level names. Four new columns, all with safe defaults:

```prisma
model PosSettings {
  // ...existing fields above, unchanged...

  policiesVersion       Int  @default(1)
  // Tenant-authored rule objects ONLY (§4 shape) — platform rules are
  // never stored here, always sourced from PlatformPolicy at request
  // time (§6). A tenant literally has no write path to PlatformPolicy
  // rows (different table, different admin surface, different
  // permission) — this is the first of two guarantees that a tenant
  // cannot weaken a platform rule; see §6 for the second.
  tenantPolicyRules     Json @default("[]")
  printTemplatesVersion Int  @default(1)
  // Print business-policy fields from §2 — despite the name (kept for
  // consistency with the versioned-block naming the Android team agreed
  // to), this is not markup templates, it's the autoPrintReceipt/
  // printCopies/etc. field set.
  printTemplates        Json @default("{}")
}
```

## 4. Rule schema

One unified shape for every rule, regardless of `source` or `scope` —
not a separate schema per category:

```typescript
type Rule = {
  id: string;
  scope: 'SALE' | 'REFUND' | 'SHIFT' | 'PAYMENT' | 'MARKING' | 'DISCOUNT' | 'CASHIER' | 'PRINT';
  source: 'PLATFORM' | 'TENANT';
  severity: 'BLOCK' | 'WARN' | 'REQUIRE_MANAGER' | 'REQUIRE_ACTION' | 'INFO';
  enabled: boolean;
  match: Record<string, unknown>;   // scope-specific, see §3.1
  message: { ru: string; uz: string };
  // Scope-specific extra fields live alongside these, not nested further
  // — e.g. a PAYMENT-scope rule carries its own top-level
  // `denyPayments: string[]`, not `extra: { denyPayments: [...] }`. The
  // `extra` Json column in §3.1 is a *storage* detail (how PlatformPolicy
  // persists them); the *wire* shape flattens them onto the rule object
  // itself, same flattening `PosSettings.tenantPolicyRules` array
  // elements use.
  [scopeSpecificField: string]: unknown;
};
```

### Severity values — exact till behavior

| Severity | Till behavior |
|---|---|
| `BLOCK` | Physically cannot complete the action. No override, no bypass. |
| `WARN` | Shows a warning, lets the cashier continue. The fact that it fired is logged locally and reported to Cloud (§7). |
| `REQUIRE_MANAGER` | Blocks until a manager authorizes. Once authorized, continues and records `managerOverride` on the resulting sale/fiscal event (§7). |
| `REQUIRE_ACTION` | Cannot continue until the cashier performs a specific corrective action (scan the marking code, choose a different payment method, enter a return reason, etc.). No bypass. |
| `INFO` | Never blocks — a hint only. |

**First implementation phase (Android team): `BLOCK` and `WARN` only.**
`REQUIRE_MANAGER`, `REQUIRE_ACTION`, and `INFO` are part of this contract
now so the rule shape and severity enum don't need to change later, but
the till does not need to implement their behavior yet.

### Severity strictness ranking (for §6's merge logic)

Not explicitly specified in the original design conversation — proposed
here, flagged in §12 as worth Android-team confirmation before
implementation, since "tenant may only tighten, never loosen" (§6) needs
a total order to be computable at all:

```
BLOCK  >  REQUIRE_ACTION  >  REQUIRE_MANAGER  >  WARN  >  INFO
(strictest)                                          (least strict)
```

Reasoning: `BLOCK` admits no path forward at all. `REQUIRE_ACTION` also
admits no path forward without a corrective action, but that action is
normally *compliance*, not a bypass — stricter than `REQUIRE_MANAGER`,
whose entire mechanism *is* a sanctioned bypass (an authorized person
overriding the restriction). `WARN` can be dismissed by the same cashier
who triggered it, unilaterally — the weakest real friction.  `INFO` never
blocks at all.

## 5. Versioning — independent per block

Three independent version counters, each bumped only when its own block
changes — a till caches and refreshes each block on its own schedule,
never re-pulling the whole document for a change to just one part:

- **`settingsVersion`** — `PosSettings.version` (unchanged mechanism —
  bumped today by `PUT /store-admin/pos-devices/settings`,
  `{ version: { increment: 1 } }`).
- **`policiesVersion`** — a *computed* value, not a single stored column:
  `PlatformPolicyVersion.version + PosSettings.policiesVersion`. Both
  addends are independently monotonically increasing (versions only ever
  increment), so their sum is too — a simple, honest combinator, not a
  vector clock. The till doesn't need to know *which* side changed, only
  that *something* in `policies` did, which means "re-fetch the merged
  `policies.rules` array."
- **`printTemplatesVersion`** — `PosSettings.printTemplatesVersion`, same
  bump-on-write mechanism as `settingsVersion`.

## 6. `GET /pos/v1/settings` — new response shape

**This changes the existing, already-deployed contract**
(`docs/POS_SYNC_API.md` §10) — today's response is `{ version, checksum,
settings }`. The new shape drops the single `checksum`/`version` pair
entirely in favor of three independent version integers and two new
sibling blocks:

```json
{
  "success": true,
  "data": {
    "settingsVersion": 1,
    "policiesVersion": 4,
    "printTemplatesVersion": 1,
    "settings": {
      "taxProfile": {},
      "paymentMethods": [],
      "receiptTemplate": {},
      "printerProfile": {},
      "fiscalProfile": {},
      "offlineLimits": {},
      "roundingRules": {},
      "featureFlags": {}
    },
    "policies": {
      "rules": [
        {
          "id": "plt_no_cash_tobacco_alcohol",
          "scope": "PAYMENT",
          "source": "PLATFORM",
          "severity": "BLOCK",
          "enabled": true,
          "match": { "categorySlugs": ["tobacco", "alcohol"] },
          "denyPayments": ["CASH"],
          "message": {
            "ru": "Табак и алкоголь нельзя продавать за наличные",
            "uz": "Tamaki va alkogolni naqd pulga sotib bo'lmaydi"
          }
        },
        {
          "id": "cly_discount_over_20pct",
          "scope": "DISCOUNT",
          "source": "TENANT",
          "severity": "REQUIRE_MANAGER",
          "enabled": true,
          "match": { "discountPercentAbove": 20 },
          "message": {
            "ru": "Скидка выше 20% требует подтверждения менеджера",
            "uz": "20% dan yuqori chegirma menejer tasdig'ini talab qiladi"
          }
        }
      ]
    },
    "printTemplates": {
      "autoPrintReceipt": true,
      "requirePrintSuccess": false,
      "printCopies": { "sale": 1, "refund": 1, "zReport": 2 },
      "printOfdQr": true,
      "printBarcode": false,
      "allowReprint": true,
      "reprintRequiresManager": false,
      "receiptPaperWidth": 58,
      "receiptLanguage": "ru",
      "printerCodepage": "CP866"
    }
  },
  "requestId": "string"
}
```

`settings`/`printTemplates` unconfigured-store defaults follow the same
existing convention as today's eight-key document (§10 of
`docs/POS_SYNC_API.md`): empty/default body, version `1`, not an error.
An unconfigured store's `policies.rules` is never empty in practice —
enabled `PlatformPolicy` rows are always included regardless of tenant
configuration (§7).

## 7. Merge logic

The server's job is **concatenation, not reconciliation**:

```
policies.rules = [...enabled PlatformPolicy rows (source: PLATFORM)]
               ++ [...enabled PosSettings.tenantPolicyRules (source: TENANT)]
```

No rule-by-rule comparison happens server-side. Both guarantees that
"tenant can only tighten, never loosen a platform rule" holds are
structural, not computed:

1. **Access control**: a tenant has no write path to `PlatformPolicy`
   rows at all — different table, different (future) admin surface,
   different permission. A tenant cannot disable, edit, or shadow a
   platform rule by ID.
2. **Till-side evaluation**: for a given transaction, the till gathers
   every rule (from *either* source) whose `match` applies, and enforces
   the single **strictest** severity found among them (§4's ranking) —
   not "whichever rule is more specific" or "whichever was added last."
   A co-existing tenant rule with a *weaker* severity for the same/
   overlapping match can never reduce the effective outcome below what
   the platform rule alone would produce, because the till takes the
   max, not an override.

This also explains why `triggeredRuleIds` (§8) is an array: multiple
rules — platform and tenant, `BLOCK` and `WARN` alike — can match the
same transaction simultaneously; the till reports all of them, not just
the one whose severity ultimately governed the outcome.

`enabled: false` rows (either source) are filtered out server-side
before the response is built — a disabled rule is never sent to a till
at all, not sent-but-ignored.

## 8. Integration with sale/fiscal events

Additive fields on the existing request bodies for
`POST /pos/v1/sale-events` (`saleEventSchema`) and
`POST /pos/v1/fiscal-events` (`fiscalEventSchema`) —
and the same additive fields on the underlying `SaleEvent`/`FiscalEvent`
Prisma models, which currently have no policy-related columns at all:

- **`policiesVersion`** (number, required) — the `policiesVersion` the
  till was operating under at the moment of the sale/fiscal action. Lets
  Cloud reconstruct after the fact *which* rule set was active, even if
  it has since changed.
- **`triggeredRuleIds`** (string array, required, may be empty) — every
  rule id that matched this transaction, at minimum for `BLOCK`/`WARN`
  severities (the two implemented in the till's first phase, §4).
- **`managerOverride`** (object, optional) — present only if a
  `REQUIRE_MANAGER` rule was overridden. Shape not fully pinned down in
  this pass (not needed until that severity is actually implemented) —
  expect at minimum a manager identifier and a timestamp.

## 9. Offline behavior

Same offline-first philosophy as `docs/POS_SYNC_API.md` §16, applied to
policy specifically:

- **With a previously-synced policy set**: the till operates on the
  **last successfully applied `policiesVersion`** while offline,
  unconditionally — a policy check must never block a sale on a policy
  fetch it cannot currently make, exactly like catalog/settings already
  work.
- **With no policy set at all yet** (first run, never synced) — this is
  entirely **till-side (Local POS Core) behavior**; Cloud has no role in
  it and this document doesn't change anything Cloud does, but the
  expectation needs to be written down so both sides build against the
  same assumption:
  - **dev/test environment**: allow the sale, show a warning.
  - **production environment**: either (a) block the regulated
    categories entirely until a policy set is obtained, or (b) fall back
    to a minimal baked-in set of platform rules shipped with the app
    itself (e.g. the tobacco/alcohol cash rule, since that's a legal
    requirement, not a business preference). Which of (a)/(b) the
    Android team implements is their call — this document only requires
    that *some* documented, deliberate behavior exists for this case,
    not "whatever the code happens to do."

## 10. Print policy fields — full list

(Repeated from §2 for a single point of reference; these are the
contents of the `printTemplates` block in §6, not `policies.rules`
entries — they're plain configuration values, not match/severity rule
objects.)

| Field | Type | Meaning |
|---|---|---|
| `autoPrintReceipt` | boolean | Print automatically on sale completion vs. on demand only. |
| `requirePrintSuccess` | boolean | Whether a failed print blocks completing the sale. |
| `printCopies.sale` | integer | Copies printed per sale receipt. |
| `printCopies.refund` | integer | Copies printed per refund receipt. |
| `printCopies.zReport` | integer | Copies printed per Z-report. |
| `printOfdQr` | boolean | Print the OFD/fiscal QR code on the receipt. |
| `printBarcode` | boolean | Print a barcode on the receipt. |
| `allowReprint` | boolean | Whether reprinting a past receipt is allowed at all. |
| `reprintRequiresManager` | boolean | If reprinting is allowed, whether it needs manager auth. |
| `receiptPaperWidth` | integer | Preferred/default paper width (mm). Device may override. |
| `receiptLanguage` | string | Preferred/default receipt language. Device may override. |
| `printerCodepage` | string | Preferred/default printer codepage. Device may override. |

## 11. Admin surface (future, not built now)

A future System Admin (`/system-admin`, cross-tenant superadmin console —
`docs/ADMIN_REDESIGN.md` §9 explicitly keeps this structurally separate
from the tenant-facing admin) screen, "Платформенные политики" /
"Platform Policies," for SBGCloud staff to CRUD `PlatformPolicy` rows —
create/edit/disable a rule, see which tenants it's live for (all of
them, always, being global). Tenant-side, a future tenant-admin screen
for managing their own `PosSettings.tenantPolicyRules` similarly belongs
under the B2B/POS-adjacent admin work (`docs/ADMIN_REDESIGN.md` §3's POS
channel section), not built in this pass either.

## 12. Open questions

1. **Severity strictness ranking** (§4) — proposed here
   (`BLOCK > REQUIRE_ACTION > REQUIRE_MANAGER > WARN > INFO`), not
   something the original design conversation with the Android team
   pinned down explicitly. Needs their confirmation before
   `REQUIRE_ACTION`/`REQUIRE_MANAGER` are actually implemented (`BLOCK`/
   `WARN` don't need a ranking against each other or against the
   unimplemented severities yet, since only one of them can be the
   *strictest* present in practice during phase one).
2. **`managerOverride` shape** (§8) — deliberately not fully specified,
   since `REQUIRE_MANAGER` isn't part of the till's first implementation
   phase. Needs its own design pass once that severity is actually
   scheduled.
3. **`match` field shapes per scope** (§3.1/§4) — deliberately left as
   loose `Json` for the same reason `rawFiscalPayload` stayed
   unconstrained until the real fiscal contract settled it
   (`docs/POS_SYNC_API.md` §12). The tobacco/alcohol example
   (`categorySlugs`) is illustrative, not a commitment to that exact key
   name — needs to be pinned down against real `Category`/`Product` data
   once the first platform rule is actually implemented.
4. **Tenant-side admin UI for `tenantPolicyRules`** — no validation
   strategy discussed for preventing a tenant from creating a
   *nonsensical* rule (e.g. `match: {}` matching everything). Not a
   "can they weaken platform rules" problem (§7 already prevents that
   structurally) — a distinct "can they misconfigure their own rules"
   problem, deferred to whenever that admin screen is actually built.
5. **`printTemplates` naming** (§3.2/§6) — the block holds print
   *policy* fields, not print *templates* in the literal sense (receipt
   markup/layout). Kept as agreed with the Android team for this pass;
   worth a naming reconsideration (e.g. `printPolicy`) before or during
   implementation if it causes confusion.

## 13. Recommended implementation order for next session

1. **`PlatformPolicy` + `PlatformPolicyVersion` models, migration** —
   new tables, fully additive. Seed the tobacco/alcohol `PAYMENT` rule
   (§3.1 example) as the first real platform rule once `match`'s shape
   for that case is settled (§12 item 3).
2. **`PosSettings` additive columns** (§3.2) — `policiesVersion`,
   `tenantPolicyRules`, `printTemplatesVersion`, `printTemplates`. Same
   migration or a separate one; no data backfill needed (all new,
   defaulted).
3. **Merge logic in `GET /pos/v1/settings`** (§6/§7) — the concatenation
   described in §7, computing `policiesVersion` as the sum described in
   §5. This is the point where the existing, deployed response shape
   actually changes — coordinate the exact release timing with the
   Android team the same way the dual-header auth rollout was
   coordinated (`docs/POS_SYNC_API.md` §22's now-resolved history is the
   precedent for how carefully that kind of change needs to land).
4. **Additive fields on `SaleEvent`/`FiscalEvent`** (§8) —
   `policiesVersion`, `triggeredRuleIds`, `managerOverride` — and the
   corresponding zod schema changes in `pos-sync/routes.ts`
   (`saleEventSchema`, `fiscalEventSchema`).
5. **System Admin screen for `PlatformPolicy`** (§11) — a separate,
   later step; not required for steps 1-4 to function (rules can be
   seeded directly for the first platform rule).
