# SBGCloud Admin — Redesign Plan

Status: **design only** — no code, no `tailwind.config` changes, no
`App.tsx` changes in this pass. Implementation is later, separate
sessions, following the phased plan in §7.

## 1. Purpose and current-state audit

`apps/admin` is the tenant-facing workspace for SBGCloud (backend module
naming still says "store-admin" — `/api/store-admin/*` — that's a
separate, later renaming concern, not addressed here). It has grown by
accretion across three now-distinct product surfaces — Sellgram
(Telegram bot/miniapp), POS (`docs/POS_SYNC_API.md`), and B2B
(`docs/B2B_COUNTERPARTIES.md`) — while the UI still presents everything
as one undifferentiated list of pages. This document plans the visual
and structural redesign; it does not touch backend contracts.

### Real findings, not estimates

- **Routing**: `apps/admin/src/App.tsx` is 415 lines and contains a
  hand-rolled hash router (`useRoute()`, lines 34-43) plus a `switch`
  statement (`PageRouter`, lines 248-290) mapping hash strings to lazy
  page imports. There is no `react-router-dom` (or any router package) in
  `apps/admin/package.json` — none exists anywhere in the monorepo
  (checked `apps/miniapp/package.json` too).
- **Direct hash writes bypass the router's own `navigate()` helper.**
  7 files write `window.location.hash = '...'` directly rather than going
  through the `navigate` prop `Sidebar` receives: `Dashboard.tsx` (6
  call sites, including `'/orders?status=NEW'` with a query string baked
  into the hash), `Reports.tsx` (3, all `'/billing'`), `Suppliers.tsx`,
  `Procurement.tsx` (both `'/billing'`), `OnboardingWizard.tsx`
  (`'/products'`), and `pages/sys/SysTenants.tsx` (`'/'`). Any router
  migration has to account for all of these, not just the central hook.
- **`tailwind.config.js` is genuinely empty**:
  ```js
  export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: { extend: {} },
    plugins: [],
  };
  ```
  Zero design tokens. Every color/spacing/radius value in every page is
  either a raw Tailwind utility (`text-gray-500`) or an inline `style={{
  }}` hex literal — `App.tsx`'s own `Sidebar` hardcodes
  `#112336`/`#0b1726`/`#00b96b` directly, twice (lines 115, 127, 396).
- **Page sizes** (`apps/admin/src/pages/*.tsx`, `wc -l`): 20 top-level
  pages totaling 10,237 lines, plus 11 more under `pages/sys/` (a
  separate, cross-tenant system-admin console — see §9) totaling 2,305
  lines. The five largest top-level pages:

  | File | Lines |
  |---|---|
  | `Settings.tsx` | 1,481 |
  | `Products.tsx` | 1,130 |
  | `Billing.tsx` | 722 |
  | `Help.tsx` | 712 |
  | `Reports.tsx` | 699 |

  `Settings.tsx` in particular is not just long — it's **seven pages
  wearing a trenchcoat**: an internal tab state (`Settings.tsx:9`,
  `useState<'stores' | 'zones' | 'loyalty' | 'account' | 'api' |
  'webhooks' | 'crm'>`) switches between Stores, Delivery zones, Loyalty,
  Account, API keys, Webhooks, and team/CRM management, all in one file,
  one component tree, one `useEffect` that fetches all seven tabs' data
  up front (`Settings.tsx:89`, `Promise.all([...])` across all sections
  regardless of which tab is active).
- **Inline styles alongside Tailwind, not instead of it**:
  `Products.tsx` has 160 `style={{` occurrences, `Settings.tsx` has 226,
  in files that also use Tailwind utility classes — genuinely mixed, not
  a one-or-the-other split by file.
