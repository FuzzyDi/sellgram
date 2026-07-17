# POS Sync API — Contract Specification

> This is a **contract document**, not an implementation guide. It defines
> the wire format between **SBGCloud** (this repository — the cloud
> backoffice/control plane) and **SBG Lite POS** (a separate repository — the
> local, offline-first till software). Both sides implement this contract
> independently, in whatever language/stack each repository uses. Nothing in
> this document requires the two codebases to share a build, a package
> manager, or a git history.
>
> Related reading: `docs/SBGCLOUD_ARCHITECTURE.md` (why this boundary
> exists), `apps/api/src/modules/pos-sync/` (the current, partial server
> implementation — see §21 for exactly how far it diverges from this spec).

---

## 1. Purpose

SBGCloud and SBG Lite POS are two independently deployable systems that
must cooperate without either one depending on the other being reachable at
the moment a customer is at the register. This document is the single
source of truth for:

- which HTTP endpoints exist, their request/response shapes, and their
  status codes;
- how a physical device authenticates itself, once and repeatedly;
- how events survive a POS being offline for hours or days without being
  lost or double-counted when it reconnects;
- what SBGCloud is *not* allowed to do, so that a future contributor on
  either side does not accidentally reintroduce a hard dependency on the
  network for an in-store sale.

The governing principle, stated plainly:

> **SBGCloud manages. SBG Lite POS sells.**
> **A cloud outage must not stop a local sale.**

## 2. Architecture boundary

These are hard constraints on this contract, not suggestions:

- SBGCloud is not the fiscal cash register.
- SBGCloud does not perform local sale.
- SBGCloud does not call fiscal module.
- SBGCloud does not print receipts.
- Local POS Core owns sale transaction, fiscalization, printing, local
  recovery and durable outbox.
- POS sends events to Cloud **after** local state is durable — never before,
  never as a precondition of completing a sale.
- Cloud stores projections and analytics.
- Cloud sends snapshots/settings/commands to POS.

A consequence that follows directly from these constraints: every endpoint
in this document is either (a) something a POS device *pulls* when it has
connectivity (catalog, settings, commands) or (b) something a POS device
*pushes* after the fact, describing something that has already happened
locally and durably (sale/fiscal/shift/stock events, heartbeat). There is no
endpoint in this contract that a POS device must call *before* it is allowed
to complete a sale. If a future revision of this contract adds one, that
revision violates §2 and must be rejected in review.

## 3. Versioning

- API base path: **`/api/pos/v1`**. The `v1` segment is the *API contract*
  version — a breaking change to any request/response shape in this
  document requires a new `/api/pos/v2` path, served alongside `/v1` for as
  long as any device fleet still needs it. Additive, backward-compatible
  changes (new optional field, new enum value a client may not recognize
  yet) do not require a version bump.
- `catalogVersion` and `settingsVersion` are a **completely different kind
  of version** — monotonically increasing integers scoped to a `(tenantId,
  storeId)` pair (catalog) or a store (settings), used for cache
  invalidation and sync-cursor bookkeeping, not for the API contract. Do not
  conflate the two. A POS device can be talking to API `v1` for years while
  `catalogVersion` climbs into the thousands.
- `appVersion` / `localCoreVersion` (see §8) are the POS device's own
  software version strings, informational only — SBGCloud must not reject a
  request based on these unless implementing an explicit, documented
  minimum-version policy (not part of this contract).

## 4. Authentication

Two stages, never one:

1. **Activation** — a one-time, short-lived `activationCode` (issued out of
   band by a tenant admin, typed in by hand at the till) is exchanged for a
   durable device credential. See §7.
2. **Device access token** — every subsequent call (heartbeat, catalog,
   settings, event ingestion, commands) authenticates as the *device*, not
   as the activation code. The activation code is single-use and expires;
   the device credential is what the till actually stores and uses day to
   day.

Convention for all authenticated endpoints in this document — **two
headers, confirmed production flow with the SBG Lite POS Android team**:

- `Authorization: Bearer <accessToken>` — the **sole real authentication
  factor**, unchanged since §7. A missing or invalid token is always `401`
  with `error.code = "UNAUTHORIZED"` (see §6).
- `X-Device-Code: <deviceCode>` — a **public identifier**, not a secret,
  safe to log and to appear in diagnostics/support correlation. Required
  on every authenticated endpoint except `/activate` itself (which
  predates having a device to check it against).

**Checked as a pair, not as two independent facts.** This is the Android
team's explicit requirement: the `accessToken` must have been issued *for*
the `deviceCode` presented alongside it — not merely "is this a valid
token" and separately "is this some known device code." Concretely: Cloud
resolves the device from `Authorization` first (existing `resolveDevice()`
logic, unchanged), then checks that the resolved device's stored
`deviceCode` equals the `X-Device-Code` header.

- `X-Device-Code` missing entirely → `400 VALIDATION_ERROR` (a pure
  request-shape error, checked before `Authorization` is even resolved —
  a request missing both headers gets `400`, not `401`).
- `X-Device-Code` present but not matching the resolved device →
  `401 UNAUTHORIZED`, **not** `400` — the token itself may be perfectly
  valid; it's the *pairing* that's wrong, which is exactly the scenario
  the Android team flagged as a potential security incident (a valid
  token presented with a foreign/incorrect device code). Logged as a
  security-warning with both the provided and the expected `deviceCode`
  (not just "a mismatch happened") — `apps/api/src/modules/pos-sync/
  routes.ts`'s `resolveAuthenticatedDevice()`.

`deviceCode` is never an independent auth factor and never substitutes for
`Authorization` — its absence or mismatch never weakens the `Authorization`
check, and a correct `X-Device-Code` with an invalid `Authorization` is
still `401`.

`deviceCode` is sent by the device at `/activate` the same way
`deviceFingerprint` is (§7) — confirmed by the Android team as their
production flow (derived from local till config today). Unique per
tenant: two devices in the same tenant cannot share a `deviceCode`, but
different tenants may both use the same dev-style value (e.g. `"POS-1"`)
without conflict.

**Open design point (see §22, Open Questions):** this document
specifies that activation returns both an `accessToken` and a
`refreshToken`, implying short-lived access tokens with a refresh flow —
but does not yet specify a `POST /api/pos/v1/token/refresh` endpoint. Until
that endpoint is specified and implemented, treat `accessToken` as long-
lived in practice. Do not build a refresh flow against an endpoint that
does not exist in this document yet.

## 5. Idempotency

Every POS → Cloud **critical event** (sale, fiscal, shift, stock — never
heartbeat, which is inherently a "latest wins" signal) must carry:

| Field | Type | Meaning |
|---|---|---|
| `idempotencyKey` | string | See format below. The dedupe key. |
| `localId` | string | The event's own id, as assigned by the POS device (e.g. `SALE-000001`). |
| `deviceId` | string | The device that produced the event. |
| `occurredAt` | ISO 8601 datetime, with offset | When the event happened *locally*, not when it reached the Cloud. |

`idempotencyKey` format:

```
deviceId:aggregateType:localId:eventType
```

Examples:

```
POS001:sale:SALE-000001:SALE_COMPLETED
POS001:fiscal:FISC-000001:FISCAL_SUCCESS
POS001:shift:SHIFT-000001:SHIFT_OPENED
```

Cloud behavior contract for any endpoint accepting an `idempotencyKey`:

- **First time seen** → process the event, persist it, return the real
  result.
- **Seen again, identical payload** → do not reprocess side effects (no
  double stock decrement, no double loyalty award, no duplicate row) —
  return the **same result** that was returned the first time, same status
  code, same body.
- **Seen again, different payload for the same key** → this is a client
  bug (the device reused a key for a different event). Reject with `409
  CONFLICT` (`error.code = "IDEMPOTENCY_KEY_REUSED"`) rather than silently
  accepting either version — never guess which payload is "correct."
- **Never mutate an already-accepted immutable event.** Sale/fiscal/shift
  events are append-only from Cloud's point of view; a correction is a new
  event (e.g. `SALE_CANCELLED`, `FISCAL_RECOVERED`), never an edit of a
  previously stored one.

Idempotency is enforced **on the Cloud side**. A device must never need to
know whether a previous sync attempt actually landed — it can always safely
retry with the same key (see §17).

## 6. Error format

Every response — success or failure — is wrapped in the same envelope:

**Success:**

```json
{
  "success": true,
  "data": {},
  "requestId": "string"
}
```

**Error:**

```json
{
  "success": false,
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  },
  "requestId": "string"
}
```

- `requestId` is always present (Cloud-generated, useful for support/log
  correlation on both sides) — a device should log it alongside any error it
  surfaces to a cashier or in local diagnostics.
- `error.code` is a stable, machine-readable string (`UNAUTHORIZED`,
  `INVALID_ACTIVATION_CODE`, `ACTIVATION_CODE_EXPIRED`,
  `IDEMPOTENCY_KEY_REUSED`, `UNKNOWN_PRODUCT`, `STALE_CATALOG_VERSION`,
  `VALIDATION_ERROR`, `RATE_LIMITED`, `NOT_IMPLEMENTED`, ...) — a device
  should branch on this, never on `error.message` (human-readable, may
  change wording, may be localized later).
- `error.details` is optional, free-form, used for validation errors (e.g.
  which field failed) — never used to leak internal stack traces or
  secrets.

## 7. Device activation

```
POST /api/pos/v1/activate
```

Not authenticated (this *is* the authentication bootstrap). Rate-limited
hard — see §19.

**Request:**

```json
{
  "activationCode": "123456",
  "deviceFingerprint": "string",
  "deviceName": "POS-1",
  "deviceType": "WINDOWS|ANDROID|LANDI|WEB",
  "appVersion": "0.1.0",
  "deviceCode": "string"
}
```

