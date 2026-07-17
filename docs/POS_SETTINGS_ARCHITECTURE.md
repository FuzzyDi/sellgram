# POS Settings Architecture — Three-Layer Configuration

Status: **design only** — no `schema.prisma` changes, no code in this
pass. This document fixes the design for review; implementation is a
separate, later session per §9.

Field/endpoint names below are cross-checked against the current
`packages/prisma/schema.prisma` and `apps/api/src/modules/pos-sync/`
(as of 2026-07-17) — anywhere a name is quoted, it is real, not
hypothetical. See also `docs/POS_SYNC_API.md` (§10 Settings snapshot,
which this document restructures, and §23.1, the one real store's
settings this document uses as its worked "today" example) and
`docs/PRODUCT_TYPES.md` (the structural precedent for "design-only,
implementation-order-at-the-end" documents in this repo, which this one
follows).

## 1. Purpose

Today, every store-level POS setting — tax rates, receipt layout,
**payment methods**, **printer wiring**, offline limits, cash rounding,
feature flags — lives in one place: `PosSettings.payload`, a single
free-form `Json` column holding an eight-key document (`taxProfile`,
`paymentMethods`, `receiptTemplate`, `printerProfile`, `fiscalProfile`,
`offlineLimits`, `roundingRules`, `featureFlags` — `docs/POS_SYNC_API.md`
§10, `packages/prisma/schema.prisma` model `PosSettings`). It is
store-scoped only: one document per `storeId` (`PosSettings.storeId
@unique`), edited as raw JSON in `apps/admin/src/pages/pos/PosSettings.tsx`
(a flat, single-page form — no tabs today, see §8), and shipped whole to
every device at that store via `GET /pos/v1/settings`
(`apps/api/src/modules/pos-sync/routes.ts:1049`).

This does not scale past a single device, single payment setup per
store:

- **`paymentMethods` is a flat `string[]`** (`docs/POS_SYNC_API.md`
  §23.1 shows a real example: `["CASH", "CARD", "QR_PAYME", "QR_CLICK",
  "QR_STATIC_MANUAL", "BANK_TRANSFER"]`) — a list of labels, not
  configuration. There is nowhere to put a UzQR terminal's `apiKey`, a
  card pinpad's serial port, or a second QR provider used only as a
  backup. Every till at a store gets the exact same list, with no way to
  disable a payment method on one broken terminal without disabling it
  everywhere.
- **`printerProfile` is one object for the whole store**
  (`docs/POS_SYNC_API.md` §23.1: `{ type, paperWidth, charset, override,
  note }`), but a printer is physically attached to one device, not one
  store — a store with three tills and three different printer models
  has no way to express that today.
- Both problems are made worse by **`weightBarcode`**, a key
  `docs/POS_SYNC_API.md` §10 already documents as intended but which
  `posSettingsSchema` (`apps/api/src/modules/pos-sync/admin-routes.ts`)
  silently strips (`z.object()` with no `.passthrough()`) — the eight-key
  shape is already at capacity for "things that don't actually belong at
  store scope, crammed in because there was nowhere else to put them"
  (§10 item 3 returns to this).

This document introduces two new entities — `PaymentTerminal` (§3) and
`PosDeviceSettings` (§6) — that give payment configuration and hardware
configuration their own scoped, structured homes, and leaves
`PosSettings` holding only what is genuinely store-wide.

## 2. Configuration layers

Three levels, ordered broad to narrow. **Layers 1 and 2 already exist
and are not being redesigned here** — this document's job is entirely
about splitting Layer 2's overloaded payload and introducing Layer 3.

**Layer 1 — Platform (global, cross-tenant).** `PlatformPolicy`
(`docs/POS_POLICY_ENGINE.md` §3.1) and `ProductType`
(`docs/PRODUCT_TYPES.md` §3) — the latter itself design-only per that
document's own status line, not yet implemented either, but already
specified and out of scope here. Nothing in this document touches
either model.

