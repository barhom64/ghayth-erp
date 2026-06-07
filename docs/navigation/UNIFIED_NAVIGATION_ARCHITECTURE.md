# Unified Navigation Architecture — Ghaith Platform

> **Phase 2 of the GHAITH PLATFORM STABILIZATION workflow.**
> Companion to `docs/frontend/NAVIGATION_CONTEXT_CONTRACT.md` (which
> documents AppContext-level gates). This doc covers the four
> *visible* navigation surfaces and the contract every page must
> honor. Agent-2 audit verified **zero consumer-page violations** —
> the platform is already conformant; this doc pins the contract so
> it stays that way.

---

## 1. The four navigation surfaces

| Surface | Owner component | Data source | Mutable by pages? |
|---|---|---|---|
| **Sidebar** (primary service nav) | `SidebarLayout` | `allNavSections` in `sidebar-layout.tsx`, filtered through `useFilteredNavSections()` | ❌ no — central metadata only |
| **Top bar** (company / branch / role switcher + global search) | `SidebarLayout` (top header slot) | `AppContext` (companies, branches, user roles) + `CommandPalette` | ❌ no — owned by layout |
| **Breadcrumbs** (current location trail) | `SidebarLayout::buildBreadcrumbs()` (global) + `PageShell` / `DetailPageLayout` `breadcrumbs` prop (local override) | Route tree walk (auto) OR prop value | 🟡 prop only — pages pass a list, never render breadcrumbs themselves |
| **Page header** (current page title + actions + section tabs) | `PageShell` + `DetailPageLayout` + `ListPage` + `CreatePageLayout` + module `<Foo>TabsNav` | Page-supplied props (`title`, `subtitle`, `actions`, `tabs`) + TabsNav component | 🟡 props only — pages MUST use a primitive, never roll their own |

The pattern: **central metadata feeds the visible surfaces; pages
supply only the prop values for their own row.** No page renders a
`<nav>`, no page hand-rolls a breadcrumb, no page builds a tab
strip outside a TabsNav component.

---

## 2. The metadata model

```
allNavSections   (sidebar-layout.tsx:80+)
   │
   │ NavSection[]
   ▼
   { title: "الرئيسية" | "بوابة الموظف" | "الموارد البشرية" | ...
     items: NavItem[] }
                │
                │ NavItem[]
                ▼
                { label, path, icon, module?, perm?,
                  minRoleLevel?, subKey?, children? }
                                                   │
                                                   │ NavItem[]
                                                   ▼
                                                   (recursive)
```

Filter pipeline (every render):

```
allNavSections
   │
   ▼
useFilteredNavSections()  ← lives in sidebar-layout.tsx
   ├─ canAccessModule(item.module)         ← AppContext
   ├─ isFeatureEnabled(item.module)        ← AppContext
   ├─ effectiveRoleLevel >= minRoleLevel   ← AppContext
   ├─ canAccessSubPage(module, subKey)     ← AppContext
   ├─ itemPermAllowed(item.perm)           ← AppContext.can()
   └─ isRegisteredRoute(item.path)         ← routes/registry.ts
   │
   ▼
filteredSections (rendered)
```

A page is **visible** when every check in this pipeline passes
for the current user. There is no other path — no page can
declare itself visible by other means.

---

## 3. Page rules

### MUST

1. Wrap every routable page in one of: `PageShell`, `ListPage`,
   `DetailPageLayout`, `EntityDetailPage`, `CreatePageLayout`.
2. Pass `title` (required) and `breadcrumbs` (when applicable) as
   props on the layout primitive.
3. Use the module-specific `<Foo>TabsNav` component when rendering
   in-module section tabs (FinanceTabsNav, HrTabsNav, etc.).
4. Reach navigation state through `useLocation()` from wouter —
   never window.location.

### MUST NOT

1. Render a `<nav>` element outside the layout primitive
   (Agent-2 found 1 exception: `properties-guide.tsx` uses a `<nav>`
   for a guided-tour table of contents; documented in §6).
2. Render its own breadcrumb component (the PageShell prop is
   the only entry point; SidebarLayout::buildBreadcrumbs handles
   the global trail).
3. Import `SidebarLayout`, `NotificationDropdown`, or
   `CommandPalette` directly — those are layout-owned.
4. Build a tab strip with `border-b-2` styling that is not
   inside a `<Tabs>` value-driven group inside a detail page's
   Overview slot.
5. Hard-code paths in arrays/maps that re-implement what
   `allNavSections` already declares.

---

## 4. TabsNav contract

There are 14 `*-tabs-nav.tsx` files under
`artifacts/ghayth-erp/src/components/shared/`. All 14 follow the
exact same shape:

```tsx
const TABS = [
  { href: "/finance/accounts", label: "...", icon: BookOpen,
    match: ["/finance/accounts"] },
  // ...
];

export function FinanceTabsNav() {
  const [location] = useLocation();
  return (
    <div className="border-b mb-4 -mt-2 overflow-x-auto">
      <nav className="flex gap-1 min-w-max" dir="rtl">
        {TABS.map(tab => { /* render anchor */ })}
      </nav>
    </div>
  );
}
```