- **`src/components/`** currently holds exactly one generic component,
  `Button.tsx`, plus a payments-specific modal (`components/payments/`).
  `Button.tsx` is not a plain wrapper — it deliberately attaches a native
  DOM `click` listener via `ref`/`useEffect` instead of React's
  `onClick`, with the comment "bypasses React synthetic events — fixes
  dual-React issue in pnpm monorepo" (`Button.tsx:3`). **Any replacement
  or extension of `Button` must preserve this workaround** — it's there
  for a real, already-solved problem, not incidental.
- **No POS or B2B admin UI exists yet, at all.** Both `pos-sync` and
  `counterparty` are backend-only modules today (confirmed: no reference
  to `pos-device`, `pos-sync`, or `counterpart` anywhere under
  `apps/admin/src`). The "Sales channels → POS" and "Sales channels →
  B2B" sections in the IA below are **net-new screens to build**, not
  migrations of existing ones — which is a meaningfully different (and
  easier) kind of work than restyling `Products.tsx`: they can be built
  directly on the new component system with no legacy markup to unwind.
- **`i18n.tsx`** provides ru/uz strings throughout (`useAdminI18n()`,
  `t()`/`tr()`). Not mentioned in the brief, but real and load-bearing —
  the redesign must keep both languages working, not just Russian.
- **`index.html`** currently sets `<title>SellGram Admin</title>` and an
  inline SVG favicon (green rounded square, white "S") — both need to
  become SBGCloud per §4.

## 2. Visual direction

Stripe/Linear-register: neutral surface, one accent color, borders over
shadows, restrained type weight. Concretely, as Tailwind theme tokens
(for the eventual `tailwind.config.js` — not written in this pass):

### Palette

```
neutral (zinc scale — already ships with Tailwind, just needs to become
the *only* gray scale used, replacing ad hoc hex grays):
  50  #fafafa   surface (page background)
  100 #f4f4f5   surface-muted (subtle section backgrounds)
  200 #e4e4e7   border (default border color — see "borders vs shadows")
  300 #d4d4d8   border-strong (inputs, dividers that need more contrast)
  400 #a1a1aa   text-disabled
  500 #71717a   text-muted (secondary text, labels)
  600 #52525b   text-secondary
  700 #3f3f46   text (default body text — NOT 900/black)
  800 #27272a   text-strong (headings)
  900 #18181b   surface-inverse (dark sidebar background, if kept dark —
                  see open question in §7 Phase 2)
  950 #09090b   surface-inverse-strong

accent (primary — replaces the Sellgram green as the app-wide chrome
color; green becomes the Sellgram *channel's* icon/badge color instead,
so the channel keeps its identity without owning the whole app):
  indigo-500  #6366f1   hover state
  indigo-600  #4f46e5   default (buttons, active nav item, links)
  indigo-700  #4338ca   pressed/active state

semantic (muted, not neon — Stripe/Linear both desaturate status colors
relative to Tailwind's defaults):
  success  emerald-600  #059669
  warning  amber-600    #d97706
  danger   red-600      #dc2626

channel accents (used only for small identifying marks — nav icons,
badges — never as a page's dominant color, so the neutral chrome stays
neutral):
  Sellgram  emerald-600  #059669   (continuity with the existing brand green)
  POS       sky-600      #0284c7
  B2B       violet-600   #7c3aed
```

### Typography