- `activationCode` — required. Single-use, short, expires (see §16 offline
  note: activation itself requires connectivity — a brand-new device cannot
  activate offline, only an already-activated one keeps selling offline).
- `deviceFingerprint` — required. A stable identifier the POS device
  derives from its own hardware/install (not the activation code, not the
  access token) — lets Cloud detect "this activation code is being redeemed
  by a device that already holds an active credential" as an anomaly worth
  flagging, independent of the credential itself.
- `deviceName`, `deviceType`, `appVersion` — required, descriptive/
  informational, used for fleet visibility (system-admin / tenant
  monitoring, not specified further in this document).
- `deviceCode` — **required** (§4/§22). The public, non-secret identifier
  a device must send as `X-Device-Code` on every other authenticated
  endpoint. Confirmed by the Android team as their production flow: sent
  the same way `deviceFingerprint` is, derived from local till config
  today. Unique per tenant (`@@unique([tenantId, deviceCode])` on
  `PosDevice`) — see the collision handling below.

**Response (`201`):**

```json
{
  "success": true,
  "data": {
    "tenantId": "string",
    "storeId": "string",
    "deviceId": "string",
    "accessToken": "string",
    "refreshToken": "string",
    "deviceCode": "string",
    "catalogVersion": 1,
    "settingsVersion": 1
  },
  "requestId": "string"
}
```

(This was shown flat, without the `data` wrapper, in an earlier draft of
this document — that contradicted §6's general envelope rule. The nested
form above is authoritative and matches the implementation.)

Returning `catalogVersion`/`settingsVersion` here lets a freshly activated
device decide immediately whether it already has a usable snapshot cached
from a previous activation (re-activation case) or must pull one before its
first sale. `refreshToken` is minted and stored (hash-only, same pattern as
`accessToken`) but nothing consumes it yet — no `token/refresh` endpoint is
specified in this document, so `accessToken` is still long-lived in
practice (see §4). `deviceCode` is echoed back as the **canonical** value —
the exact value Cloud actually persisted and will check on every
subsequent request — so the device has an authoritative value to send as
`X-Device-Code` even if Cloud ever starts normalizing what it receives
(e.g. for a first activation with no meaningful provisioning code); today
this is always identical to what was sent, since no normalization exists
yet.

`deviceName`/`deviceType` in the request are stored separately
(`reportedDeviceName`/`reportedDeviceType` on `PosDevice`) from the
admin-set `name`/`deviceType` created via `POST /store-admin/pos-devices` —
the admin's values remain authoritative for fleet display; the
device-reported values (plus `appVersion` and `deviceFingerprint`) are
informational/anomaly-detection only. `deviceFingerprint` collision with
another `ACTIVE` device is logged as a warning, not rejected —
`deviceCode` collision is handled differently (below), because it is
security/money-sensitive (half of the auth pair every other endpoint
checks — §4) in a way `deviceFingerprint` is not.

**`deviceCode` collision handling.** If another `ACTIVE` `PosDevice` in
the same tenant already holds the `deviceCode` being activated, the
activation is **rejected**, not logged-and-allowed: `409` with
`error.code = "DEVICE_CODE_ALREADY_IN_USE"`. This differs from the
`deviceFingerprint` precedent deliberately — two devices simultaneously
authenticating as the same public identifier would undermine exactly the
pairing guarantee §4 relies on. A device being re-activated (the same
`PosDevice` row this `activationCode` maps to) is never its own collision
— the check excludes it by `id`, matching the `deviceFingerprint`
pattern's exclusion.

**Failure modes:**

| Condition | Status | `error.code` |
|---|---|---|
| Unknown activation code | `404` | `INVALID_ACTIVATION_CODE` |
| Code known but expired | `400` | `ACTIVATION_CODE_EXPIRED` |
| Code known but already confirmed/used | `400` | `ACTIVATION_CODE_ALREADY_USED` |
| Missing/invalid request fields | `400` | `VALIDATION_ERROR` |
| `deviceCode` already in use by another active device in this tenant | `409` | `DEVICE_CODE_ALREADY_IN_USE` |
| Too many attempts from one IP | `429` | `RATE_LIMITED` |

## 8. Heartbeat

```
POST /api/pos/v1/heartbeat
```

Authenticated (device access token). Frequent, low-cost, never gates a
sale — a device must keep selling and keep queuing events in its outbox
whether or not heartbeat is succeeding.

**Request:**

```json
{
  "deviceId": "string",
  "localTime": "2026-07-03T10:00:00+05:00",
  "appVersion": "0.1.0",
  "localCoreVersion": "0.1.0",
  "shiftState": "CLOSED|OPEN|CLOSING|ERROR",
  "unsyncedEvents": 0,
  "fiscal": {
    "status": "OK|WARNING|ERROR|UNKNOWN",
    "terminalId": "string",
    "unsentCount": 0,
    "zRemaining": 0
  },
  "printer": {
    "status": "OK|ERROR|UNKNOWN"
  },
  "network": {
    "status": "ONLINE|OFFLINE"
  }
}
```

`deviceId` in the body is redundant with the identity already carried by
the access token — Cloud must derive the authoritative device identity from
the token, and treat a mismatching `deviceId` in the body as a validation
error rather than trusting the body. The field stays in the payload because
it makes device-side logs and Cloud-side request logs correlate without
cross-referencing the token.

**Response:**

```json
{
  "success": true,
  "data": {
    "serverTime": "2026-07-03T10:00:01+05:00",
    "licenseStatus": "ACTIVE|GRACE_PERIOD|EXPIRED|BLOCKED",
    "catalogVersion": 1,
    "settingsVersion": 1,
    "hasCommands": false,
    "pendingCommandsCount": 0
  },
  "requestId": "string"
}
```

- `serverTime` lets the device detect clock drift (compare against its own
  `localTime`) — purely informational, Cloud must never reject a request
  for clock skew in v1.
- `licenseStatus` reflects the tenant's subscription/billing state (see
  §16 for exactly what `BLOCKED` may and may not restrict). `BLOCKED` is
  driven by an explicit system-admin action (`Tenant.blockedAt`, set/cleared
  by block/unblock in the system-admin module) — it is independent of
  `GRACE_PERIOD`/`EXPIRED`, which are derived purely from `planExpiresAt`
  and the same 3-day grace window `getEffectivePlan()` already uses
  elsewhere for billing. There is currently no automatic non-payment path
  that sets `BLOCKED` — only manual system-admin action does.
- `catalogVersion`/`settingsVersion` let the device decide, cheaply and on
  every heartbeat, whether it needs to pull a fresh snapshot — without
  requiring a full catalog/settings fetch just to check.
- `hasCommands: true` is a hint to poll `GET /commands` soon — it is a hint,
  not a push; the device is not required to act on it immediately, and its
  absence (or a stale `false`) must never be treated as a guarantee there
  are no commands waiting. Wired to `CloudCommand` (§15) as of this
  revision: `pendingCommandsCount > 0` for this device.
- `pendingCommandsCount` — the same count `hasCommands` is derived from,
  exposed as a number rather than a boolean so a device (or an admin
  looking at logs) can tell "a few" from "a backlog" without a separate
  `GET /commands` call. Capped by nothing here — the cap is on `GET
  /commands` itself (§15, 10 per poll), not on this count.

## 9. Catalog snapshot

```
GET /api/pos/v1/catalog/snapshot?storeId=...&sinceVersion=...
```

Authenticated. `storeId` required (must match the authenticated device's
own store — a device requesting another store's catalog is a validation
error, not silently redirected). `sinceVersion` optional.

**Response:**

```json
{
  "success": true,
  "data": {
    "version": 1,
    "checksum": "string",
    "full": true,
    "categories": [],
    "products": [],
    "barcodes": [],
    "uzProfiles": []
  },
  "requestId": "string"
}
```

A request with no snapshot built yet for the store is `404` with
`error.code = "NO_SNAPSHOT_AVAILABLE"` — the store admin must trigger
`POST /store-admin/pos-devices/catalog-snapshot` first.

- `version` — the version of *this* response, for the device to store as
  its new baseline.
- `checksum` — a content hash of the snapshot payload, so a device can
  verify it received a snapshot intact (e.g. after a truncated/interrupted
  download) without re-parsing the whole thing to detect corruption.
  **v1 semantics: opaque.** A device compares checksums across fetches
  (same checksum ⇒ identical content, changed checksum ⇒ re-pull applied) —
  it does not independently re-derive the hash, because the exact
  canonicalization (key order, whitespace) is not specified yet. Server-side
  it is currently sha256 over the JSON serialization of the four arrays.
- `full` — `true` means this response is a complete replacement snapshot;
  a future, non-v1 capability might set this `false` to mean "this is a
  delta from `sinceVersion`" — **delta sync is out of scope for this
  contract's first implementation** (see §21); until delta sync exists,
  `full` is always `true` and `sinceVersion` is accepted but has no effect
  on the response.
- `categories` / `products` / `barcodes` / `uzProfiles` — top-level arrays,
  not nested under a generic blob, so a device can parse/store each
  independently. `uzProfiles` corresponds to the future `ProductUzProfile`
  model (`docs/SBGCLOUD_ARCHITECTURE.md` §12) — expect an empty array until
  that model exists.

## 10. Settings snapshot

```
GET /api/pos/v1/settings
```

Authenticated. No query parameters — always the authenticated device's own
store.

**Response:**

```json
{
  "success": true,
  "data": {
    "version": 1,
    "checksum": "string",
    "settings": {
      "taxProfile": {},
      "paymentMethods": [],
      "receiptTemplate": {},
      "printerProfile": {},
      "fiscalProfile": {},
      "offlineLimits": {},
      "roundingRules": {},
      "featureFlags": {},
      "weightBarcode": {}
    }
  },
  "requestId": "string"
}
```