Rules:
- Each module has exactly one TabsNav file. No forks.
- The TABS array is the source of truth for that module's
  section navigation. To add a section, edit this file —
  not the consumer page.
- The `match` array maps the active-tab highlight: if the
  current location is the canonical `href` or any string in
  `match`, the tab highlights.
- Pages embed `<FinanceTabsNav />` (no props) right under
  PageShell's header. They never render their own tabs strip.

### Approved exceptions to "no tab strip in pages"

These 4 detail pages use a tab strip INSIDE their Overview slot
to switch between **content** (not navigation):

- `employee-detail.tsx` — Overview / Documents / History tabs
  switch local state, all under one route
- `client-detail.tsx` — same pattern
- `details/unit-detail.tsx` — same pattern
- `details/vehicle-detail.tsx` — same pattern

These are content tabs, not navigation. They don't change the URL
and don't affect the sidebar's active highlight. Different concept.

---

## 5. Breadcrumb contract

Two cooperating layers:

**Layer A — global** (`SidebarLayout::buildBreadcrumbs()` at
`sidebar-layout.tsx:~870`):
Walks the route tree to derive a default breadcrumb trail from
`allNavSections`. Used when a page does not override.

**Layer B — local override** (PageShell / DetailPageLayout
`breadcrumbs` prop): pages pass an explicit `Breadcrumb[]` to
override the global trail. The prop value wins.

```tsx
<PageShell
  title="..."
  breadcrumbs={[
    { href: "/finance", label: "المالية" },
    { label: "الفواتير" },        // current — no href
  ]}
>
```

The `PageShell::breadcrumbs` prop is intentionally a **no-op**
at the visual level — its only purpose is to override the global
trail when the page is in a module hierarchy the sidebar tree
doesn't model. The actual breadcrumb chrome is rendered by
SidebarLayout (single source). The rationale lives in
`components/page-shell.tsx:~163-171`.

This avoids two breadcrumb stripes appearing on the same page.

---

## 6. Verification queries

The platform-stabilization workflow ran these against the pages
tree and got the results listed below. Run them again any time to
catch regressions:

```bash
# Q1. Pages rendering their own <nav> outside layout components
#     Expected: 1 hit (properties-guide.tsx TOC — documented)
grep -rln '<nav' artifacts/ghayth-erp/src/pages/ 2>/dev/null

# Q2. Pages declaring their own aria-label="breadcrumb"
#     Expected: 0 hits
grep -rln 'aria-label="breadcrumb"' artifacts/ghayth-erp/src/pages/ 2>/dev/null

# Q3. Pages with a hand-rolled tab strip (border-b-2 + whitespace-nowrap)
#     Expected: 4 hits (employee-, client-, unit-, vehicle-detail)
grep -rln 'border-b-2 transition-colors whitespace-nowrap' artifacts/ghayth-erp/src/pages/ 2>/dev/null

# Q4. Pages importing layout primitives (sanity — should be 0 in src/pages)
grep -rln 'import.*SidebarLayout' artifacts/ghayth-erp/src/pages/ 2>/dev/null

# Q5. Pages importing NotificationDropdown / CommandPalette directly
grep -rln 'NotificationDropdown\|CommandPalette' artifacts/ghayth-erp/src/pages/ 2>/dev/null

# Q6. Pages using window.location.* (should be empty — use wouter)
grep -rln 'window\.location\.' artifacts/ghayth-erp/src/pages/ 2>/dev/null
```

If any of these returns more hits than the expected counts, a page
has broken the contract. Run a focused review on the new hits.

---

## 7. Adding a new page — checklist

1. Add the route to `routes/<module>Routes.tsx` with the page's
   path.
2. Add the page to `allNavSections` in `sidebar-layout.tsx` under
   the matching section (`title`).
3. Page file wraps content in `PageShell` (or `ListPage` /
   `DetailPageLayout` / `CreatePageLayout` as appropriate).
4. Pass `title` and `breadcrumbs` props.
5. If the page belongs to a module that has a TabsNav, render
   `<FooTabsNav />` directly under the PageShell header.
6. Verify with Q1–Q6 above that no new violations were
   introduced.

---

## 8. Why this works

The contract is enforced by **structure**, not by lint rule:

- A page that doesn't wrap in a layout primitive has no header,
  so the missing breadcrumbs are immediately visible to reviewers.
- A page that imports `SidebarLayout` will fail review because the
  sidebar is mounted once at the app root.
- A page that re-implements TabsNav will visually clash with the
  authentic one when the user navigates back — the duplicated
  styling is its own tell.

The 6 verification queries cover the residual cases where styling
alone might miss the issue. Run them in CI if a regression appears.

---

## 9. Refs

