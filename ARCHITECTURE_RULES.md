# Architecture Rules

These rules are mandatory for all product and engineering work in this project.

## 1. Modularity First

- The platform must be built as independent domain modules.
- Suggested domain boundaries:
  - `system-admin`
  - `tenant-admin`
  - `store`
  - `catalog`
  - `orders`
  - `payments-integration`
  - `notifications`
- Cross-module access must happen through explicit contracts (API/service interfaces), not hidden coupling.
- Avoid "god modules" that combine unrelated responsibilities.

## 2. Explicit Separation of Admin Roles

Two admin levels are required and must stay separate:

- **Global Administrator (Platform Admin)**
  - Manages platform-level entities and governance.
  - Has no direct ownership of day-to-day store operations.
- **Tenant/Store Administrator (Owner/Manager)**
  - Manages own tenant/store setup, catalog, team, and operations.
  - Has no access to platform governance data.

Implementation rules:

- Separate modules, routes, policies, and UI surfaces for each admin level.
- Separate authentication/authorization scopes.
- No implicit privilege inheritance between these two admin domains.

## 3. Settings Must Be Segregated by Scope

Settings must be split by responsibility:

- **System Settings** (platform-wide)
- **Tenant/Store Settings** (tenant- or store-scoped)

Rules:

- Store settings cannot modify system settings.
- System settings cannot silently override tenant settings without explicit policy.
- Every setting must declare its scope and owner.

## 4. Financial Boundary Policy

The platform is a technology provider, not a financial operator.

- We provide tools, workflows, and integrations.
- We do **not** participate in financial transactions as a principal party.
- Financial responsibility remains with the store/merchant and their payment provider(s).
- Product copy, legal pages, and support responses must reflect this boundary clearly.

## Enforcement

- New features must declare:
  - domain module
  - role access scope
  - settings scope
  - financial boundary impact
- Pull requests that violate these rules must not be merged until corrected.