System font stack (`ui-sans-serif, system-ui, -apple-system, ...` —
Tailwind's default `font-sans`), not a webfont — avoids a load waterfall
for an internal tool. Base size **14px**, not the browser default 16px:
Stripe and Linear both run dense data UIs a step smaller than marketing
pages.

```
text-xs    12px / 16px line-height   — table meta, timestamps
text-sm    13px / 18px               — body default, form labels
text-base  14px / 20px               — emphasized body, button text
text-lg    16px / 24px               — card titles
text-xl    18px / 26px               — section headings
text-2xl   22px / 30px               — page titles
```

Weight: `font-semibold` (600) for headings, never `font-black`/`font-900`
— the current `Sidebar` logo at `font-weight: 900` (`App.tsx:126`) is
exactly the kind of over-bold treatment this direction moves away from.

### Spacing, radius, borders vs. shadows

- Spacing: Tailwind's default 4px-based scale (`p-1`…`p-16`), used
  directly instead of the arbitrary inline pixel values scattered through
  `App.tsx` today (`9px 10px`, `16px 14px 12px`, `260` width, etc.) —
  snap everything to the scale (`p-2`, `p-3`, `w-64` ≈ 256px instead of a
  hardcoded `260`).
- Radius tokens: `radius-sm` 6px (inputs, small buttons), `radius-md` 8px
  (buttons, badges), `radius-lg` 12px (cards, modals) — deliberately
  smaller than the current sidebar's `borderRadius: 10` nav items and
  cards elsewhere, which lean slightly toward a softer, less corporate
  feel.
- **Borders, not shadows, as the primary separation device.** Cards get
  `border border-neutral-200`, not a drop shadow. Reserve shadow for
  genuinely floating elements — dropdown menus, modals, toasts — as one
  restrained token: `shadow-sm` → `0 1px 2px rgba(0,0,0,0.04)`. This is
  the single biggest visual-language change from the current app, which
  uses gradients (`linear-gradient(180deg, #112336 0%, #0b1726 100%)` on
  the sidebar) and colored glows nowhere else in the target style.

## 3. Information architecture

Two levels: **Workspace** (channel-agnostic) and **Sales channels**
(per-channel). Below is the exact mapping of every existing page/tab to
its new home — this is the concrete "what moves where," not a
placeholder.

### Workspace

| New nav item | Comes from | Notes |
|---|---|---|
| Dashboard | `pages/Dashboard.tsx` | Restyled in place; its hardcoded `window.location.hash` writes (§1) need converting to `useNavigate()` calls in the routing migration (§6), independent of any visual change. |
| Catalog | `pages/Products.tsx` + `pages/Categories.tsx` | Two existing pages merge under one nav item (e.g. tabs or sub-nav), matching how they're already used together. `Products.tsx` (1,130 lines) is the primary target for component-splitting in Phase 3 (§7). |
| Stock | `pages/Stock.tsx` + `pages/Procurement.tsx` + `pages/Suppliers.tsx` | Three existing pages, all stock/purchasing-adjacent, consolidated under one nav item with sub-navigation. |
| Customers | `pages/Customers.tsx` | Unchanged placement per your instruction. Worth a one-line caveat, not a deviation: `Customer` is modeled as Telegram-specific (`docs/B2B_COUNTERPARTIES.md` §11 — "retail Sellgram buyers keyed on telegramId") — keeping it in Workspace is a UI/IA choice for this admin, not a claim that the data model is channel-agnostic. |
| Loyalty | `pages/Settings.tsx`'s `loyalty` tab | **Currently not a standalone page at all** — it's one of seven tabs inside `Settings.tsx` (`Settings.tsx:9`). Promoting it to a first-class Workspace item means extracting that tab's markup/logic out of the `Settings.tsx` monolith — this is real migration work, not a relabel. |
| Reports | `pages/Reports.tsx` | Restyled in place. |
| Team & settings | `pages/Settings.tsx`'s `stores`/`zones`/`account`/`api`/`webhooks`/`crm` tabs, `pages/AuditLog.tsx`, `pages/Billing.tsx` | The remaining six `Settings.tsx` tabs (after `loyalty` is extracted, above) plus the standalone `AuditLog.tsx` and `Billing.tsx` pages all become sub-sections of one "Team & settings" area — likely still tabbed, but as properly separated components rather than one 1,481-line file. |

### Sales channels

| Channel | Nav item | Comes from | Notes |
|---|---|---|---|
| **Sellgram** (Telegram/MiniApp) | Orders | `pages/Orders.tsx` | `Order.salesChannel` (`docs/B2B_COUNTERPARTIES.md` §6) now distinguishes `TELEGRAM` from `B2B` orders on the same table — this page should filter to `TELEGRAM` explicitly once the field is consumed here, rather than implicitly showing "whatever's in the table" as it does today. |
| | Promo codes | `pages/PromoCodes.tsx` | Telegram/miniapp checkout-only today. |
| | Banners | `pages/Banners.tsx` | Miniapp-only today. |
| | Broadcasts | `pages/Broadcasts.tsx` | Telegram-only by nature (bot messages). |
| | Payment methods | `pages/PaymentMethods.tsx` | Configures `StorePaymentMethod` rows used by Telegram checkout (`checkout.service.ts`) — channel-specific, not shared with B2B (which settles via `CounterpartyLedger`, not `StorePaymentMethod` — `docs/B2B_COUNTERPARTIES.md`, the `createB2BOrder()` `MANUAL_TRANSFER` decision). |
| | Reviews | `pages/Reviews.tsx` | `OrderReview` submission today only happens from the miniapp order-status flow. |
| **POS** | Devices | *(none — net new)* | `POST /pos-devices`, activation-code display, device list — backend exists (`pos-sync/admin-routes.ts`), no UI at all. |
| | Sales & fiscal events | *(none — net new)* | Read-only view over `SaleEvent`/`FiscalEvent`/`ShiftEvent` — no admin endpoint even exists yet to list these for a UI to call (worth flagging as a backend prerequisite, not just a frontend gap). |
| **B2B / Опт** | Counterparties | *(none — net new)* | Full CRUD already built (`counterparty/routes.ts`) — list/detail/create/edit, exactly matching the backend's shape. |
| | Price lists | *(none — net new)* | `CounterpartyPrice` management, per counterparty (`GET/PUT/DELETE .../prices`). |
| | Orders | *(none — net new)* | `POST /counterparties/:id/orders` — needs its own creation form and detail view; **not** a reuse of the Sellgram `Orders.tsx` list, since B2B order creation is a manual multi-item form with price resolution (§4 of the B2B doc), structurally different from a Telegram cart checkout. |
| | Ledger & payments | *(none — net new)* | `GET .../ledger`, `POST .../payments`, `POST .../adjustments`, `PATCH .../ledger/:id/due-date` — a per-counterparty statement view plus the three write actions. |

### Not part of this IA at all

- `pages/Login.tsx`, `pages/OnboardingWizard.tsx` — pre-auth / first-run
  flows, not nav destinations; re-themed (§4) but not relocated.
- `pages/Help.tsx` — a utility page, not tied to Workspace or any
  channel; stays a top-level item outside both groupings.
- `pages/sys/*` (`SysLayout.tsx` and its ten sibling pages, 2,305 lines
  total) — the **system-admin console** at `/system-admin`, a
  cross-tenant superadmin tool with an entirely different audience from
  the rest of this IA. Explicitly out of scope for this redesign — see
  §9.

## 4. Branding changes

**Renamed:**
- Product/panel name: "Sellgram Admin" → "SBGCloud" wherever it appears
  as the app's own identity — `index.html` `<title>`, `index.html`
  favicon, `App.tsx`'s `Sidebar` logo (currently
  `Sell<span>Gram</span>` at line 127, plus the duplicate mobile-header
  wordmark at line 396), the `Login.tsx` screen, any meta tags.