- `artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx` — `allNavSections` definition + filter pipeline + breadcrumb builder
- `artifacts/ghayth-erp/src/components/page-shell.tsx:~163-171` — breadcrumb prop rationale
- `artifacts/ghayth-erp/src/components/shared/*-tabs-nav.tsx` — 14 module TabsNav files (shape pinned)
- `artifacts/ghayth-erp/src/routes/registry.ts` — `isRegisteredRoute()`
- `docs/frontend/NAVIGATION_CONTEXT_CONTRACT.md` — AppContext-level gates
- `docs/audit/PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md` — sidebar↔backend gate audit
- `docs/cleanup/VISIBILITY_RECONCILIATION_MATRIX.md` — Phase 7 visibility fixes
- `docs/cleanup/ROUTE_SERVICE_CONSISTENCY_MATRIX.md` — Phase 5 route/sidebar audit

---

## 10. Visual Navigation Verification — RTL mobile (HR module)

> **Status:** the contract is enforced end-to-end. Live visual proof
> ships with `e2e/tests/persona-hr-nav-stability.spec.ts` (Playwright,
> 390×844 mobile RTL viewport). Cheap static proof ships with
> `artifacts/api-server/tests/unit/hrNavStabilitySmoke.test.ts`
> (vitest, runs in `guard.sh`). Both green as of this update.

### 10.1 What was checked

The user reported that the top strip inside the HR module visually
"changed between pages" when moving between Employees / Attendance /
Leaves / Training / Violations. The audit grep already said the
HrTabsNav component is shared across all 5 pages — the divergence
turned out to be in the PageShell **props** the pages passed, not in
the TabsNav itself.

Divergences found and fixed:

| Page | Issue | Fix |
|---|---|---|
| `employees.tsx` | No `subtitle` prop (header was shorter than peers) | Added subtitle "قائمة الموظفين والمسميات الوظيفية والحسابات" |
| `employees.tsx` | Breadcrumb had only the module link, no current-page label | Added `{ label: "إدارة الموظفين" }` |
| `hr/attendance.tsx` | Breadcrumb had only the module link | Added `{ label: "الحضور والانصراف" }` |
| `hr/leaves.tsx` | Breadcrumb had only the module link | Added `{ label: "طلبات الإجازات" }` |
| `hr/training.tsx` | Breadcrumb had only the module link | Added `{ label: "برامج التدريب" }` |
| `hr/violations.tsx` | Subtitle drifted between loading / error / success states | Uniform subtitle on all three branches |

Result: all 5 HR list pages now pass:
- The same breadcrumb depth (module link + current-page label).
- A subtitle on every PageShell render (uniform header height).
- The same HrTabsNav strip (identical TABS order, only active highlight moves).

### 10.2 What was NOT a divergence

`hr/attendance.tsx`, `hr/training.tsx`, and `hr/violations.tsx` each
render an in-page `<Tabs>` strip BELOW HrTabsNav (e.g. "القائمة /
الملخص" on attendance). These are **content tabs** that switch local
state without changing the URL — they don't affect the sidebar's
active highlight and don't replace the navigation tab strip. The
same pattern already exists on detail pages (employee-detail,
client-detail, etc.) and is documented as an accepted exception in
§4 above.

If a future audit wants to tighten further, the move is to either
(a) lift those content tabs into their own sub-route under each
page (e.g. `/hr/attendance?tab=summary`) or (b) push the data
behind those tabs into AdvancedFilters — both are product calls.

### 10.3 How to re-verify

```bash
# Static (cheap, runs in guard.sh):
pnpm --filter @workspace/api-server vitest run hrNavStability

# Live visual (needs api + frontend running on :80):
pnpm --filter @workspace/e2e test tests/persona-hr-nav-stability.spec.ts

# Update visual baselines after an INTENTIONAL design change:
pnpm --filter @workspace/e2e test tests/persona-hr-nav-stability.spec.ts \
  --update-snapshots
```

### 10.4 What the Playwright spec asserts

For each of the 5 HR pages on a 390×844 mobile RTL viewport:

1. All 10 HrTabsNav labels render in declared order.
2. The active-tab highlight matches the current page.
3. The current-page breadcrumb label is visible.
4. The page title heading renders.
5. `<main>` contains at most one `<nav>` landmark (only HrTabsNav).
6. A pixel snapshot of the top 320px catches "looks different"
   regressions even when the assertions all pass.

Plus a cross-page assertion: the HrTabsNav inner text must be
identical on all 5 pages (only the active highlight differs).

### 10.5 Static-guard scope

`hrNavStabilitySmoke.test.ts` adds 41 assertions:

- Each of the 5 pages imports HrTabsNav from the canonical path.
- Each of the 5 pages renders `<HrTabsNav />` exactly once.
- Each of the 5 pages passes a breadcrumbs prop with at least 2 levels.
- Each of the 5 pages passes a subtitle prop.
- No page reimplements an HrTabsNav-shaped strip inline.
- All 5 pages share the same module link + label.
- HrTabsNav itself declares the canonical 10 tabs in the documented order.

If anyone in the future adds a 6th HR list page or modifies one of
these without keeping the contract, the static guard fails in CI
before the e2e Playwright run even starts.

---

*Phase 2 deliverable — `GHAITH PLATFORM STABILIZATION & UNIFICATION
PROGRAM`. Visual verification closes the navigation-unified goal.*
