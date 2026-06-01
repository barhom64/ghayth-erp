# VISIBILITY_RECONCILIATION_MATRIX

Agent 7 sweep — RBAC / visibility consistency across the three sources of
truth:

1. `artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx`
   (frontend filter — `minRoleLevel`, `perm`, `permMode`)
2. `artifacts/api-server/src/routes/index.ts`
   (mount-level guards — `requireMinLevel`, `requireModule`,
   `requirePermission`)
3. `artifacts/api-server/src/lib/rbac/featureCatalog.ts` +
   `artifacts/api-server/src/lib/rbacCatalog.ts`
   (canonical feature → permission map and legacy PERMISSIONS list)

Every sidebar entry that declares a `minRoleLevel` or `perm` is listed
below with its backend counterpart. Per-route `authorize()` calls inside
each router still provide fine-grained checks; the mount-level
columns capture only the floor enforced before that per-route layer
runs.

## Reconciliation matrix

| # | Sidebar entry | Sidebar level | Sidebar perm | Backend mount level | Backend authorize feature(s) | Diff? | Fix |
|---|---------------|---------------|--------------|---------------------|------------------------------|-------|-----|
| 1 | `/calendar` | 20 | — | (none) | `projects:list` | leak via URL | tighten mount to `requireMinLevel(20)` |
| 2 | `/manager-board` (frontend) | 40 | — | — (frontend route) | — | n/a | — |
| 3 | `/exec-dashboard` | 70 | — | 70 (`requireMinLevel(70)`) | — | aligned | none |
| 4 | `/action-center` | 20 | — | (none) | `dashboard.action_center:view` | leak via URL | tighten mount to `requireMinLevel(20)` |
| 5 | `/operations-center` | 40 | — | 40 (`requireMinLevel(40)`) | per-route | aligned | none |
| 6 | `/obligations` | 30 | — | (none) | `projects:list/create` | leak via URL | tighten mount to `requireMinLevel(30)` |
| 7 | `/communications` (mgmt children) | 40 | — | (none, module gate only) | `communications:list/create/update/delete` | leak via URL | tighten mount to `requireMinLevel(40)` |
| 8 | `/legal/cases` | 40 | — | (none, module gate only) | per-route on `legal.*` | leak via URL | tighten mount to `requireMinLevel(40)` |
| 9 | `/governance/policies` | 60 | — | (none, module gate only) | per-route on `governance` | leak via URL | tighten mount to `requireMinLevel(60)` |
| 10 | `/daily-close` (frontend) | 40 | — | — (frontend-only route) | — | n/a | — |
| 11 | `/bi` | 40 | — | (none, module gate only) | per-route on `bi` | leak via URL | tighten mount to `requireMinLevel(40)` |
| 12 | `/admin` | 90 | various `admin:*`, `admin.roles:*` | 90 (`requireMinLevel(90)`) | per-route on `admin`, `admin.roles`, `admin.audit`, `admin.pdpl` | aligned | none |
| 13 | `/automation` | 60 | `admin:update` ∨ `automation:write` | (none, module gate only) | per-route on `admin` (list/update) | broken perm + leak via URL | drop `automation:write` (not in catalog) + tighten mount to `requireMinLevel(60)` |
| 14 | `/reports/scheduled` | 50 | `bi:read` ∨ `reports:read` | 50 (`requireMinLevel(50)`) | per-route | aligned | none |
| 15 | `/reports/print-log` (frontend) | 40 | `print_jobs:read` | — (consumes `/print/jobs`) | `print_jobs:read` | aligned | none |
| 16 | `/manager-board/reprint-approvals` (frontend) | 40 | `print:reprint:approve` | — (consumes `/print/reprint-requests`) | `print:reprint:approve` | aligned | none |
| 17 | `/settings` (+ children) | 70 | `settings:write`, `audit:read`, `templates:read` | 70 (`requireMinLevel(70)`) | per-route | aligned | none |
| 18 | `/audit-logs` (no sidebar entry — only inside `/admin/logs` and `/settings/audit-log`) | inherits 90 | `audit:read` | 90 + `requirePermission("audit:read")` | per-route | aligned | none |

## 1. Sidebar shows but backend allows lower level (sidebar-only gate)

The sidebar filters these out by `minRoleLevel`, but the backend
mount does NOT enforce a floor at the same level — so a user below
the floor who guesses or bookmarks the URL hits the per-route
guards directly (or, for routes with weaker per-route gates, gets
data they shouldn't see in the menu).

| Path | Sidebar floor | Backend floor before fix | Risk |
|------|--------------:|-------------------------:|------|
| `/calendar` | 20 | — | level-10 (anonymous-employee-floor) users could call `GET /api/calendar/upcoming` directly |
| `/action-center` | 20 | — | same |
| `/obligations` | 30 | — | level-10/20 users could enumerate obligations |
| `/communications` (manage children) | 40 | module-only | non-managers can hit `GET /api/communications/log` if they have the comms module |
| `/legal/cases` | 40 | module-only | same risk for legal module |
| `/governance/policies` | 60 | module-only | same risk for governance module |
| `/bi` | 40 | module-only | analytics surface |
| `/automation` | 60 | module-only | automation surface |

**Fixed** by adding `requireMinLevel(N)` to each mount in
`routes/index.ts`.

## 2. Sidebar hides but backend allows everyone

None found. The few mount-level guards that don't have a sidebar
counterpart (`/audit-logs` permission, wiring-stubs floor) already
match or exceed any sidebar-equivalent gating.

## 3. Sidebar perm doesn't exist in featureCatalog

Permissions referenced by `perm` strings in the sidebar that are
not present in either `FEATURE_PERMISSIONS` (derived from
`featureCatalog`) or the legacy `PERMISSIONS` list in
`rbacCatalog.ts`:

| Sidebar perm | Used at | Status |
|--------------|---------|--------|
| `automation:write` | `/automation` entry, الأتمتة | **broken — no such permission exists in either catalog**; backend uses `admin:update`. **Fix**: drop the bad perm, keep `admin:update` as the sole gate. |

All other perm strings resolve cleanly:

- `admin:list`, `admin:update`, `admin:view`, `admin:read` — first three
  via `FEATURE_PERMISSIONS` (admin feature, ALL_ACTIONS); last via
  legacy `PERMISSIONS` list.
- `admin.roles:view`, `admin.roles:update` — via `FEATURE_PERMISSIONS`
  (admin.roles feature).
- `audit:read` — legacy `PERMISSIONS`.
- `hr:approve` — legacy `PERMISSIONS`.
- `settings:write`, `templates:read` — legacy `PERMISSIONS`.
- `bi:read`, `reports:read` — legacy `PERMISSIONS`.
- `print_jobs:read`, `print:reprint:approve` — legacy `PERMISSIONS`
  (Print Engine v2 seed).

## 4. Backend authorize() uses a feature key not in catalog

None found. All `authorize({ feature: "..." })` calls inside the
routers in scope resolve to keys present in `FEATURE_CATALOG`
(spot-checked: `dashboard.action_center`, `projects`,
`hr.recruitment`, `communications`, `admin`, `admin.roles`,
`finance.*`, etc.).

## Summary

- 8 sidebar→backend level-floor mismatches (rows 1, 4, 6, 7, 8, 9,
  11, 13 above) — fixed by adding `requireMinLevel` to mounts.
- 1 broken sidebar `perm` reference (`automation:write`) — fixed by
  dropping it; backend per-route `admin:update` remains the
  authoritative gate.
- 0 backend mounts looser-than-sidebar that aren't a level-floor
  fix above.
- 0 missing feature-catalog keys.
