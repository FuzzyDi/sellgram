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

Convention for all authenticated endpoints in this document: `Authorization:
Bearer <accessToken>` header. A missing or invalid token is always `401`
with `error.code = "UNAUTHORIZED"` (see §6).

**Open design point (see §22 gap list and Open Questions):** this document
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
  "appVersion": "0.1.0"
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
practice (see §4).

`deviceName`/`deviceType` in the request are stored separately
(`reportedDeviceName`/`reportedDeviceType` on `PosDevice`) from the
admin-set `name`/`deviceType` created via `POST /store-admin/pos-devices` —
the admin's values remain authoritative for fleet display; the
device-reported values (plus `appVersion` and `deviceFingerprint`) are
informational/anomaly-detection only. `deviceFingerprint` collision with
another `ACTIVE` device is logged as a warning, not rejected.

**Failure modes:**

| Condition | Status | `error.code` |
|---|---|---|
| Unknown activation code | `404` | `INVALID_ACTIVATION_CODE` |
| Code known but expired | `400` | `ACTIVATION_CODE_EXPIRED` |
| Code known but already confirmed/used | `400` | `ACTIVATION_CODE_ALREADY_USED` |
| Missing/invalid request fields | `400` | `VALIDATION_ERROR` |
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
    "hasCommands": false
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
  are no commands waiting.

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
      "featureFlags": {}
    }
  },
  "requestId": "string"
}
```

A store whose admin has never configured POS settings still gets a valid
document: the empty eight-key body above, `version: 1`. The settings
document is written by the store admin via
`PUT /store-admin/pos-devices/settings`; every write bumps `version`, which
is what heartbeat's `settingsVersion` reports (§8). `checksum` has the same
v1 opaque semantics as the catalog snapshot's (§9).

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
  integer). Warnings are computed once at first ingest and replayed
  verbatim on duplicate delivery.

## 12. Fiscal events

```
POST /api/pos/v1/fiscal-events
```

Authenticated. Idempotent (§5).

**Event types:**

```
FISCAL_STARTED
FISCAL_SUCCESS
FISCAL_FAILED
FISCAL_UNKNOWN
FISCAL_RECOVERED
Z_REPORT_CLOSED
```

Fiscal events are reported **in addition to**, not instead of, the `fiscal`
block already embedded in sale events (§11) — a sale event's `fiscal` field
is "what we knew about fiscalization at the moment this sale event was
emitted"; a standalone fiscal event is for fiscal-module-level occurrences
that don't map 1:1 to a single sale (e.g. `FISCAL_RECOVERED` after a device
reboot reconciles a batch of previously `FISCAL_UNKNOWN` receipts, or
`Z_REPORT_CLOSED` which closes out an entire shift's fiscal totals, not one
sale). `FISCAL_UNKNOWN` here (as its own event, decoupled from any one
sale) covers fiscal-module-level ambiguity (e.g. the module itself is
unreachable/unresponsive) as opposed to a single sale's fiscalization
outcome being unknown.

## 13. Shift events

```
POST /api/pos/v1/shift-events
```

Authenticated. Idempotent (§5).

**Event types:**

```
SHIFT_OPENED
SHIFT_CLOSED
X_REPORT_PRINTED
Z_REPORT_CLOSED
CASH_IN
CASH_OUT
```

`Z_REPORT_CLOSED` appears in both §12 and here deliberately — a Z-report is
simultaneously a fiscal-module event (it closes fiscal totals) and a shift
event (it typically accompanies shift close). Emit it on **both** channels
if both are true for a given occurrence; Cloud must not assume the two are
mutually exclusive, and must dedupe each independently by its own
`idempotencyKey` (different `aggregateType` segment: `fiscal` vs `shift`).

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
sale events: a stock event referencing a `productId` unknown to Cloud is
still stored (the correction already happened at the till) and answered
`201` — it just derives no `StockLedgerEntry` row and carries an
`UNKNOWN_PRODUCT` warning (`index` is always `0`; a stock event has
exactly one item — the field is kept for shape-consistency with §11
warnings). A known product derives one `StockLedgerEntry` row with the
signed `delta` exactly as sent, `sourceType: "StockEvent"`.

## 15. Cloud commands

```
GET /api/pos/v1/commands
```

Authenticated.

**Response:**

```json
{
  "success": true,
  "data": {
    "commands": []
  }
}
```

**Allowed command types (v1):**

```
REFRESH_CATALOG
REFRESH_SETTINGS
PING
UPLOAD_DIAGNOSTICS
DISABLE_DEVICE
SHOW_MESSAGE
```

**Forbidden for v1** — must never be added to the allowed list without a
new major version *and* a re-review of §2:

```
FORCE_SALE
FORCE_REFUND
FORCE_FISCAL_OPERATION
FORCE_Z_REPORT
```

These are forbidden because every one of them would let SBGCloud reach
into a local sale/fiscal transaction from the outside — precisely the
coupling §2 exists to prevent. A future contract revision that needs
anything resembling these must instead design a *device-initiated,
device-gated* flow (the till decides whether/when to act, Cloud only ever
proposes) and must not simply lift the forbidden list.

```
POST /api/pos/v1/commands/:id/ack
```

Authenticated. Idempotent by `id` (acking an already-acked command returns
the same result, does not error).

**Request:**

```json
{
  "status": "ACKED|FAILED",
  "message": "string"
}
```

A command must never be assumed delivered until acked — Cloud keeps
offering it via `GET /commands` until an ack (`ACKED` or `FAILED`) is
received, and a device must be able to poll `GET /commands` repeatedly
without side effects (it is a pull, not a dequeue-on-read).

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

1. Tenant admin (or an automated policy, out of scope here) triggers a
   `REFRESH_CATALOG` command targeting a device.
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
`GET /catalog/snapshot`, `GET /settings`, `POST /sale-events` and `POST
/stock-events` have since been brought in line with this contract (see
§7–§11, §14) — every other row still describes real, unclosed gaps
(fiscal/shift ingestion, cloud commands).

| Area | This contract | Current code | Gap |
|---|---|---|---|
| `POST /activate` request | `activationCode`, `deviceFingerprint`, `deviceName`, `deviceType`, `appVersion` | **Closed** — all five fields accepted; `deviceName`/`deviceType` stored as `reportedDeviceName`/`reportedDeviceType`, separate from the admin-set `name`/`deviceType` | No gap. Fingerprint collision with another active device is logged, not rejected (§7). |
| `POST /activate` response | `accessToken` + `refreshToken`, `catalogVersion`, `settingsVersion` | **Closed** — both tokens minted (hash-only, same pattern as before), `catalogVersion`/`settingsVersion` returned | No gap in shape. `refreshToken` is stored but unconsumed — still no `token/refresh` endpoint in code or in this contract, so `accessToken` remains long-lived in practice (§4). `settingsVersion` is a stable placeholder (`1`) pending `PosSettings` existing. |
| `POST /heartbeat` request | Rich payload: `shiftState`, `unsyncedEvents`, `fiscal{}`, `printer{}`, `network{}` | **Closed** — full payload validated; mismatched `deviceId` rejected as `VALIDATION_ERROR`; degraded `fiscal`/`printer` status logged | No gap in validation. Payload fields (`shiftState`, `unsyncedEvents`, etc.) are validated and log-inspected but not persisted — no admin fleet-monitoring endpoint reads them yet, so there's nowhere to store them usefully. |
| `POST /heartbeat` response | `licenseStatus`, `catalogVersion`, `settingsVersion`, `hasCommands` | **Closed** — `licenseStatus` derived via `getLicenseStatus()` (`apps/api/src/lib/billing.ts`) from `Tenant.planExpiresAt`/`Tenant.blockedAt`; `catalogVersion` from the latest snapshot | No gap in shape. `settingsVersion` (`1`) and `hasCommands` (`false`) are stable placeholders pending `PosSettings`/`CloudCommand` existing. `BLOCKED` only ever comes from explicit system-admin block/unblock — no automatic non-payment path sets it beyond what `EXPIRED` already covers. |
| `GET /catalog/snapshot` request | `storeId`, `sinceVersion` query params | **Closed** — `storeId` required and must match the device's own store (else `VALIDATION_ERROR`); `sinceVersion` accepted but inert | No gap. `sinceVersion` being inert matches this contract's own v1 stance (`full` is always `true`, delta sync out of scope). |
| `GET /catalog/snapshot` response | Top-level `categories`/`products`/`barcodes`/`uzProfiles`, `checksum`, `full` | **Closed** — contract shape served; snapshot builder now stores categories alongside products; legacy `{ products }`-only snapshots served with empty arrays for the missing keys | No gap in shape. `barcodes`/`uzProfiles` are always `[]` pending the `Barcode`/`ProductUzProfile` models (§12). `checksum` is opaque in v1 (§9). |
| `GET /settings` response | Versioned, structured (`taxProfile`, `paymentMethods`, `receiptTemplate`, `printerProfile`, `fiscalProfile`, `offlineLimits`, `roundingRules`, `featureFlags`) | **Closed** — backed by the new `PosSettings` model (store-scoped, `version` + `payload Json`), written via `PUT /store-admin/pos-devices/settings`; unconfigured stores get empty eight-key defaults at version 1 | No gap in shape. Nested shapes are whatever the admin stored — unconstrained by design pending a fiscal partner (§10). The old `currency`/`timezone` placeholder response is gone (not part of the contract body). `settingsVersion` in `/activate` and `/heartbeat` now reports the real `PosSettings.version`. |
| Sale events | Full event-type vocabulary, idempotent ingestion, `StockLedgerEntry` derivation | **Closed** — `SaleEvent` model (append-only, unique `idempotencyKey` + payload hash), full §5 semantics (identical replay → stored result; different payload → 409), `SALE_COMPLETED` derives `StockLedgerEntry` rows, per-item warnings per §11/§18 | No gap in ingestion. Stock *reconciliation* strategy vs Sellgram Commerce's `StockMovement` is still undefined (`docs/SBGCLOUD_ARCHITECTURE.md` §13 step 4 flags it as a prerequisite for real-fleet enablement). Refund/cancel stock effects intentionally unspecified — only `SALE_COMPLETED` derives stock. |
| Fiscal/shift events | Full event-type vocabularies, idempotent ingestion | `501 NOT_IMPLEMENTED` stubs | `FiscalReceipt`/`ShiftProjection` models do not exist yet — roadmap step 5, pending a confirmed fiscal integration partner. |
| Stock movement events | `POST /stock-events` (§14) | **Closed** — `StockEvent` model (append-only, no FK on `productId` on purpose) + full §5 idempotency; known product derives a signed-delta `StockLedgerEntry` (`sourceType: 'StockEvent'`); unknown product stored with an `UNKNOWN_PRODUCT` warning, no ledger row | No gap. `POS_SALE` is rejected at the API — that reason code stays exclusive to sale-event derivation. |
| Cloud commands | `GET /commands`, `POST /commands/:id/ack` with typed command list | `501 NOT_IMPLEMENTED` stubs (endpoints exist, no logic) | `CloudCommand` model does not exist yet. Allowed/forbidden command type enforcement not implemented. |
| Idempotency | Required on every critical event, enforced Cloud-side | **Partially closed** — full §5 semantics implemented for sale-events and stock-events (unique key, payload-hash reuse detection, stored-result replay, concurrent-race handling, shared helper) | Fiscal/shift endpoints will reuse the same pattern when implemented — until then idempotency exists only on the sale/stock surfaces. |
| Rate limiting | 5/min on activate, moderate baseline elsewhere | **Already matches** — implemented exactly as described in §19 | No gap. |
| Base path | `/api/pos/v1` | **Already matches** | No gap. |

---

*Cross-references: `docs/SBGCLOUD_ARCHITECTURE.md` (§2 boundary, §7 POS sync
future module, §12 future data model, §13 migration roadmap),
`packages/prisma/schema.prisma` (`PosDevice`, `DeviceActivation`,
`CatalogSnapshot`, `SyncCursor`, `StockLedgerEntry`, and their enums),
`apps/api/src/modules/pos-sync/routes.ts` and `admin-routes.ts` (current
server code).*