A store whose admin has never configured POS settings still gets a valid
document: the empty eight-key body above (see the `weightBarcode` caveat
below), `version: 1`. The settings document is written by the store admin
via `PUT /store-admin/pos-devices/settings`; every write bumps `version`,
which is what heartbeat's `settingsVersion` reports (§8). `checksum` has
the same v1 opaque semantics as the catalog snapshot's (§9).

Each nested object's internal shape is intentionally not fixed by this
document yet — `taxProfile`, `receiptTemplate`, `printerProfile`,
`fiscalProfile` in particular depend on the eventual Uzbekistan fiscal
integration partner (`docs/SBGCLOUD_ARCHITECTURE.md` §12/§13) and should
not be speculatively over-specified here. `paymentMethods` should be
expected to correlate with `StorePaymentMethod` (Sellgram Commerce's
existing model) conceptually, but that mapping is not yet defined.
`offlineLimits` (e.g. "max hours/amount a device may sell offline before
requiring a sync") and `roundingRules` (cash rounding) are POS-operational
concerns with no existing Sellgram Commerce analog. `featureFlags` is a
free-form bag for gradual rollout of new POS Sync capabilities without a
version bump.

`weightBarcode` — the store's convention for decoding an internal weight
barcode printed at the scale (which digit ranges encode the PLU vs. the
weight/price, checksum handling, etc.), so a till can turn a scanned
weight barcode into a `Product.pluCode` lookup plus a quantity, rather
than that logic being hardcoded per-till. Same "free-form, tenant-defined
JSON" treatment as the other eight keys.

**Caveat, found while adding this key (not yet fixed):** unlike the other
eight keys, `weightBarcode` is **not actually persisted today**.
`posSettingsSchema.settings` in `pos-sync/admin-routes.ts` is a plain
`z.object({ ...8 named keys... })` with no `.passthrough()`, so Zod
silently strips any `weightBarcode` key a `PUT` request sends before it
ever reaches `PosSettings.payload` — and `apps/admin/src/pages/pos/PosSettings.tsx`
only renders edit panels for the existing eight keys, so there is
currently no UI path to send it either. This section documents the
intended shape; making it actually configurable needs both a schema
change (add `weightBarcode: z.record(z.unknown()).optional()`) and a
ninth panel in `PosSettings.tsx` — neither done here.

## 11. Sale events

```
POST /api/pos/v1/sale-events
```

Authenticated. Idempotent (§5). This is the *cloud-side mirror* of a sale
that has already been completed (or is progressing through its local
lifecycle) on the device — never a request that gates the sale itself.

**Event types:**

```
SALE_CREATED
SALE_PAID
SALE_FISCALIZED
SALE_COMPLETED
SALE_CANCELLED
SALE_REFUNDED
SALE_FISCAL_UNKNOWN
```

A single local sale typically produces *multiple* sale events over its
lifecycle (e.g. `SALE_CREATED` → `SALE_PAID` → `SALE_FISCALIZED` →
`SALE_COMPLETED`), each with its own `idempotencyKey` (same `localSaleId`,
different `eventType`) — Cloud must treat each event-type occurrence for a
given `localSaleId` as its own idempotent unit, not assume only one event
per sale ever arrives.

**Required fields:**

```json
{
  "deviceId": "string",
  "storeId": "string",
  "localSaleId": "string",
  "localShiftId": "string",
  "eventType": "SALE_COMPLETED",
  "status": "FISCALIZED|FISCAL_UNKNOWN|COMPLETED|CANCELLED|REFUNDED",
  "receiptNumber": 123,
  "idempotencyKey": "string",
  "occurredAt": "datetime",
  "items": [],
  "payments": [],
  "totals": {},
  "fiscal": {},
  "print": {}
}
```

- `localSaleId` / `localShiftId` — the device's own identifiers; Cloud does
  not generate sale/shift ids, it only ever receives and stores what the
  device already assigned locally (this is what makes recovery from an
  interrupted sync possible — the device never has to ask Cloud "what id do
  I use" before it can finish a sale).
- `items` — line items (product/variant reference, quantity, price at time
  of sale). Each item that references a `productId` unknown to Cloud is a
  conflict case — see §18.
- `payments` — tender breakdown (cash/card/other), used for reconciliation,
  not for actually processing payment (Sellgram Commerce's own `payment`
  module is unrelated and unaffected — see `docs/SBGCLOUD_ARCHITECTURE.md`
  §2).
- `fiscal` — nested fiscal outcome as known *at the time of this event*
  (may itself be `FISCAL_UNKNOWN` — see §10/§18 of
  `docs/SBGCLOUD_ARCHITECTURE.md` for why "unknown" is first-class, never
  papered over as success or failure).
- `print` — receipt print outcome (fiscal and/or non-fiscal), for
  diagnostics only — Cloud never triggers or retries a print itself (§2).

A `SALE_COMPLETED` event (status `COMPLETED` or `FISCALIZED`) is the trigger
for Cloud to derive `StockLedgerEntry` rows (`reason: POS_SALE`, one per
line item) — see §14.

**Stock reconciliation (resolved — `docs/SBGCLOUD_ARCHITECTURE.md` §13 step
4).** POS and the online storefront draw from **one shared physical
warehouse**, so each derived `StockLedgerEntry` also atomically moves the
live `Product`/`ProductVariant.stockQty` the storefront reads, and writes a
`StockMovement` audit row alongside it (the same table/pattern already
used for order placement, order cancellation, and manual admin stock
adjustment — so `GET /store-admin/stock-movements` shows POS sales and
online orders in one unified timeline). This happens synchronously inside
the same transaction as the sale event — no separate async reconciliation
job, because event ingestion is already idempotent (§5), so "apply exactly
once" holds by construction. **The result is allowed to go negative and is
never clamped to zero** — a POS sale reflects something that already
happened at the till, possibly against a stale offline catalog snapshot
(§9, §18); a negative number is the honest signal that an oversell
occurred, not something to hide.

**Response (`201` — both for a first-seen event and for an identical
replay, which returns the same body per §5):**

```json
{
  "success": true,
  "data": {
    "eventId": "string",
    "warnings": [
      { "index": 0, "code": "UNKNOWN_PRODUCT", "message": "string", "productId": "string" }
    ]
  },
  "requestId": "string"
}
```

- `eventId` — Cloud's id for the stored event (informational; a device
  keys its own bookkeeping on `localSaleId`/`idempotencyKey`, never on
  this).
- `warnings` — per-line-item ingest warnings (the §18 "flag the specific
  line item" mechanism; this is the shape §18 refers to). The event is
  accepted and stored regardless — a warned item just produced no
  `StockLedgerEntry` row. Codes: `UNKNOWN_PRODUCT` (item's `productId`
  unknown to Cloud), `MISSING_PRODUCT_REFERENCE` (item has no `productId`
  at all), `INVALID_QUANTITY` (`quantity` missing or not a positive
  integer), `UNKNOWN_VARIANT` (item's `variantId` doesn't belong to its
  `productId`). Warnings are computed once at first ingest and replayed
  verbatim on duplicate delivery.

## 12. Fiscal events

**Superseded by the real SBG Lite POS Android contract** (fiscal/shift/
commands v1, fixed 2026-07-04, snapshotted from a real LANDI M20SE
terminal exchange including real fiscal-module APDU) — this section
previously described a speculative shape (`FISCAL_RECOVERED`,
`Z_REPORT_CLOSED` as fiscal event types, `localId`/`details`) that was
never implemented against a real device. It is replaced below with what
Android POS actually sends.

```
POST /api/pos/v1/fiscal-events
Authorization: Bearer <accessToken>
X-Device-Code: <deviceCode>
```

Authenticated the same way as every other endpoint in this document (§4)
— **resolved**: both headers required, `Authorization` is the sole real
factor, `X-Device-Code` is a public identifier checked for a match (§4,
§22).

Idempotent, but not via the `deviceId:fiscal:localId:eventType` pattern
used elsewhere in this document — see §21's amended idempotency rules for
this endpoint: `eventId` (client-generated, per-delivery) is the sole
dedup key; `idempotencyKey`, `aggregateType`, `aggregateId` are stored for
correlation/reporting, not as the dedup mechanism.

**Response** (deliberately flatter than the §6 general envelope — no
`data`, matching the source contract exactly):

```json
{ "success": true, "requestId": "cloud-request-id" }
```

**Event types:** `FISCAL_STARTED`, `FISCAL_SUCCESS`, `FISCAL_FAILED`,
`FISCAL_UNKNOWN`. Every event carries the full receipt snapshot at the
time it was emitted (`items`, `payments`, `totalAmount`, `currency`,
`receiptType: SALE|REFUND`, and — for a refund — `originalLocalReceiptId`/
`originalReceiptNumber` pointing back at the sale being refunded).
`fiscalStatus`/`printStatus`/`ofdStatus` are free-form strings, not a
closed enum — the real fiscal module and daemon can introduce new values
without a contract change. `rawDaemonResponse`/`rawFiscalPayload` are
stored byte-for-byte as JSON, never normalized or validated beyond "is
this an object" — everything Cloud needs to search/report on
(`fiscalSign`, `fiscalReceiptNumber`, `receiptNumber`, `totalAmount`) is
already promoted to a top-level field alongside them.

A stored `FISCAL_UNKNOWN`/`FISCAL_FAILED` event is **never rewritten**
into a success — this is append-only, exactly like `SaleEvent` (§5/§11): a
later `FISCAL_SUCCESS` for the same `aggregateId` (a device's own recovery
flow) is stored as an additional row, and reporting must show the full
history rather than erasing the earlier ambiguous/failed state.

Note: this endpoint is intentionally decoupled from `POST /sale-events`
(§11) — Android POS's own local sale/refund submission
(`SbgHardwareCoreService`) is a device-internal call that never reaches
this Cloud API; only the resulting fiscal *event* does, via this
endpoint. `POST /sale-events`/`POST /stock-events` (§11/§14) are a
separate, earlier, still-speculative ingestion surface not yet wired to
this real contract — see §21.

## 13. Shift events

**Superseded the same way as §12** — see that section's note. Previous
event types (`X_REPORT_PRINTED`, `Z_REPORT_CLOSED`, `CASH_IN`, `CASH_OUT`)
are not part of the real contract; replaced below.

```
POST /api/pos/v1/shift-events
Authorization: Bearer <accessToken>
X-Device-Code: <deviceCode>
```

Same auth (§4), response shape, and `eventId`-keyed idempotency as §12.

**Event types:** `SHIFT_OPENED`, `SHIFT_CLOSED` only. `shiftState`
(`OPEN`/`CLOSED_WITH_Z`/...) and `zReportStatus`
(`NOT_STARTED`/`CLOSED`/...) are free-form strings for the same reason as
§12's `fiscalStatus`. `rawDaemonResponse`/`rawShiftPayload` are stored
as-is, same as §12's raw fields.

## 14. Stock movement events

**Not in the endpoint list a device calls directly for sales** — a
`SALE_COMPLETED` sale event (§11) is sufficient to trigger a
`StockLedgerEntry` row per line item on the Cloud side (`reason:
POS_SALE`), so a device does not additionally report stock movement for a
normal sale.

This section instead specifies the endpoint for stock movements **that do
not originate from a sale** — a cashier-initiated stock count correction
or manual restock at the till:

```
POST /api/pos/v1/stock-events
```

Authenticated. Idempotent (§5, `aggregateType: stock`).

**Required fields:**

```json
{
  "deviceId": "string",
  "storeId": "string",
  "productId": "string",
  "variantId": "string",
  "delta": -1,
  "reason": "POS_ADJUSTMENT|RESTOCK|OTHER",
  "idempotencyKey": "string",
  "occurredAt": "datetime",
  "note": "string"
}
```

`reason` maps directly onto the existing `StockLedgerReason` enum
(`packages/prisma/schema.prisma`: `POS_SALE | POS_ADJUSTMENT | RESTOCK |
OTHER`) — this endpoint only ever produces `POS_ADJUSTMENT`, `RESTOCK`, or
`OTHER`; `POS_SALE` rows are exclusively derived from sale events (§11),
never accepted directly from this endpoint (rejected as
`VALIDATION_ERROR`), to keep "a sale happened" as the single source of
truth for that reason code.

**Response (`201` — same envelope and replay semantics as §11):**

```json
{
  "success": true,
  "data": {
    "eventId": "string",
    "warnings": [
      { "index": 0, "code": "UNKNOWN_PRODUCT", "message": "string", "productId": "string" }
    ]
  },
  "requestId": "string"
}
```

The §18 accept-don't-reject principle applies here exactly as it does to
sale events: a stock event referencing a `productId` (or a `variantId` not
belonging to that `productId` — `UNKNOWN_VARIANT`) unknown to Cloud is
still stored (the correction already happened at the till) and answered
`201` — it just derives no `StockLedgerEntry` row and carries a warning
(`index` is always `0`; a stock event has exactly one item — the field is
kept for shape-consistency with §11 warnings). A known product/variant
derives one `StockLedgerEntry` row with the signed `delta` exactly as
sent, `sourceType: "StockEvent"` — and, per the reconciliation strategy in
§11, also atomically moves the live `Product`/`ProductVariant.stockQty`
and writes a `StockMovement` row (not clamped — the same "shared warehouse,
allow negative" rule applies here too).

## 15. Cloud commands

**Superseded by the real SBG Lite POS Android contract, §6** — allowed
command list narrowed, ack statuses changed, and (deliberately) the
response shape for `GET /commands` below is an exception to this
document's own §6 general envelope.

```
GET /api/pos/v1/commands
Authorization: Bearer <accessToken>
X-Device-Code: <deviceCode>
```

Same auth as §12/§13 (§4) — both headers required.

**Response — literal, not the §6 envelope: no `data` wrapper, no
`requestId`.** This matches what the real Android client parses
byte-for-byte; adding fields here was deliberately avoided rather than
"improving" it toward consistency with the rest of this document.

```json
{
  "success": true,
  "commands": [
    { "id": "cmd-uuid-1", "type": "PING", "payload": {}, "createdAtMs": 1720100000000 }
  ]
}
```

An empty `commands` array is a valid, normal response. Capped at 10
`PENDING` commands per poll, oldest first (`createdAt` ascending) — a
device with more than 10 waiting simply sees the rest on its next poll
after acking these; there is no dedicated "how many more are left"
field (`GET /pos/v1/heartbeat`'s `pendingCommandsCount`, uncapped, is
the closest thing to that).

**Allowed command types (v1):** `PING`, `REFRESH_CATALOG`,
`REFRESH_SETTINGS`, `SHOW_MESSAGE`.

**Creation paths (store-admin, `/api/store-admin/*`, `permissionGuard('manageSettings')`):**

- `POST /pos-devices/catalog-snapshot` and `PUT /pos-devices/settings`
  each automatically queue `REFRESH_CATALOG`/`REFRESH_SETTINGS`
  respectively for every `ACTIVE` device at that store — skipping a
  device that already has a `PENDING` command of that same type, so a
  device offline through several catalog edits in a row accumulates one
  pending refresh, not one per edit.
- `POST /pos-devices/commands` (`{ deviceId, type, payload? }`) sends any
  of the four allowed types to one specific device directly — a manual
  "ping this till" / "show this message" action, not deduplicated
  against an existing `PENDING` command of the same type (an admin
  explicitly asking twice gets two commands).

**Forbidden for v1** — must never be added to the allowed list without a
new major version *and* a re-review of §2:

```
FORCE_SALE
FORCE_REFUND
FORCE_FISCAL_OPERATION
OPEN_SHIFT
CLOSE_SHIFT
```

...and, generally, any command type that would create a receipt, payment,
refund, or fiscal operation. These are forbidden because every one of
them would let SBGCloud reach into a local sale/fiscal transaction from
the outside — precisely the coupling §2 exists to prevent. A future
contract revision that needs anything resembling these must instead
design a *device-initiated, device-gated* flow (the till decides
whether/when to act, Cloud only ever proposes) and must not simply lift
the forbidden list.

```
POST /api/pos/v1/commands/:id/ack
Authorization: Bearer <accessToken>
X-Device-Code: <deviceCode>
```

Tenant/device isolation: a device may only ack its own command — acking a
command belonging to a different device is `404`, not silently accepted
or `403` (a `403` would leak that the id exists at all).

**Request** (accepted verbatim from the source contract):

```json
{
  "status": "DONE",
  "message": null,
  "processedAtMs": 1720100005000
}
```

`status` is one of `DONE`, `FAILED`, `IGNORED`, `RETRY_LATER` — not
`ACKED`/`FAILED` as an earlier draft of this document had it. A command
must never be assumed delivered until acked — Cloud keeps offering it via
`GET /commands` until it is acked, and a device must be able to poll
`GET /commands` repeatedly without side effects (it is a pull, not a
dequeue-on-read). **Response**: the source contract does not specify one
for this endpoint — this Cloud uses the same flat `{ success, requestId }`
ack shape as §12/§13 for consistency, not because the source contract
requires it.

## 16. Offline behavior

- POS continues local sales without Cloud, unconditionally, for as long as
  Local POS Core's own operational limits allow (see `offlineLimits` in
  §10 — a POS Sync API concern only insofar as it *delivers* that
  configuration; enforcing it is entirely Local POS Core's job).
- POS stores events in a durable outbox (survives process crash, device
  reboot, power loss) before considering a sale "safe" — sync to Cloud is
  never a precondition of that safety.
- A SyncWorker (Local POS Core component, not part of this contract's
  surface) retries queued events later, whenever connectivity returns,
  using the retry policy in §17.
- Catalog and settings are read from the **last successfully applied
  snapshot** while offline — a POS device must never block a sale on a
  catalog/settings fetch it cannot currently make.
- **License `BLOCKED` must not break recovery.** A device whose heartbeat
  reports `licenseStatus: BLOCKED` must still be able to drain its existing
  durable outbox (sync already-completed sales/fiscal/shift events) once
  connectivity returns — `BLOCKED` is a billing/entitlement signal, not a
  data-loss trigger.
- `BLOCKED` **may** prevent *opening new shifts* (a Local POS Core policy
  decision, informed by `licenseStatus`) but **must** still allow *closing
  the current shift* and syncing everything accumulated during it. A
  blocked tenant with cash still in the drawer must be able to close out
  cleanly.

## 17. Retry policy

- **Exponential backoff** on the device side for any retryable failure —
  base delay, doubling up to a capped maximum, with jitter to avoid
  thundering-herd reconnect spikes across a tenant's whole device fleet
  after a Cloud incident.
- **Retryable HTTP statuses:** `429` (respect `Retry-After`/backoff hint),
  `500`, `502`, `503`, `504`, and network-level failures (timeout, DNS,
  connection refused) — anything that plausibly means "try again later,"
  including "the sync itself never reached the server."
- **Non-retryable:** `400` (validation error — the payload itself is wrong
  and will be wrong again unless corrected; never blindly retry a `400`
  in a loop), `401` (device credential invalid — surface for
  re-activation, don't spin), `404` on lookups that are permanently wrong
  (e.g. `INVALID_ACTIVATION_CODE`), `409` on `IDEMPOTENCY_KEY_REUSED` (a
  client bug, not a transient condition).
- **Idempotent retry is always safe** for the critical event endpoints
  (§5/§11–§14) precisely because Cloud enforces dedupe by
  `idempotencyKey` — a device may retry the *same* event body indefinitely
  without risking duplication, which is what makes long offline periods
  followed by a backlog drain safe by construction.
- **Max attempts is a Local POS Core policy, not a Cloud contract
  concern** — this document does not mandate a cap; a device may choose to
  retry forever (durable outbox, no data loss either way) or apply a local
  operational ceiling with alerting. Cloud must not assume a device gives
  up after any particular number of attempts.

## 18. Conflict handling

- **Cloud catalog changed while POS was offline.** Not an error — this is
  the normal case delta/full sync exists for. The device applies whatever
  snapshot it next successfully pulls (§9); a sale completed against a
  stale local catalog is still valid and must not be rejected retroactively
  — see the next point.
- **Duplicate event received.** Handled entirely by idempotency (§5) — not
  a conflict at the business level, a dedupe at the transport level.
- **Event references an unknown product.** The sale already happened
  locally and is not undoable — Cloud must still accept and store the sale
  event (reject nothing that already happened at the till), but flags the
  specific line item for reconciliation: `error` is *not* returned for the
  whole request; the accepted `201` response carries a per-item `warnings`
  array (shape defined in §11 — `{ index, code, message, productId? }`)
  rather than silently dropping stock-ledger effects for that item.
- **Event references an old catalog version.** Same principle — accept the
  sale (it happened against whatever catalog the device had at the time),
  do not require the event to reference the *current* `catalogVersion`.
  `catalogVersion` on an event is informational/diagnostic, never a
  precondition for acceptance.
- **Sale event arrives before its corresponding fiscal event.** Expected
  and normal — these are two independent event streams (§11 vs §12) that
  race by design (sync order across a spotty connection is not
  guaranteed). Cloud must not require fiscal-before-sale or
  sale-before-fiscal ordering; both must be independently ingestible and
  later correlated (by `localSaleId`/`idempotencyKey` linkage), not
  rejected for arriving "out of order."
- **Fiscal `UNKNOWN` later recovered.** `FISCAL_UNKNOWN` (§11 sale-level or
  §12 fiscal-level) is not an error state to be silently overwritten —
  when a later `FISCAL_RECOVERED` (or a corrected sale event) arrives for
  the same `localSaleId`, Cloud stores it as an **additional** event, and
  reporting/reconciliation surfaces should show the full history
  (unknown → recovered), never delete or mutate the original `UNKNOWN`
  record to make it look like it was always known (`docs/SBGCLOUD_
  ARCHITECTURE.md` §10).

## 19. Security requirements

- **TLS only.** No POS Sync endpoint may be called over plain HTTP in any
  environment a real device fleet touches.
- **Device credentials are hash-only on the Cloud side** — never store a
  raw access/refresh token; store a hash (matching the existing pattern for
  tenant API keys and the current `PosDevice.apiKeyHash`, see §21) and
  compare hashes.
- **Activation is the only endpoint reachable without a device credential**
  and must be the most tightly rate-limited endpoint in this contract — the
  current implementation caps it at **5 requests/minute/IP**
  (`apps/api/src/modules/pos-sync/routes.ts`), tighter than every other
  endpoint here, because `activationCode` is short and typed in by hand
  and is therefore brute-forceable without a hard limit.
- **All other POS Sync endpoints are rate-limited too** — current
  implementation applies a moderate **60 requests/minute/IP** baseline
  (`POS_DEFAULT_RATE_LIMIT` in the same file) explicitly, on top of (not
  instead of) the platform's global per-IP rate limit. A future revision
  may move to a per-device limit instead of/alongside per-IP once multiple
  devices sharing one shop's IP is common enough to make per-IP limits too
  coarse.
- **Device revocation must be effective immediately** — a `PosDevice`
  transitioned to `SUSPENDED` or `REVOKED` must fail authentication on its
  very next call, not merely stop being issued new tokens.
- **No secrets in this document, in code comments, in commit history, or in
  `.env` files committed to either repository.** Sample values in this
  document (`"123456"`, `"POS001"`, etc.) are illustrative only.
- **`deviceFingerprint` is not a secret and is not a substitute for the
  access token** — it is a correlation signal for anomaly detection at
  activation time (§7), never used on its own to authenticate a request.

## 20. Example flows

**Flow A — first activation and initial sync**

1. Tenant admin creates a `PosDevice` + `DeviceActivation` via
   `POST /api/store-admin/pos-devices` (Sellgram Commerce store-admin API,
   not part of this contract) and hands the printed `activationCode` to
   whoever is setting up the till.
2. Device calls `POST /api/pos/v1/activate` with the code plus its own
   fingerprint/name/type/version.
3. Cloud confirms the activation, issues `accessToken`/`refreshToken`,
   returns current `catalogVersion`/`settingsVersion`.
4. Device calls `GET /api/pos/v1/catalog/snapshot` and
   `GET /api/pos/v1/settings`, stores both locally, marks itself ready to
   sell.
5. Device begins sending `POST /api/pos/v1/heartbeat` on its normal
   interval.

**Flow B — normal sale while online**

1. Local POS Core completes a sale entirely locally: cart → tender →
   fiscalization → print → durable local record.
2. Local POS Core enqueues `SALE_CREATED` → `SALE_PAID` →
   `SALE_FISCALIZED` → `SALE_COMPLETED` sale events (§11) and a
   corresponding `FISCAL_SUCCESS` fiscal event (§12) into its outbox.
3. SyncWorker drains the outbox, POSTing each queued event with its own
   `idempotencyKey`. Cloud ingests each independently, derives
   `StockLedgerEntry` rows from the `SALE_COMPLETED` event.
4. None of steps 2–3 could have blocked step 1 — the sale was already
   complete and printed before any network call was attempted.

**Flow C — offline sale, later reconnect**

1. Network drops. Local POS Core keeps selling — cart/tender/fiscal/print
   are all local operations (§2), unaffected.
2. Every sale/fiscal/shift event goes into the durable outbox instead of
   being sent immediately.
3. Heartbeat calls fail (retryable, per §17) — Local POS Core does not
   treat heartbeat failure as a reason to stop selling.
4. Connectivity returns. SyncWorker resumes draining the outbox in order,
   using exponential backoff for any call that still fails, until the
   backlog is empty. Every event carries the same `idempotencyKey` it
   would have carried if sent immediately — replay-safe regardless of how
   long the gap was.

**Flow D — fiscal unknown, later recovered**

1. Fiscal module times out mid-receipt. Local POS Core records the sale
   locally with fiscal status `FISCAL_UNKNOWN` rather than guessing
   success or failure, completes the transaction (customer already paid),
   and queues a `SALE_COMPLETED` event with `status: FISCAL_UNKNOWN` plus
   a `FISCAL_UNKNOWN` fiscal event.
2. Cloud stores both, as-is — no attempt to resolve the ambiguity itself
   (§2, §18).
3. Local POS Core later reconciles against the fiscal module (on next
   boot, or a manual recovery flow — Local POS Core's own concern) and
   determines the true outcome, queuing a `FISCAL_RECOVERED` event
   referencing the same `localSaleId`.
4. Cloud stores the recovery as an additional event; reporting shows the
   full unknown → recovered history rather than rewriting it (§18).

**Flow E — cloud command delivery**

1. `POST /store-admin/pos-devices/catalog-snapshot` automatically queues
   a `REFRESH_CATALOG` command for every `ACTIVE` device at that store
   that doesn't already have one `PENDING` (`PUT
   /store-admin/pos-devices/settings` does the same with
   `REFRESH_SETTINGS`) — or a tenant admin sends one directly to a
   single device via `POST /store-admin/pos-devices/commands`.
2. Device's next heartbeat returns `hasCommands: true`.
3. Device calls `GET /api/pos/v1/commands`, receives the command.
4. Device acts on it locally (re-pulls the catalog snapshot) at a time of
   its own choosing — never mid-sale.
5. Device calls `POST /api/pos/v1/commands/:id/ack` with `status: ACKED`.
   Cloud stops offering that command on subsequent `GET /commands` calls.

---

## 21. Current implementation status

`apps/api/src/modules/pos-sync/routes.ts` implements a **first wave**
(`docs/SBGCLOUD_ARCHITECTURE.md` §13 step 2) that predates this contract
document and diverges from it in several concrete ways. This section is a
gap list, not a criticism — first wave was scoped deliberately narrow
(no fiscal partner confirmed yet), and this contract is the target to close
the gap against, not a description of what already exists. The rows marked
**Closed** below are the exception: `POST /activate`, `POST /heartbeat`,
`GET /catalog/snapshot`, `GET /settings`, `POST /sale-events`, `POST
/stock-events`, `POST /fiscal-events`, `POST /shift-events`, `GET
/commands` and `POST /commands/:id/ack` have since been brought in line
with a contract (see §7–§11, §14 for the first group; §12/§13/§15 for the
second, real-Android-contract group) — the only row below still
describing a real, unclosed gap is fiscal partner confirmation-adjacent
work outside this document's scope (there is none left inside it).

| Area | This contract | Current code | Gap |
|---|---|---|---|
| `POST /activate` request | `activationCode`, `deviceFingerprint`, `deviceName`, `deviceType`, `appVersion` | **Closed** — all five fields accepted; `deviceName`/`deviceType` stored as `reportedDeviceName`/`reportedDeviceType`, separate from the admin-set `name`/`deviceType` | No gap. Fingerprint collision with another active device is logged, not rejected (§7). |
| `POST /activate` response | `accessToken` + `refreshToken`, `catalogVersion`, `settingsVersion` | **Closed** — both tokens minted (hash-only, same pattern as before), `catalogVersion`/`settingsVersion` returned | No gap in shape. `refreshToken` is stored but unconsumed — still no `token/refresh` endpoint in code or in this contract, so `accessToken` remains long-lived in practice (§4). `settingsVersion` is a stable placeholder (`1`) pending `PosSettings` existing. |
| `POST /heartbeat` request | Rich payload: `shiftState`, `unsyncedEvents`, `fiscal{}`, `printer{}`, `network{}` | **Closed** — full payload validated; mismatched `deviceId` rejected as `VALIDATION_ERROR`; degraded `fiscal`/`printer` status logged | No gap in validation. Payload fields (`shiftState`, `unsyncedEvents`, etc.) are validated and log-inspected but not persisted — no admin fleet-monitoring endpoint reads them yet, so there's nowhere to store them usefully. |
| `POST /heartbeat` response | `licenseStatus`, `catalogVersion`, `settingsVersion`, `hasCommands` | **Closed** — `licenseStatus` derived via `getLicenseStatus()` (`apps/api/src/lib/billing.ts`) from `Tenant.planExpiresAt`/`Tenant.blockedAt`; `catalogVersion` from the latest snapshot; `settingsVersion` from the real `PosSettings.version` (was a stale note here — corrected, see the `GET /settings` row below, which already had this right); `hasCommands`/`pendingCommandsCount` from a real `CloudCommand.count()` for this device (§15), no longer the hardcoded `false` placeholder | No gap in shape. `BLOCKED` only ever comes from explicit system-admin block/unblock — no automatic non-payment path sets it beyond what `EXPIRED` already covers. |
| `GET /catalog/snapshot` request | `storeId`, `sinceVersion` query params | **Closed** — `storeId` required and must match the device's own store (else `VALIDATION_ERROR`); `sinceVersion` accepted but inert | No gap. `sinceVersion` being inert matches this contract's own v1 stance (`full` is always `true`, delta sync out of scope). |
| `GET /catalog/snapshot` response | Top-level `categories`/`products`/`barcodes`/`uzProfiles`, `checksum`, `full` | **Closed** — contract shape served; snapshot builder now stores categories alongside products; legacy `{ products }`-only snapshots served with empty arrays for the missing keys | No gap in shape. `barcodes`/`uzProfiles` are always `[]` pending the `Barcode`/`ProductUzProfile` models (§12). `checksum` is opaque in v1 (§9). |
| `GET /settings` response | Versioned, structured (`taxProfile`, `paymentMethods`, `receiptTemplate`, `printerProfile`, `fiscalProfile`, `offlineLimits`, `roundingRules`, `featureFlags`) | **Closed** — backed by the new `PosSettings` model (store-scoped, `version` + `payload Json`), written via `PUT /store-admin/pos-devices/settings`; unconfigured stores get empty eight-key defaults at version 1 | No gap in shape. Nested shapes are whatever the admin stored — unconstrained by design pending a fiscal partner (§10). The old `currency`/`timezone` placeholder response is gone (not part of the contract body). `settingsVersion` in `/activate` and `/heartbeat` now reports the real `PosSettings.version`. |
| Sale events | Full event-type vocabulary, idempotent ingestion, `StockLedgerEntry` derivation | **Closed** — `SaleEvent` model (append-only, unique `idempotencyKey` + payload hash), full §5 semantics (identical replay → stored result; different payload → 409), `SALE_COMPLETED` derives `StockLedgerEntry` rows, per-item warnings per §11/§18 | No gap in ingestion. Stock *reconciliation* strategy vs Sellgram Commerce's `StockMovement` is now resolved — see §11 (shared warehouse, synchronous atomic `stockQty` update, negative never clamped). Refund/cancel stock effects intentionally unspecified — only `SALE_COMPLETED` derives stock. |
| Fiscal events | Real SBG Lite POS Android contract (§12): `FISCAL_STARTED/SUCCESS/FAILED/UNKNOWN`, rich receipt snapshot, `eventId`-keyed idempotency | **Closed** — `FiscalEvent` model (append-only, `@@unique([deviceId, eventId])`); flat `{success, requestId}` ack per the real contract; `FISCAL_UNKNOWN`/`FAILED` never rewritten to success | No gap. Auth mismatch resolved jointly with the Android team — see §4/§22 (dual-header, `deviceCode` origin still unconfirmed). Decoupled from `POST /sale-events` (§11) by design (§12 note); the two ingestion surfaces are not yet wired together. |
| Shift events | Real contract (§13): `SHIFT_OPENED/CLOSED` only, `eventId`-keyed idempotency | **Closed** — `ShiftEvent` model, same idempotency/ack pattern as `FiscalEvent` | No gap. Same §4/§22 auth note applies. |
| Stock movement events | `POST /stock-events` (§14) | **Closed** — `StockEvent` model (append-only, no FK on `productId` on purpose) + full §5 idempotency; known product derives a signed-delta `StockLedgerEntry` (`sourceType: 'StockEvent'`); unknown product stored with an `UNKNOWN_PRODUCT` warning, no ledger row | No gap. `POS_SALE` is rejected at the API — that reason code stays exclusive to sale-event derivation. |
| Cloud commands | `GET /commands`, `POST /commands/:id/ack`, real contract's allowed list (§15) | **Closed** — `CloudCommand` model; `GET /commands` returns the real contract's literal flat shape (no `data`/`requestId`), capped at 10 `PENDING` per poll; ack validates `DONE/FAILED/IGNORED/RETRY_LATER` and enforces tenant/device isolation (404 on a foreign command). Rows are now created two ways: automatically (`POST /pos-devices/catalog-snapshot`/`PUT /pos-devices/settings` fan out `REFRESH_CATALOG`/`REFRESH_SETTINGS` to every `ACTIVE` device at the store, deduped against an existing `PENDING` command of the same type) and manually (`POST /pos-devices/commands`, any of the four types, one device, no dedup). Heartbeat's `hasCommands`/`pendingCommandsCount` now read this table for real (§8) — no longer hardcoded. | No gap in the polling/ack/creation surface. `GET /pos-devices` (admin fleet screen) also now returns each device's `pendingCommandsCount`, batched via one `groupBy`, not one query per device. Same §4/§22 auth note applies. |
| Device auth (all endpoints) | `Authorization: Bearer` + `X-Device-Code`, checked as a pair, confirmed production flow with the Android team (§4) | **Closed** — every authenticated endpoint except `/activate` requires both; `X-Device-Code` missing → `400`, mismatched (valid token, wrong pairing) → `401` + logged security-warning (provided + expected `deviceCode`), via a shared `resolveAuthenticatedDevice()` helper. `deviceCode` required at `/activate`, unique per tenant, collision with another active device → `409 DEVICE_CODE_ALREADY_IN_USE`; canonical value echoed back in the activate response. | No gap — both mechanism and `deviceCode` origin are confirmed (§22 is now empty of open items on this topic). Still a breaking change for already-activated devices — see the Migration notice; the Android client itself is already ready. |
| Idempotency | Required on every critical event, enforced Cloud-side | **Closed for every implemented event surface** — sale/stock-events use payload-hash reuse detection (409 on conflict); fiscal/shift-events use the real contract's `eventId`-keyed model (silent replay, no conflict code — see §12) | No gap. Fiscal/shift and sale/stock intentionally use two different (both real, both documented) idempotency shapes — see §5 vs §12 for why. |
| Rate limiting | 5/min on activate, moderate baseline elsewhere | **Already matches** — implemented exactly as described in §19 | No gap. |
| Base path | `/api/pos/v1` | **Already matches** | No gap. |

---

## 22. Open Questions

Two items previously tracked here are now resolved and removed from this
list — both confirmed with the SBG Lite POS Android team, whose client is
already updated, built, and installed on an M20SE terminal:

- Whether `X-Device-Code` and `Authorization: Bearer` were alternative
  auth mechanisms → **resolved**: both required together, checked as a
  pair, not independently. See §4 for the full rule.
- Where `PosDevice.deviceCode` comes from → **resolved**: sent by the
  device at `/activate` the same way `deviceFingerprint` is, derived from
  local till config. See §7.

Remaining open item:

- **`accessToken`/`refreshToken` refresh flow** (§4) — activation returns
  both, but no `POST /token/refresh` endpoint is specified or implemented;
  `accessToken` is long-lived in practice until one exists.

---

## Migration notice

**Breaking change — Android client already updated and ready; still
requires coordinated release timing.** Deploying the dual-header auth
requirement (§4) means: any device that activated **before** this change
ships will **fail to authenticate against every endpoint it calls except
`/activate`** the moment this ships — because:

1. Every authenticated endpoint now returns `400 VALIDATION_ERROR` if
   `X-Device-Code` is missing at all, and
2. Even a device sending some value for `X-Device-Code` will get
   `401 UNAUTHORIZED` unless that value matches `PosDevice.deviceCode` —
   which is `null` for **every device that activated before this
   change**, since `deviceCode` didn't exist as a stored/required field
   until now.

**Status: the SBG Lite POS Android team's client is already updated,
built, and installed on an M20SE terminal, sending both headers per §4's
confirmed production flow.** This is no longer a hypothetical
compatibility risk on their side — the remaining work is purely
**coordinating exact release timing** so that:

- Devices already activated against an **older** `PosDevice` row (no
  stored `deviceCode`) are re-activated with the updated client *before*
  or *immediately after* this ships, since there is no server-side
  backfill possible — Cloud cannot retroactively know what `deviceCode`
  value an already-deployed till would send.
- The deploy of this Cloud change and the Android release reaching real
  terminals happen close enough together that the window of
  already-active-but-not-yet-updated devices is minimal and understood by
  whoever is monitoring the fleet during the rollout.

**Do not deploy to production without explicit confirmation of the
release window from the Android team** — the client-side readiness
question is answered, but *when* real terminals receive it still needs to
be synchronized with this deploy.

---

*Cross-references: `docs/SBGCLOUD_ARCHITECTURE.md` (§2 boundary, §7 POS sync
future module, §12 future data model, §13 migration roadmap),
`packages/prisma/schema.prisma` (`PosDevice`, `DeviceActivation`,
`CatalogSnapshot`, `SyncCursor`, `StockLedgerEntry`, `FiscalEvent`,
`ShiftEvent`, `CloudCommand`, and their enums),
`apps/api/src/modules/pos-sync/routes.ts` and `admin-routes.ts` (current
server code).*

---

## 23. Reference: Demo Store Tashkent production config

> **Living document, not a schema spec.** §10's eight-key `settings` body
> is intentionally shape-only — this section is the opposite: one real,
> currently-live store's actual configured values, verified against a
> real terminal (**LANDI M20SE, serial `24BKCD203654`**) at
> `settingsVersion=3` / `policiesVersion=2`. Nothing here overrides or
> narrows §10/§14's contract; treat every value below as "this is what
> Demo Store Tashkent happens to have configured today," not as a new
> required field or enum. These values are edited through the admin UI
> (**POS → Настройки** at `app.sbgcloud.uz`), never by hand-editing code
> or this document — if the store's config changes, this section goes
> stale until someone re-verifies it against the device and updates it.

### 23.1 `settings` (verified `settingsVersion=3`)

```json
{
  "taxProfile": {
    "vatRate": 12,
    "vatEnabled": true,
    "country": "UZ",
    "taxSystem": "GENERAL"
  },
  "paymentMethods": ["CASH", "CARD", "QR_PAYME", "QR_CLICK", "QR_STATIC_MANUAL", "BANK_TRANSFER"],
  "receiptTemplate": {
    "header": "<store header text — tenant-configured, not reproduced here>",
    "footer": "<store footer text — tenant-configured, not reproduced here>",
    "showLogo": false,
    "showMxik": true,
    "showBarcode": true,
    "showOfdQr": true,
    "showDiscount": true,
    "showPackageCode": true,
    "showMarkCode": true,
    "showReceiptBarcode": true,
    "paperWidth": 42
  },
  "printerProfile": {
    "type": "THERMAL",
    "paperWidth": 42,
    "charset": "CP866",
    "override": false,
    "note": "Cloud profile is advisory only — see override semantics below"
  },
  "fiscalProfile": {
    "provider": "SBG_HARDWARE_CORE",
    "country": "UZ",
    "fiscalEnabled": true,
    "ofdEnabled": true
  },
  "offlineLimits": {
    "maxOfflineHours": 24,
    "maxOfflineAmountUZS": 10000000,
    "syncIntervalSeconds": 300
  },
  "roundingRules": {
    "cashRounding": 100,
    "roundingMode": "NEAREST",
    "currency": "UZS"
  },
  "featureFlags": {
    "refundEnabled": true,
    "discountEnabled": true,
    "markingEnabled": true,
    "xReportEnabled": true,
    "zReportEnabled": true,
    "cashInOutEnabled": true,
    "multiOperatorEnabled": true
  }
}
```

**`printerProfile.override` semantics:** `override: false` means this
Cloud-side profile is treated as a *recommendation* only — the till's
actual physical connection (host/port/pairing) stays a local, on-device
setting that Cloud never dictates. `override: true` is a different,
stronger contract (Cloud values take precedence over local ones) and
must be explicitly agreed with the SBG Lite POS Android team *before* any
store is switched to it — it is not a value to flip casually from the
admin UI without that coordination.

### 23.2 Staff snapshot (verified `staffVersion=1`)

One active operator, confirmed present on the device:

```json
{
  "operators": [
    {
      "name": "TestKassir",
      "role": "cashier",
      "active": true
    }
  ]
}
```

Device-side roster source confirmed as **CLOUD** (the till pulled this
operator from `GET /settings`'s `staff` block, §14.3) — not the
device-local fallback roster Android uses when `staff` is `null`.

### 23.3 Checksum (verified format)

```
settings=3;policies=2;printTemplates=1;staff=1
```

Matches §10's "opaque, compare-only" semantics for `checksum` — this is
simply what that opaque string actually looked like for this store at
this moment, not a format guarantee for other stores or future versions.

## 24. Operator Events

Operator audit trail — lock/login/switch and failed/blocked PIN attempts
at the till (PIN auth: §14.3, `PosOperator.pinRequired`). Purely an
append-only audit log: it never derives any other row (no ledger, no
sale, no shift) the way sale/stock events do.

```
POST /api/pos/v1/operator-events
```

Same auth (§4) and idempotency (§5) as fiscal/shift events — a device
posts one event per operator-lifecycle occurrence.

**Required fields:**

```json
{
  "eventType": "OPERATOR_LOCK|OPERATOR_LOGIN|OPERATOR_SWITCH|OPERATOR_PIN_FAILED|OPERATOR_PIN_BLOCKED",
  "operatorId": "string|null",
  "actorId": "string|null",
  "idempotencyKey": "string",
  "createdAt": 1732000000000,
  "payload": {}
}
```

**Event types:**

- `OPERATOR_LOCK` — till locked (screen returned to the operator-selection
  / PIN-entry screen), whether from an explicit lock action or an idle
  timeout. `operatorId` is typically `null` here — nobody is logged in
  once the till is locked.
- `OPERATOR_LOGIN` — an operator successfully authenticated (PIN or
  PIN-less, per `pinRequired`). `operatorId` is the operator who logged
  in.
- `OPERATOR_SWITCH` — one operator handed the till to another without an
  intervening lock (e.g. a supervisor override). `operatorId` is the
  incoming operator; `actorId` is the outgoing operator who authorized the
  switch.
- `OPERATOR_PIN_FAILED` — a PIN attempt did not match. `operatorId` is the
  operator the PIN was entered against, if the till can identify who was
  being attempted (e.g. selected from a roster first); `null` if the till
  only has a raw PIN with no operator context yet.
- `OPERATOR_PIN_BLOCKED` — the till locally rate-limited further PIN
  attempts after repeated `OPERATOR_PIN_FAILED` events (device-local
  lockout policy, not enforced by Cloud). Reported so the audit trail
  shows the block, not just the failures leading up to it.

`operatorId` and `actorId` are plain, unvalidated strings — same
accept-don't-reject principle as §18: an id Cloud doesn't recognize is
still stored as-is (the event already happened at the till), not
rejected.

**`idempotencyKey` format:**

```
<deviceCode>:operator:<localAuditId>:<EVENT_TYPE>
```

`localAuditId` is the till's own local audit-log row id for the event
being reported — stable across retries of the same occurrence, unique
per new occurrence, mirroring §11/§12/§13's `<deviceCode>:<domain>:<id>:<TYPE>`
convention.

**`createdAt`:** the till's own event time (ms since epoch, same
convention as this document's other `*AtMs`-shaped fields). This is
carried into the stored event's `payload.deviceCreatedAtMs` — it is
*not* written to the event's own Cloud-side `createdAt` timestamp, which
always reflects when Cloud received and stored the event. Keeping the
row's own `createdAt` server-controlled (rather than client-settable)
means the audit trail's own timeline can't be backdated by a device;
`payload.deviceCreatedAtMs` still preserves the till's reported time for
anyone who needs it.

**Payload examples:**

```json
// OPERATOR_LOCK
{ "reason": "IDLE_TIMEOUT", "deviceCreatedAtMs": 1732000000000 }

// OPERATOR_LOGIN
{ "method": "PIN", "deviceCreatedAtMs": 1732000000000 }

// OPERATOR_SWITCH
{ "reason": "SUPERVISOR_OVERRIDE", "deviceCreatedAtMs": 1732000000000 }

// OPERATOR_PIN_FAILED
{ "attemptNumber": 2, "deviceCreatedAtMs": 1732000000000 }

// OPERATOR_PIN_BLOCKED
{ "blockedForSeconds": 60, "deviceCreatedAtMs": 1732000000000 }
```

`payload` beyond `deviceCreatedAtMs` is free-form and till-defined — Cloud
stores it opaquely, same as every other `Json @default("{}")` payload
column in this document.

**Response (`201` on first receipt, `200` on replay — same envelope as
§11/§13, no `warnings`, since there is nothing here that can reference an
unrecognized product/variant):**

```json
{
  "success": true,
  "data": {
    "id": "string",
    "eventType": "string",
    "createdAt": "datetime"
  },
  "requestId": "string"
}
```

## 25. Payment Events

A universal, provider-agnostic event stream for what a payment provider
(UzQR, a card pinpad, Payme, Click, a static QR code, a bank transfer,
or cash) reports about a transaction — was it confirmed, rejected,
still pending, cancelled, or left in an ambiguous state the till
couldn't resolve on its own.

```
POST /api/pos/v1/payment-events
```

Same auth (§4) as every other event endpoint. Idempotent via
`@@unique([deviceId, idempotencyKey])` — a replay of `idempotencyKey`
returns the **same stored result** at `200`, exactly as first recorded
at `201`; it does not re-run anything or return a different value.
`eventId` (a client-generated UUID) travels alongside `idempotencyKey`
for correlation/reporting only, the same non-dedup role it plays on
`FiscalEvent` (§12) — `idempotencyKey` is this endpoint's actual dedup
key, not `eventId`.

### 25.1 Payment events vs. fiscal events — division of responsibility

**These are two separate streams, not two views of the same fact, and
neither is a superset of the other:**

- **`PosPaymentEvent` (this section) is the payment *provider's* side of
  a transaction** — did UzQR (or the pinpad, or Payme...) actually
  confirm the money moved? This can exist with **no** fiscal receipt at
  all (a payment confirmed, then the till fails to fiscalize it — a real
  failure mode `FiscalEvent`'s own `FISCAL_UNKNOWN`/`FISCAL_FAILED`
  states already anticipate, §12) — and, going the other direction, a
  `CASH` provider payment event may exist for a sale that fiscalizes
  perfectly normally, since cash has no external provider confirmation
  step to report on but is still reported here for a complete payment
  history.
- **`FiscalEvent` (§12) is the fiscal *receipt's* side** — was a receipt
  printed and sent to OFD? It carries the full item/payment snapshot at
  fiscalization time, not a payment-provider correlation.
- **Correlation between the two is by convention (`aggregateId`,
  `providerInvoiceId`, `saleId`/`fiscalReceiptId`), not a foreign key.**
  Neither model has a Prisma `@relation` to the other — same
  "shared vocabulary, not a schema coupling" posture already used
  between `ProductType` and `PlatformPolicy` (`docs/PRODUCT_TYPES.md`
  §2) and between `PaymentTerminal` and `StorePaymentMethod`
  (`docs/POS_SETTINGS_ARCHITECTURE.md` §3.1). A single sale can have
  **one `PosPaymentEvent` row and one `FiscalEvent` row that never
  reference each other in the schema**, only in the values an admin
  report happens to match up.
- A sale is never blocked or gated by this endpoint — same "narrow,
  non-blocking channel" principle already stated for `CloudCommand`
  (schema comment on that model) and the accept-don't-reject posture of
  §18: a payment event is always accepted and stored as reported, even
  if its `aggregateId`/`saleId` doesn't match anything Cloud recognizes
  yet (the till's own local state is authoritative for what actually
  happened; Cloud's job here is recording, not validating).

### 25.2 `eventType`

**Eleven values — read from a compressed shorthand in the source spec
for this endpoint, not independently confirmed against the Android
client source the way §12's fiscal event types were (that section's own
header notes those were "snapshotted from a real ... terminal
exchange"; these were not).** If the real contract spells any of these
differently, only this list and the Zod schema in
`apps/api/src/modules/pos-sync/routes.ts` need to change — nothing else
in this endpoint's design depends on the exact strings.

- `PAYMENT_INITIATED` — the till started a payment attempt with the
  provider (e.g. sent a UzQR invoice-creation request, or prompted for a
  card tap). No money has moved yet.
- `PAYMENT_PENDING` — the provider acknowledged the attempt but hasn't
  confirmed or rejected it yet (e.g. waiting on the customer to scan/pay
  a UzQR invoice, or on the card network to respond).
- `PAYMENT_CONFIRMED` — the provider confirmed the payment succeeded.
  The till's own local sale/receipt flow proceeds from here.
- `PAYMENT_REJECTED` — the provider explicitly declined the payment
  (insufficient funds, card declined, invoice expired, etc.).
- `PAYMENT_CANCELLED` — the payment attempt was cancelled before
  resolution (cashier cancelled at the till, or the customer backed out).
- `PAYMENT_AMBIGUOUS` — the till could not determine the outcome (e.g. a
  network timeout after sending the request, provider status unknown).
  Same "don't guess, report the ambiguity" spirit as `FiscalEvent`'s
  `FISCAL_UNKNOWN` (§12) — a human or a later recovery event resolves it,
  Cloud never infers a status here.
- `PAYMENT_REFUND_INITIATED` — a refund attempt started against a
  previously confirmed payment.
- `PAYMENT_REFUND_CONFIRMED` — the provider confirmed the refund
  completed.
- `PAYMENT_REFUND_REJECTED` — the provider declined the refund attempt.
- `PROVIDER_REJECTED_CONFIRMED` — a recovery/reconciliation outcome: the
  till initially received a rejection from the provider, but a later
  check (the till's own retry/reconciliation logic, out of scope for
  this endpoint) found the payment was actually confirmed after all.
  Reported as its own distinct value rather than silently rewritten
  into a plain `PAYMENT_CONFIRMED`, so the audit trail preserves that
  this one went through an anomalous path — same "append, never
  rewrite history" principle as `FiscalEvent`'s `FISCAL_UNKNOWN`→
  `FISCAL_SUCCESS` recovery flow (§12).
- `RECOVERY_FAILED_RETRYABLE` — the till attempted to resolve an
  ambiguous or failed payment (a status check against the provider) and
  that resolution attempt itself failed, but in a way the till considers
  worth retrying rather than a terminal failure.

`operation` is `SALE` or `REFUND` — which side of the transaction this
event belongs to, independent of `eventType` (a `PAYMENT_REFUND_*`
`eventType` always pairs with `operation: REFUND`, but `operation` is
still sent explicitly rather than derived from `eventType`, same
"accept what the till reports, don't re-derive it" posture as
`paymentMethod` duplicating `provider`, schema comment on
`PosPaymentEvent.paymentMethod`).

### 25.3 UzQR event mapping (illustrative — not yet confirmed)

**Unlike the fiscal/shift/commands contract (§12/§13/§15, confirmed
against a real Android exchange), UzQR's own callback/webhook event
names have not been confirmed against a real integration in this
repository.** The table below is this document's best-effort mapping
from UzQR's typical invoice-lifecycle callbacks to the universal
`eventType` vocabulary above, written to make the shape of the mapping
concrete — treat every UzQR-side name in the left column as provisional
until checked against a real UzQR integration test.

| UzQR callback (provisional) | Universal `eventType` | `provider` | `operation` |
|---|---|---|---|
| `invoice.created` | `PAYMENT_INITIATED` | `UZQR` | `SALE` |
| `invoice.waiting_payment` | `PAYMENT_PENDING` | `UZQR` | `SALE` |
| `invoice.paid` | `PAYMENT_CONFIRMED` | `UZQR` | `SALE` |
| `invoice.declined` / `invoice.expired` | `PAYMENT_REJECTED` | `UZQR` | `SALE` |
| `invoice.cancelled` | `PAYMENT_CANCELLED` | `UZQR` | `SALE` |
| status check timed out / no callback received | `PAYMENT_AMBIGUOUS` | `UZQR` | `SALE` |
| `refund.created` | `PAYMENT_REFUND_INITIATED` | `UZQR` | `REFUND` |
| `refund.completed` | `PAYMENT_REFUND_CONFIRMED` | `UZQR` | `REFUND` |
| `refund.declined` | `PAYMENT_REFUND_REJECTED` | `UZQR` | `REFUND` |
| reconciliation check finds a previously-declined invoice actually paid | `PROVIDER_REJECTED_CONFIRMED` | `UZQR` | `SALE` |
| reconciliation check itself fails (network/5xx) | `RECOVERY_FAILED_RETRYABLE` | `UZQR` | `SALE` or `REFUND` |

`providerInvoiceId` is UzQR's own invoice id (the `aggregateId` example
in §25.4 below, `"UZQR:INV-000001"`, embeds it); `providerPaymentId` is
whatever transaction/RRN id UzQR returns once paid — both are optional
here precisely because they don't exist yet at `PAYMENT_INITIATED` time.

### 25.4 Payload schema

**Required fields:**

```json
{
  "eventId": "string (client UUID)",
  "eventType": "PAYMENT_INITIATED|PAYMENT_PENDING|PAYMENT_CONFIRMED|PAYMENT_REJECTED|PAYMENT_CANCELLED|PAYMENT_AMBIGUOUS|PAYMENT_REFUND_INITIATED|PAYMENT_REFUND_CONFIRMED|PAYMENT_REFUND_REJECTED|PROVIDER_REJECTED_CONFIRMED|RECOVERY_FAILED_RETRYABLE",
  "aggregateType": "PAYMENT",
  "aggregateId": "UZQR:INV-000001",
  "schemaVersion": 1,
  "idempotencyKey": "string",
  "provider": "UZQR|PINPAD|PAYME|CLICK|QR_STATIC|BANK_TRANSFER|CASH",
  "paymentMethod": "string (duplicates provider, §25.2)",
  "operation": "SALE|REFUND",
  "status": "CONFIRMED|REJECTED|PENDING|CANCELLED|AMBIGUOUS",
  "amount": 2500000,
  "currency": "UZS"
}
```

`amount` is in tiyin (UZS's smallest unit — 1 UZS = 100 tiyin), same
"smallest currency unit, no floats" convention `totalAmount` already
uses elsewhere in this document.

**Optional fields**, all nullable and independently omittable — absent
means unknown/not-yet-available at the time this particular event fired,
not zero or empty:

```json
{
  "providerPaymentId": "rrn or transactionId from the provider",
  "providerInvoiceId": "invoiceId from the provider",
  "providerRefundId": "refundId, only present on a refund event",
  "saleId": "local saleId at the till",
  "refundId": "local refundId at the till",
  "fiscalReceiptId": "correlates with FiscalEvent, §25.1 — not a foreign key",
  "terminalId": "physical fiscal-module id",
  "shiftId": 1,
  "cashierId": "PosOperator.id snapshot, §25.1 same reasoning as FiscalEvent.operatorId",
  "cashierName": "string",
  "cashierRole": "string",
  "createdAtMs": 1732000000000,
  "updatedAtMs": 1732000002000,
  "completedAtMs": 1732000005000,
  "reason": "string — rejection/cancellation reason",
  "rawProviderStatus": { "code": "00", "message": "OK" }
}
```

`createdAtMs`/`updatedAtMs`/`completedAtMs` are the till's own reported
times (ms since epoch, this document's standard `*Ms` convention) —
stored as-is on this row's own `createdAtMs`/`updatedAtMs`/
`completedAtMs` columns, which is a deliberate difference from
`PosOperatorEvent` (§24): that model keeps its own `createdAt`
server-controlled and folds the device's reported time into `payload`
instead, because an operator audit trail's own timeline must not be
device-spoofable. A payment event has no equivalent tamper concern —
the till's reported timing *is* the fact being recorded, not a
security-sensitive receipt timestamp — so it is trusted and stored
directly; this row's separate, always-server-set `createdAt` column
(no `Ms` suffix) is Cloud's own receipt time, exactly like every other
event model in this document.

`rawProviderStatus` is stored byte-for-byte, never validated beyond
"is this an object" — same treatment as `FiscalEvent.rawDaemonResponse`
(§12).

**Response (`201` on first receipt, `200` on replay):**

```json
{
  "success": true,
  "data": {
    "id": "string",
    "eventType": "string",
    "status": "string",
    "createdAt": "datetime"
  },
  "requestId": "string"
}
```