- The existing green wordmark styling doesn't carry over as the app's
  own brand mark — see §2's palette note: green becomes the Sellgram
  *channel's* accent color (nav icon, badges) inside the new IA, not the
  whole product's color.

**NOT renamed, NOT touched:**
- `apps/miniapp` — the Telegram storefront a *customer* sees. It is a
  separate client application serving a different audience (shoppers,
  not the tenant's team) and keeps the Sellgram name and its own
  independent visual identity. Nothing in this plan applies to it.
- The backend API path `/api/store-admin/*` and module name
  `store-admin` — a naming mismatch with "SBGCloud" worth noting, but a
  backend rename is its own separate, riskier change (touches every
  route registration and any external integration relying on the path)
  and out of scope here.
- Tenant-facing bot/store names, `Store.name`, `Tenant.name` — those are
  the *tenant's own* branding for their shop, unrelated to SBGCloud's
  own product chrome.

## 5. Component library plan

Before migrating any page, these base components need to exist (all net
new except `Button`):

- **`Button`** — extend the existing `components/Button.tsx`, don't
  replace it. It already solves a real, specific problem (the
  synthetic-event bypass, §1) — a rewrite risks silently reintroducing
  that bug. Extend it with variant props (`primary`/`secondary`/`ghost`/
  `danger`) and size props, styled with the new tokens, keeping the
  existing `ref`/native-listener mechanism untouched.
- **`Card`** — the border-not-shadow container from §2; used everywhere
  `sg-card` (a CSS class referenced throughout the current pages, e.g.
  `Dashboard.tsx:336`) is used today.
- **`Table`** — a shared data-table shell (header, row, empty state,
  loading skeleton) to replace the hand-rolled `<table>` markup repeated
  across `Products.tsx`, `Orders.tsx`, `Customers.tsx`, `Stock.tsx`, etc.
  — this is the single highest-leverage component for shrinking the
  large page files in Phase 3, since table markup is a large fraction of
  each of them.
- **`Input`** / **`Select`** / form field wrapper — consistent
  label/error/help-text layout, replacing the inline-styled `<input>`s
  visible throughout `Settings.tsx` and `Products.tsx`.
- **`Sidebar`** — new, built for the two-level IA in §3 (Workspace
  section + Sales channels section, with per-channel icon/accent color
  per §2), replacing the flat single-list `Sidebar` function currently
  inline in `App.tsx` (lines 66-246).
- **`TopBar`** — currently there's only a *mobile* header
  (`sg-mobile-header`, `App.tsx:387-401`); desktop has no top bar at all,
  just the sidebar plus page content. The new layout needs a real
  persistent `TopBar` (breadcrumb/page title, user menu, language
  switcher) on both desktop and mobile, consolidating what's currently
  duplicated between the desktop `Sidebar` footer (language switcher,
  logout, `App.tsx:189-243`) and the mobile-only header.
- **`Badge`** / **`StatusPill`** — the current `.sg-pill` CSS class
  (seen in `Settings.tsx`'s tab buttons) generalized into a reusable
  component for order status, channel tags, etc.

None of these are built in this pass — this is the inventory for
Phase 1 (§7).

## 6. Routing migration

**Plan**: replace the hand-rolled `useRoute()`/`PageRouter` in `App.tsx`
with `react-router-dom` (needs adding as a dependency — not present
anywhere in the monorepo today, confirmed in §1).

Concretely:
- `useRoute()` (`App.tsx:34-43`) → `<BrowserRouter>` (decision below) +
  `useNavigate()` / `useLocation()`.
- `PageRouter`'s `switch` (`App.tsx:248-290`) → a `<Routes>` tree with
  one `<Route>` per page, each still lazy-loaded the same way (`lazy(()
  => import(...))` already used for every page except `Login`/
  `Dashboard`/`OnboardingWizard` carries over directly — React Router's
  lazy-loading story is compatible with existing `React.lazy` usage, no
  need to adopt Router's own data-loading APIs).
- `routePermMap` (`App.tsx:250-266`, a hardcoded object mapping route
  strings to permission keys) → becomes a `<ProtectedRoute
  requires="manageCatalog">` wrapper component or a route-level `loader`
  check, instead of the current pattern of falling back to rendering
  `<Dashboard />` in place when a permission is missing
  (`App.tsx:268` — arguably a UX bug already: a user without
  `manageOrders` who navigates to `/orders` silently sees the Dashboard
  with no explanation, rather than a "you don't have access" state or a
  redirect).
- The `/system-admin` special-case (`App.tsx:362`, checked *before* the
  authenticated-tenant check) stays structurally separate — it's its own
  router tree under `SysLayout`, not part of this migration (§9).

**Risk — the actual size of this migration**: the router swap itself is
mechanical and low-risk in isolation (one `switch` statement, one hook).
The real risk is the **7 files with direct `window.location.hash =`
writes** (§1) — every one of them needs to change to
`useNavigate()`/`<Link>` in the same pass, or they'll silently break
(writing to `location.hash` does nothing meaningful once the app no
longer reads that hash for routing). None of these are deep-linking
concerns for *external* users (this is an authenticated admin tool, not
publicly linked), but they are real in-app navigation that must keep
working. The `Dashboard.tsx` `'/orders?status=NEW'` case additionally
needs its target (`Orders.tsx`) to read a real query/search param
instead of whatever it does today with the hash (it does not appear to
actually parse that query string today — worth confirming during
migration whether that link ever worked as intended, or has been a
latent no-op).

**Decision: `<BrowserRouter>`.** `deploy/Dockerfile.admin` builds the
`apps/admin` static bundle and serves it from an `nginx:alpine` container
using `deploy/nginx-spa.conf`, whose `location /` block is:
```
try_files $uri $uri/ /index.html;
```
That's already a full SPA fallback — any path that isn't a real static
file falls through to `index.html`, which is exactly what
`<BrowserRouter>` needs to make client-side routes like `/products` or
`/settings` work on a hard refresh or direct navigation. No
infrastructure change is required to adopt it. `<HashRouter>` would have
been the fallback only if this SPA rewrite weren't already in place —
it isn't needed here.

## 7. Phased rollout plan

### Phase 1 — Foundation (no visible change)

- Write `tailwind.config.js` theme tokens from §2.
- Build the component inventory from §5.
- Add `react-router-dom`, migrate `App.tsx`'s routing (§6) including all
  7 hash-writing call sites.
- Existing pages render exactly as they do today, just routed
  differently and now able to `import` the new components (not required
  to yet). This phase is verifiable by "nothing looks different, nothing
  is broken" — the actual acceptance bar for this phase.

### Phase 2 — New shell (visible immediately, page internals untouched)

- Ship the new `Sidebar` (two-level IA from §3) and `TopBar` (§5) as the
  layout wrapping every existing page.
- Existing pages (`Products.tsx`, `Settings.tsx`, etc.) still render
  their current internals unchanged inside the new shell — visually
  jarring in isolation (new chrome, old content) but that's expected and
  temporary; it's what makes Phase 3 safe to do incrementally rather than
  as one big-bang cutover.
- `Settings.tsx`'s `loyalty` tab extraction (§3) likely belongs here or
  at the start of Phase 3 — it's the one place where the new nav
  *requires* content to actually move, not just be re-skinned.

### Phase 3 — Page migration (incremental, page by page or in small groups)

- Migrate pages onto the new component system, splitting large files as
  part of the same change (not deferred) — per the original brief's
  explicit instruction. Suggested order, largest/highest-value first:
  1. `Settings.tsx` (1,481 lines → split into its now-separated
     Workspace/"Team & settings" sub-pages, per §3's table).
  2. `Products.tsx` (1,130 lines → extract table, filters, and the
     product-edit form into separate components using the new `Table`/
     `Input` components from §5).
  3. Remaining Workspace pages (`Stock`, `Procurement`, `Suppliers`
     consolidation; `Dashboard`; `Reports`; `AuditLog`; `Billing`).
  4. Sellgram-channel pages (`Orders`, `PromoCodes`, `Banners`,
     `Broadcasts`, `PaymentMethods`, `Reviews`) — mostly re-skins, since
     they're already channel-specific in content.
  5. **Build POS and B2B channel screens from scratch** (§3) — these
     have no legacy to migrate, so they should be built directly against
     the Phase 1 component library, serving as the first "reference
     implementation" of the new system with zero legacy debt to work
     around.

## 8. Risks

- **The 7 direct hash-write call sites (§6)** — the concrete, enumerated
  risk, not a vague "routing might break" concern. Each one is a
  specific line in a specific file that must be updated in the same
  change as the router swap.
- **`Settings.tsx`'s single `Promise.all` data-fetch** (`Settings.tsx:89`)
  fetches all seven tabs' data on mount regardless of which tab is
  active. Splitting it into separate pages (§7 Phase 3) should *improve*
  load performance (each new page fetches only its own data) but is a
  behavior change worth calling out — if any tab's data-fetch has a
  side effect beyond populating that tab's own state (not confirmed
  either way without reading the full 1,481 lines), splitting could
  change timing.
- **No deep-linking/bookmark risk to *external* users** — this is an
  authenticated internal tool; nobody outside the team bookmarks
  `#/products`. The realistic risk is **muscle memory** — existing team
  members used to typing/expecting certain hash paths. `<BrowserRouter>`
  (§6) only partially preserves that memory: the same paths still work
  (`/products`, `/settings`), just without the `#/` prefix — a small,
  one-time adjustment, not a full relearning.
- **The `Button.tsx` synthetic-event workaround** (§1, §5) — a real fix
  for a real "dual-React issue in pnpm monorepo." Any component-library
  rewrite that doesn't preserve this exact mechanism risks reintroducing
  whatever bug it was fixing, silently, since nothing in the test suite
  today appears to specifically guard against it (worth confirming, not
  assumed).
- **i18n regressions**: every migrated page must keep calling
  `useAdminI18n()`'s `t()`/`tr()` for its strings — a redesign pass that
  copies English/Russian text as new hardcoded JSX strings instead of
  routing them through the existing i18n hook would silently break the
  Uzbek translation for that page.

## 9. What this does NOT change

- **`apps/miniapp`** — untouched, not renamed, not redesigned (§4).
- **Backend API contracts** — nothing in `apps/api` changes. This is a
  frontend-only redesign; every existing `/api/store-admin/*` endpoint
  keeps its current shape. (POS and B2B need a handful of *new*
  read-oriented endpoints to power their new screens — e.g. a
  fiscal/sale-events listing for the POS channel §3 notes doesn't exist
  yet — but that is new backend surface for a future session, not a
  change to anything existing.)
- **The existing granular-permission system** — `manageCatalog`,
  `manageOrders`, `manageB2B`, etc. (`apps/api/src/plugins/
  permission-guard.ts`) are consumed as-is; the routing migration (§6)
  changes *how* a missing permission is handled at the routing layer
  (redirect/guard instead of silent Dashboard fallback), not the
  permission model itself.
- **`pages/sys/*` / the system-admin console** — a different product for
  a different audience (cross-tenant superadmin), already structurally
  separate (`/system-admin`, its own `SysLayout`). Not part of this IA,
  not restyled by this plan. If SBGCloud branding should extend there
  too, that's a deliberate follow-up decision, not an accidental
  omission.
- **`Tenant.name` / `Store.name` / bot branding** — the tenant's own
  identity for their shop is unrelated to SBGCloud's product chrome
  (§4).

## 10. Recommended starting point for next session

Start Phase 1, in this order, each independently verifiable:

1. Write `tailwind.config.js` theme tokens (§2) — additive, doesn't touch
   any page, `pnpm build` should be a no-op diff for every existing page
   since nothing consumes the new tokens yet.
2. Add `react-router-dom`, use `<BrowserRouter>` (§6 — the existing
   `deploy/nginx-spa.conf` SPA fallback already supports it, no
   infrastructure change needed), migrate `App.tsx`'s routing including
   the 7 hash-write call sites (§6) — verify with the existing pages
   rendering unchanged.
3. Build `Button` (extended), `Card`, `Table`, `Input`/`Select`, `Badge`
   (§5) as standalone components, unused by any page yet — verify each
   in isolation (e.g. a throwaway Storybook-less test route, or just by
   temporarily mounting one in `Dashboard.tsx` and reverting) before
   Phase 2 starts consuming them in the real `Sidebar`/`TopBar`.