**Layer 2 — Store settings (tenant-scoped, one row per store).** The
existing `PosSettings` model, **kept**, but narrowed. After this
document's changes it holds exactly five of its current eight keys:
`taxProfile`, `receiptTemplate`, `offlineLimits`, `roundingRules`,
`featureFlags`. `paymentMethods` moves to `PaymentTerminal` (§3);
`printerProfile` moves to `PosDeviceSettings` (§6). `fiscalProfile` is
**not** addressed by this document — it stays in `PosSettings` for now;
splitting it further depends on the still-unconfirmed fiscal
integration partner (`docs/POS_SYNC_API.md` §10's own caveat), which is
out of scope here. The model's row shape, its independent version
counters (`policiesVersion`/`printTemplatesVersion`/`staffVersion`,
`docs/POS_POLICY_ENGINE.md` §3.2/§13/§14), and the `PosSettings` name
itself are all unchanged — the "rename to `StoreSettings`" mentioned in
the brief for this document is a **conceptual** relabeling only (Layer 2
= what `PosSettings` is), not a proposed migration to rename the table
or the Prisma model. Renaming a live model for a label change alone is
not worth the churn; nothing elsewhere in this document depends on the
model actually being renamed.

**Layer 3 — Device settings (device-scoped, one row per device).**
Entirely new: `PosDeviceSettings` (§6), one-to-one with `PosDevice`
(same shape as the existing `PosDevice.syncCursor SyncCursor?`
one-to-one relation — `packages/prisma/schema.prisma:1381` — not a new
relation pattern for this schema). Holds `printerProfile` (moved from
Layer 2) plus four fields with **no existing storage anywhere today**:
`scannerProfile`, `pinPadProfile`, `weightScaleProfile`,
`displayProfile` — all net-new, not a migration of something that
already worked. Who writes this layer: a technical admin through the
admin UI (§8), or, for fields a device can determine on its own (e.g. a
scanner model it already detected), the device self-reporting them —
this document does not specify a self-report endpoint; it is flagged as
a real possibility, not designed here.

## 3. `PaymentTerminal` model (new)

```prisma
model PaymentTerminal {
  id       String  @id @default(cuid())
  tenantId String
  tenant   Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  storeId  String
  store    Store   @relation(fields: [storeId], references: [id], onDelete: Cascade)
  // Nullable — null means this row is a store-level default, applying to
  // every device at storeId that has no device-level override for the
  // same `type` (§4's merge logic). Set means this row overrides the
  // store-level default for one specific till only.
  deviceId String?
  device   PosDevice? @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  // CASH / CARD_PINPAD / QR_UZQR / QR_PAYME / QR_CLICK / QR_STATIC /
  // BANK_TRANSFER — String, not an enum, same "grows without a
  // migration" reasoning as ProductType.code (docs/PRODUCT_TYPES.md §3)
  // and every other open-vocabulary field in this schema.
  type      String
  name      String
  enabled   Boolean  @default(true)
  sortOrder Int      @default(0)
  // Provider-specific — shape depends on `type` (§3.2). Same
  // "structure settles with real usage" treatment as
  // PlatformPolicy.match/extra and ProductType.rules.
  config    Json     @default("{}")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([storeId, enabled])
  @@index([deviceId])
  @@map("payment_terminals")
}
```

**Resolved 2026-07-17, agreed with the Android team (§10 item 2 no
longer open):** `PaymentTerminal` is store-scoped by default with an
optional device-level override, not purely store-scoped as this
document originally specified. A store-level row (`deviceId: null`)
applies to every device at that store; a device-level row (`deviceId`
set) overrides the store-level row of the same `type` for that one till
only. Cloud resolves this into a single flat object per device before
the till ever sees it — the till performs no merge logic of its own
(§4). `PosDevice` needs the matching back-relation,
`paymentTerminals PaymentTerminal[]`, for this explicit relation to be
schema-valid — same requirement §6 already notes for
`PosDeviceSettings`.

### 3.1 Boundary with `StorePaymentMethod`

**`PaymentTerminal` and the existing `StorePaymentMethod`
(`packages/prisma/schema.prisma:1164`) are two separate entities, not
merged into one and not a replacement of one by the other** — same
"looks similar, answers a different question" situation
`docs/PRODUCT_TYPES.md` §2 already documents for `ProductType` vs.
`PlatformPolicy`:

- `StorePaymentMethod` is **Sellgram Commerce's** payment method list —
  what a customer picks at Telegram/miniapp checkout
  (`orders Order[] @relation("OrderToStorePaymentMethod")` on the model
  itself). It is managed today at `apps/admin/src/pages/PaymentMethods.tsx`
  (route `/payments`, **not** under `/pos/*`), keyed by a
  `PaymentProvider` enum (`CASH | MANUAL_TRANSFER | TELEGRAM | CLICK |
  PAYME | UZUM | STRIPE | CUSTOM`) that has no `QR_UZQR` or
  `CARD_PINPAD` value at all — it was never meant to describe till
  hardware.
- `PaymentTerminal` is **POS's** payment method list — what a cashier can
  tap at the till, config-heavy (an API key, a serial port), no
  relationship to an `Order` row.

The two are not linked by any relation in this document — a store using
both Sellgram Commerce checkout and a physical till configures its
payment options twice, once per surface, same as it already configures
`Product` catalog data once per surface conceptually differs from `Order`
data. Unifying them is not proposed here; `docs/POS_SYNC_API.md` §10's
own text ("`paymentMethods` should be expected to correlate with
`StorePaymentMethod`... but that mapping is not yet defined") already
flagged this as unresolved before this document — this document resolves
it by **not** attempting the correlation, choosing a POS-only model
instead.

### 3.2 `config` shapes by `type`

Two shapes given here as the concrete cases from the brief for this
document; the `type` vocabulary itself is open (§3), so this is not an
exhaustive list — a new `type` value can define its own `config` shape
without a schema change, the same open-endedness `ProductType.rules`
already has (`docs/PRODUCT_TYPES.md` §4).

**`QR_UZQR`:**

```json
{
  "url": "https://uzqr.uz",
  "tin": "<store TIN/STIR>",
  "apiKey": "<secret — see §5>",
  "connectTimeoutSeconds": 3,
  "responseTimeoutSeconds": 10,
  "retryCount": 5
}
```

**`CARD_PINPAD`:**

```json
{
  "protocol": "NEXGO" | "PAX" | "INGENICO",
  "port": "/dev/ttyUSB0",
  "baudRate": 9600,
  "timeout": 30
}
```

Neither shape is enforced by a Zod schema in this document — like
`ProductType.rules` and `PlatformPolicy.match`/`extra`, `config` is
`Json` with the shape convention documented, not database- or
API-validated per `type`. Whether it should be (a discriminated Zod
union keyed on `type`) is left to the implementation session (§9).

## 4. `GET /pos/v1/settings` — updated contract

**Entirely new, additive response block** — nothing in
`apps/api/src/modules/pos-sync/routes.ts:1049`'s current handler builds
this today; `settings.paymentMethods` (the flat string array, §1) is all
that exists right now.

```json
{
  "settings": {
    "paymentProviders": {
      "uzQr": {
        "enabled": true,
        "url": "https://uzqr.uz",
        "tin": "123456789",
        "apiKey": "***",
        "connectTimeoutSeconds": 3,
        "responseTimeoutSeconds": 10,
        "retryCount": 5,
        "scope": "STORE",
        "terminalId": "...",
        "terminalName": "...",
        "terminalCode": "...",
        "externalDeviceId": "..."
      },
      "cardPinpad": {
        "enabled": false
      }
    }
  }
}
```

`settings.paymentProviders` is keyed by a camelCase alias of
`PaymentTerminal.type` (`uzQr` for `QR_UZQR`, `cardPinpad` for
`CARD_PINPAD`), one entry per **enabled** terminal **resolved for this
device**, built by the route handler from `PaymentTerminal` rows at
request time — not a stored column anywhere; same "computed at read
time from a normalized table" approach `GET /pos/v1/settings` already
uses for `policies.rules` (merging `PlatformPolicy` +
`PosSettings.tenantPolicyRules`, `routes.ts:1124`-`1157`) and `staff`
(from `PosOperator` rows, `routes.ts:1164`-`1187`).

**Store/device merge — resolved 2026-07-17, agreed with the Android
team.** The till performs no merge of its own; `GET /pos/v1/settings`
already contains the final, resolved result for the requesting device.
The route handler builds it in this fixed order:

1. Fetch store-level `PaymentTerminal` rows for the requesting device's
   `storeId` (`deviceId IS NULL`).
2. Fetch device-level `PaymentTerminal` rows for the requesting device
   (`deviceId` = the authenticated device's id, §3).
3. For each `type` present in both sets, the device-level row wins —
   its `config`/`enabled`/`name` fully replace the store-level row's,
   not a field-by-field merge of the two.
4. The combined, per-type result becomes `settings.paymentProviders` —
   one flat object, keyed by type, with no trace of which layer each
   entry came from except the `scope` field below.

`scope` — `"STORE"` or `"DEVICE"` — added to every entry in
`paymentProviders` so a debugging admin (or the Android team) can tell
which layer a given device's active configuration actually came from,
without needing a separate admin-UI lookup. `terminalId`/
`terminalName`/`terminalCode`/`externalDeviceId` are the resolved
`PaymentTerminal` row's own identity, included **optionally** — present
when the underlying provider integration needs a stable id to bind
against on its own side (e.g. a UzQR terminal registered under a
specific `terminalCode` with the provider); not every `type` needs
them, and no `type`'s `config` shape (§3.2) requires them today.

**`apiKey` is sent to the device unmasked** (§5) — the `"***"` in the
example above stands for "a real secret value," not a literal masking
convention on the wire; masking is an **admin-UI-only** concern (§5,
§8).

**Android alias support.** Per the brief for this document, the
SBG Lite POS Android client already accepts several key-name aliases
per field (`url`/`baseUrl`/`apiUrl`, `tin`/`inn`/`stir`/`taxId`,
`apiKey`/`api_key`/`API_key`/`key`, `connectTimeoutSeconds`,
`responseTimeoutSeconds`/`readTimeoutSeconds`,
`retryCount`/`requestRetries`/`retries`/`attempts`). **This document
cannot verify that claim** — it describes Android-side code this repo
does not contain — and takes it as given, same as every other
"confirmed with the Android team" fact `docs/PRODUCT_TYPES.md` cites
without the underlying client source. The practical consequence for
Cloud: emitting the single canonical key name per field shown above
(`url`, `tin`, `apiKey`, `connectTimeoutSeconds`,
`responseTimeoutSeconds`, `retryCount`) is sufficient — Cloud does not
need to emit every alias itself, only one that the alias list confirms
Android already understands. If that confirmation turns out to be
wrong for a given field, the fix is additive (emit two keys for that
field), not a breaking change.

**Backward compatibility.** `settings.paymentMethods` (the existing flat
array) and `settings.paymentProviders` (this section) are sent
**simultaneously**, not one replacing the other, until Android's
migration to reading `paymentProviders` is confirmed (§7, §9 step 7).

## 5. Security — `apiKey` handling

- **At rest:** `PaymentTerminal.config` stores `apiKey` (and any other
  provider secret) as plain JSON today, in this design — "encrypted at
  rest via Postgres" is listed as **TBD**, not decided (§10 item 1). A
  real, already-shipping precedent exists for encrypting a comparably
  sensitive value in this codebase: `apps/api/src/lib/encrypt.ts`
  (AES-256-GCM, key from `getConfig().ENCRYPTION_KEY`) already encrypts
  `Store.botToken` before it is written
  (`apps/api/src/modules/store/service.ts:39,87`) and decrypts it only
  where needed (`service.ts:118,218`; `bot/shop-auth.ts:37`;
  `bot-manager.ts:137`). That mechanism is the natural one to reuse for
  `PaymentTerminal.config.apiKey` — but `botToken` is a single `String`
  column, and `config` is `Json` with `apiKey` as one key among several
  non-secret ones (`url`, `tin`, timeouts) — encrypting the whole JSON
  blob would make every non-secret field opaque too (breaking, e.g.,
  admin-UI display of `url`/`tin`/timeouts without a decrypt round
  trip), while encrypting only the `apiKey` field within the JSON is a
  new pattern this codebase does not have an existing precedent for.
  Left open (§10 item 1) rather than designed here.
- **On the wire to the device:** sent **in full**, unmasked, in `GET
  /pos/v1/settings` (§4) — the till genuinely needs the working key to
  call the payment provider itself; there is no server-side proxy for
  these calls today or proposed here.
- **Never included in:**
  - **Logs.** Fastify's logger must have `apiKey` (and provider secrets
    generally) redacted — this repo does not yet have a redaction rule
    for this specific key; adding one is implementation work (§9), not
    done by this document.
  - **Admin panel display.** Shown as `••••••` with a **Copy** button —
    same masked-with-explicit-reveal-action shape as
    `PosOperator.pinHashSha256`/`pinSalt` never being echoed back to the
    admin UI at all (`apps/admin/src/pages/pos/PosOperators.tsx`'s form
    never prefills `pin`, per that component's own comment) — except
    here the admin needs to be able to retrieve the working value (to
    hand it to a payment provider's support line, for instance), hence
    **Copy**, not "write-only." This repo has no existing masked-secret
    UI component to point to as precedent; building one is new work
    (§9).
  - **System diagnostics.** Any future device-diagnostics surface
    (`DEV_DIAGNOSTICS` is already a real `PosOperator` permission,
    `apps/admin/src/pages/pos/pos-shared.tsx`'s
    `POS_OPERATOR_PERMISSIONS`, but nothing consumes it yet) must
    exclude `PaymentTerminal.config` secrets from whatever it reports.
  - **Error messages.** A failed payment-provider call must not echo
    `apiKey` back in its error text to the till's local log or any
    Cloud-side error report.

## 6. `PosDeviceSettings` model (new)

```prisma
model PosDeviceSettings {
  id        String    @id @default(cuid())
  deviceId  String    @unique
  device    PosDevice @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  printer   Json?
  scanner   Json?
  pinPad    Json?
  scale     Json?
  display   Json?
  updatedAt DateTime  @updatedAt
  @@map("pos_device_settings")
}
```

One-to-one with `PosDevice`, `onDelete: Cascade` — same shape as the
existing `SyncCursor` (`packages/prisma/schema.prisma:1922`:
`deviceId String @unique` + `device PosDevice @relation(...)`), not a
new relational pattern. `PosDevice` gains the matching back-relation,
`posDeviceSettings PosDeviceSettings?`, alongside its existing
`syncCursor SyncCursor?` and the rest of its `*[]` event back-relations
(`packages/prisma/schema.prisma:1380`-`1387`).

Every field is nullable and independently optional — a device with no
scanner attached simply has `scanner: null`, same "absent means
unconfigured" convention `docs/PRODUCT_TYPES.md` §6 already uses for
`productTypeCode`. `printer` inherits the exact shape `printerProfile`
already has at `PosSettings` today (`docs/POS_SYNC_API.md` §23.1: `type`,
`paperWidth`, `charset`, `override`, `note`) — moving house, not
changing shape. `scanner`/`pinPad`/`scale`/`display` have **no existing
shape anywhere** to inherit — their internal structure is left
unspecified here, same "shape settles with real usage" treatment
`docs/POS_SYNC_API.md` §10 already applies to `taxProfile`/
`receiptTemplate`/`fiscalProfile`.

`GET /pos/v1/settings` would need a new field to carry this to the
device — not specified here since the exact placement (top-level
sibling of `settings`, or nested inside it) is not settled; noted as
implementation work (§9 step 5), not a design gap left silently.

## 7. Migration strategy

Per-key disposition of the current `PosSettings.payload` eight keys:

| Key | Disposition |
|---|---|
| `taxProfile` | Stays in `PosSettings`. |
| `receiptTemplate` | Stays in `PosSettings`. |
| `paymentMethods` (`string[]`) | Migrates to `PaymentTerminal` — one row created per currently-enabled method, `enabled: true`, `config: {}` (no provider secrets exist to carry over, since none were ever stored — §1). `type` is derived from the string value as-is (`"CASH"` → `type: "CASH"`, `"QR_PAYME"` → `type: "QR_PAYME"`, etc. — no renaming). |
| `printerProfile` | Migrates to `PosDeviceSettings.printer` — **ambiguous which device** when a store has more than one till, since `printerProfile` today has no device association at all (§1). For a single-device store the mapping is unambiguous; for multi-device stores this needs either an admin picking a target device per store during migration, or copying the same value to every device at that store as a starting point the admin then differentiates by hand. Not resolved here — flagged for the implementation session (§9 step 5). |
| `fiscalProfile` | Stays in `PosSettings` (§2 — out of scope, blocked on the fiscal integration partner). |
| `offlineLimits` | Stays in `PosSettings`. |
| `roundingRules` | Stays in `PosSettings`. |
| `featureFlags` | Stays in `PosSettings`. |

**Backward compatibility.** `GET /pos/v1/settings` continues to emit
`settings.paymentMethods` (old flat-array shape) **in parallel with**
`settings.paymentProviders` (§4) until Android's read-side migration to
the new block is confirmed complete — this document does not remove
`paymentMethods` from the response at any point; that removal is
`§9` step 7, explicitly gated on that confirmation, not on this
document's implementation landing.

## 8. Admin UI changes

**Today, `apps/admin/src/pages/pos/PosSettings.tsx` is a single flat
page** — eight sequential raw-JSON edit panels (`SETTINGS_FIELDS` array
in that file), no tabs, no sub-navigation within the page itself (only
the store-level `PosSubNav` shared across all `/pos/*` screens,
`apps/admin/src/pages/pos/pos-shared.tsx`). This document proposes
splitting that single page into three tabs:

- **"Общие"** — what remains of the eight-key form after §7's split:
  `taxProfile`, `receiptTemplate`, `offlineLimits`, `roundingRules`,
  `featureFlags` (`fiscalProfile` too, per §2, since it stays in
  `PosSettings` — the brief for this document does not list it under
  any tab explicitly; it belongs here by elimination). Same raw-JSON
  panel style the current page already uses — this document does not
  propose replacing that with structured fields, only relocating which
  keys appear on this particular tab.
- **"Способы оплаты"** — `PaymentTerminal` list for the selected store,
  one form per entry keyed by `type` (§3.2's two documented shapes are
  the two concrete forms to build first), `apiKey` masked per §5. New
  screen; no existing file to extend.
- **"Оборудование"** — `PosDeviceSettings` for a selected device within
  the store (a device picker, similar in spirit to `PosReceipts.tsx`'s
  existing device filter `Select`, `apps/admin/src/pages/pos/PosReceipts.tsx`
  — printer/scanner/pin-pad/scale panels). New screen; no existing file
  to extend.

Neither new screen has a route yet — `apps/admin/src/App.tsx`'s
`/pos/*` routes today are `analytics`, `devices`, `operators`,
`shifts`, `receipts`, `operator-events`, `settings` (seven, all already
implemented); this document proposes reorganizing what lives at
`/pos/settings` into tabs rather than adding new top-level routes, so
`PosSubNav`'s "Настройки" entry (`pos-shared.tsx`'s `POS_TABS`) would
open a page with its own internal tab-switcher, not three new
`POS_TABS` entries.

## 9. Implementation order

1. **`PaymentTerminal` model + migration** (§3) — new table, fully
   additive.
2. **Seed:** create `PaymentTerminal` rows from each store's existing
   `PosSettings.payload.paymentMethods[]` (§7's per-key table) — a
   script following the same find-then-create/update-by-natural-key
   discipline `packages/prisma/seed-platform-policies.ts` and
   `docs/PRODUCT_TYPES.md` §11 step 2 both already use, run first
   against Demo Store Tashkent (`docs/POS_SYNC_API.md` §23 — the one
   store this repo already treats as its real, verified reference
   config) before any wider rollout.
3. **`GET /pos/v1/settings`:** add `settings.paymentProviders` (§4),
   sent alongside the existing `settings.paymentMethods` — no removal.
4. **Admin UI:** "Способы оплаты" tab (§8) — `PaymentTerminal` CRUD,
   `apiKey` masking (§5) built as part of this step, not deferred past
   it (a payment-config screen that ships without masking is not an
   acceptable intermediate state).
5. **`PosDeviceSettings` model + migration** (§6), including settling
   this document's two open placement questions before writing code:
   where the device-settings block lives in the `GET /pos/v1/settings`
   response (§6), and how `printerProfile`'s per-store-not-per-device
   migration ambiguity (§7) is actually resolved for existing
   multi-device stores.
6. **Admin UI:** "Оборудование" tab (§8) — `PosDeviceSettings` per
   selected device.
7. **Deprecate `settings.paymentMethods[]`** from the `GET
   /pos/v1/settings` response, only after explicit confirmation from
   the Android team that the SBG Lite POS client has fully switched to
   reading `settings.paymentProviders` — this step has no target date
   in this document because that confirmation has not happened yet.

## 10. Open questions

1. **Encryption at rest for `apiKey`/secrets in `PaymentTerminal.config`?**
   Not decided. §5 identifies a working precedent
   (`apps/api/src/lib/encrypt.ts`, already used for `Store.botToken`)
   but also the real complication specific to this case: `botToken` is
   a whole `String` column, while `apiKey` is one key inside a `Json`
   blob that also holds non-secret fields (`url`, `tin`, timeouts) an
   admin UI needs to display without decrypting anything. Whether the
   answer is "encrypt the whole `config` blob and accept the display
   cost," "encrypt just the secret-shaped keys within it," or "rely on
   Postgres-level encryption at rest and leave the column itself
   plaintext" is left to the implementation session.
2. **Device-scoped `PaymentTerminal`: resolved — agreed with the
   Android team 2026-07-17.** `deviceId` is nullable on
   `PaymentTerminal` (§3): `null` is a store-level default, set is a
   device-level override. Cloud performs the merge (store default +
   device override, device wins per `type`) server-side before the till
   ever sees it — `GET /pos/v1/settings` already contains the resolved
   result (§4); the till does no merge logic of its own. A `scope`
   field (`"STORE"` | `"DEVICE"`) on each entry in
   `settings.paymentProviders` shows which layer that entry's active
   configuration came from (§4).
3. **Does `weightBarcode` (`docs/POS_SYNC_API.md` §10 — never actually
   persisted, per that section's own caveat and `docs/PRODUCT_TYPES.md`
   §5's confirmation) belong in `PosDeviceSettings` (as part of
   `scannerProfile`/`scale`, since decoding a scale-printed barcode is
   a hardware-specific concern) or stay a `PosSettings`-level,
   store-wide convention (since a store's scale-barcode format
   convention is typically the same across every till at that store,
   unlike a printer's physical wiring)?** Further complicated by
   `docs/PRODUCT_TYPES.md` §5/§9, which already proposes **superseding**
   `weightBarcode` entirely with `ProductType.barcodePrefixes` rather
   than ever finishing it — if that document's plan proceeds,
   `weightBarcode` may never need a home in this one at all. Both
   documents leave this open; neither commits to implementing
   `weightBarcode` as its own key anywhere.
