# NAVIGATION_DUPLICATE_INVENTORY

> **UX Navigation Governance wave — SLICE 1 (DOCS-ONLY inventory).**
> Branch: `claude/ux-nav-governance-inventory` · Date: 2026-06-16
> **No application code, routes, navigation, permissions or logic were changed in this slice.**
> This document audits the navigation surfaces and tabulates every duplicate / confusing / non-standard name so that Slice 2+ can fix them safely.

---

## 0. Binding principles (the wave's hard rules)

1. `navigation.registry.ts` stays the **single source of truth**. No alternative menu.
2. No route deleted or broken.
3. Create / edit / detail pages must **not** appear in menus or tabs except by a documented exception.
4. Each function has **ONE** official Arabic name + **ONE** official path. Alias names are search-only.

---

## 1. Surfaces audited

| Surface | File | Notes |
|---|---|---|
| Canonical menu | `artifacts/ghayth-erp/src/components/layout/navigation.registry.ts` (1091 lines) | `allNavSections` — the only menu tree. |
| Filter pipeline + quick-actions + page-title | `artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx` | `useFilteredNavSections` (filter), `pageQuickActions` (L480–685), `getPageTitle` (L462–468). |
| In-page tab bars (15) | `artifacts/ghayth-erp/src/components/shared/*-tabs-nav.tsx` | allocation, bi, crm, finance, fleet, fleet-telematics, hr, legal, projects, property, store, support, transport, umrah, warehouse. |
| Page header titles | `PageShell title=` / `<h1>` inside `artifacts/ghayth-erp/src/pages/**` | Sampled; the systematic mismatch is structural — see §2.5. |
| Route table | `artifacts/ghayth-erp/src/App.tsx` + `src/routes/*.tsx` + `src/routes/registry.ts` | redirect helper: `src/components/shared/redirect-to.tsx`. |

### Structural fact #1 — the header title is NOT independent of the menu

`sidebar-layout.tsx` `getPageTitle()` (L462–468) walks `allNavItems` and returns the **menu label** of the nav node matching the current location. So for any path that exists in the registry, **the header chip text == the menu label by construction**. This means problem-class **#5 (menu label != page title)** cannot occur for registry-registered destinations *in the header chip*. It DOES occur between the menu label and the **in-page `PageShell` title** that pages render themselves (a second, independent title). Both are user-visible. See §2.5.

### Structural fact #2 — tabs use distinct routes, never `?tab=`

All 15 `*-tabs-nav.tsx` files render `<Link href="/distinct/route">` per tab (active state via an `exact` flag or a `match[]` prefix array). None use `?tab=` query params. So every tab is its own route and is independently cross-checkable against the route table. (The registry, by contrast, *does* use `?tab=` for some entries, e.g. `/module-dashboards?tab=hr`, `/hr/violations?tab=memos`.)

---

## 2. Findings by problem class

Severity key: **high** = user-facing wrong destination / dead-ish / English in core nav; **med** = same function two names (confusing but both work); **low** = cosmetic wording drift.
Disposition key: **SAFE** = rename/realign with no owner call needed; **OWNER** = needs an owner decision (which name/path is canonical, or whether to retire a page).

### 2.1 Class 1 — Same path, more than one label (menu vs tab vs page-title vs quick-action)

| # | Path | Menu label (registry) | Tab label | Page `PageShell` title | Quick-action label | Proposed canonical AR | Sev | Disp |
|---|---|---|---|---|---|---|---|---|
| 1.1 | `/finance/cfo-cockpit` | لوحة المدير المالي | — | **لوحة المدير المالي اليومية (CFO Cockpit)** | — | **لوحة المدير المالي** | high | SAFE |
| 1.2 | `/hr/attendance` | السجل اليومي (child) / النشاط والحضور (group) | الحضور | (page title) | — | السجل اليومي | low | OWNER |
| 1.3 | `/finance/expenses` | المصروفات | المصروفات | — | **مصروف جديد** (action, OK) | المصروفات | low | SAFE |
| 1.4 | `/employees` | قائمة الموظفين (child) / الموظفون (group) | الموظفون | (page title) | — | الموظفون | low | SAFE |
| 1.5 | `/hr/violations` | نظرة عامة على المخالفات (child) / الامتثال والجزاءات (group) | المخالفات | — | — | المخالفات | med | OWNER |
| 1.6 | `/finance/tax` | نظام الضرائب | الزكاة والضريبة | — | — | الزكاة والضريبة | med | OWNER |
| 1.7 | `/finance/dimensional-routing` | التوجيه البُعدي | **التأصيل المالي** | — | — | التوجيه البُعدي | med | OWNER |
| 1.8 | `/properties` | الوحدات العقارية | الوحدات | — | وحدة جديدة | الوحدات العقارية | low | SAFE |
| 1.9 | `/fleet/telematics/video-evidence` | أدلة الفيديو | **جلسات الفيديو** | — | — | أدلة الفيديو | low | SAFE |
| 1.10 | `/properties/sales` | المبيعات العقارية | **بيع العقارات** | — | — | المبيعات العقارية | low | SAFE |
| 1.11 | `/fleet/transport/service-lines` | طابور تسعير بنود النقل | **أوامر الفوترة** | — | — | طابور تسعير بنود النقل | med | OWNER |
| 1.12 | `/fleet/transport/rules` | قواعد استقبال النقل | قواعد الاستقبال | — | — | قواعد استقبال النقل | low | SAFE |

> Note: the recurring "group label vs leaf label" rows (1.2, 1.4, 1.5) come from the registry pattern where a sub-group leader points at the same path as its first child but carries a *cluster* label. Header chip shows the **leaf** label (longest match). These are mostly acceptable-by-design but listed for owner awareness.

### 2.2 Class 2 — Same label pointing to different paths

| # | Label | Paths it points to | Where | Sev | Disp |
|---|---|---|---|---|---|
| 2.1 | **لوحة التحكم** | `/dashboard`, `/module-dashboards?tab=fleet`, `/module-dashboards?tab=warehouse`, `/module-dashboards?tab=store`, `/module-dashboards?tab=crm`, `/module-dashboards?tab=support` | registry (≥6 entries) | med | OWNER |
| 2.2 | **التقارير** | `/finance/reports`, `/fleet/reports`, `/warehouse/reports/accuracy`, `/umrah/reports`, `/bi/reports`, `/properties/occupancy-report` (tab) | registry + tabs | low | OWNER |
| 2.3 | **نظرة عامة** | `/legal`, `/governance`, `/properties/dashboard`, `/bi` (tab) | registry + tabs | low | SAFE |
| 2.4 | **المدفوعات** | `/finance/payments`, `/umrah/payments`, `/properties/payments` | registry | low | SAFE |
| 2.5 | **الموردون / الموردين** | `/finance/vendors`, `/warehouse/suppliers` | registry + tabs | low | OWNER |
| 2.6 | **استيراد البيانات** | `/umrah/import`, `/admin/data-import` | registry | low | SAFE |
| 2.7 | **سجل المراجعة** | `/admin/logs`, `/settings/audit-log` | registry | med | OWNER |
| 2.8 | **التأمين / التنبيهات / المخالفات** | fleet vs umrah vs hr namespaces (`/fleet/...` vs `/umrah/...` vs `/hr/...`) | registry + tabs | low | SAFE |
| 2.9 | **تقييم المخزون** | `/finance/inventory-costing` AND `/finance/reports/inventory-valuation` | registry (both in finance) | med | OWNER |

> 2.1 is the highest-value Class 2 item: six menu entries all read **«لوحة التحكم»** but go to different module dashboards. Most are module-scoped so the user only sees one at a time, but `/dashboard` (global) and the module dashboards can both be reachable for power users → ambiguous. Proposed: make each module's dashboard label module-qualified (e.g. «لوحة الأسطول», «لوحة المخزون») and reserve «لوحة التحكم» for `/dashboard`.

### 2.3 Class 3 — Same FUNCTION under different names (the expense/multi-expense family + others)

| # | Function | Names found | Paths | Sev | Disp |
|---|---|---|---|---|---|
| 3.1 | Org structure | «الهيكل التنظيمي» (registry → `/hr/org-tree`) vs tab «الهيكل» (→ `/hr/organization`, **redirect**) | see §2.4 | high | SAFE |
| 3.2 | Vendors/suppliers | «الموردين» (finance) vs «الموردون» (warehouse) — same concept, two spellings + two namespaces | `/finance/vendors`, `/warehouse/suppliers` | med | OWNER |
| 3.3 | Inventory valuation | «تقييم المخزون» appears twice as different pages (costing vs report) | `/finance/inventory-costing`, `/finance/reports/inventory-valuation` | med | OWNER |
| 3.4 | Dispatch | «الإرسال (Dispatch)» (registry) vs «الإرسال» (transport tab) | `/fleet/transport/dispatch` | low | SAFE |
| 3.5 | Collections | «التحصيل والديون» (group) + «منضدة التحصيل» + «مراحل التصعيد» (`/finance/collection`) + «متابعة Dunning» — collection cycle named four ways | `/finance/collections`, `/finance/ar-collection-workbench`, `/finance/collection`, `/finance/dunning` | med | OWNER |
| 3.6 | Reconciliation | «مركز التسويات» (`/finance/reconciliation-hub`) vs «التسوية البنكية» vs «ورقة عمل تسوية حساب» vs «تسوية GL» (admin) | multiple | low | OWNER |

> **Expense/multi-expense class:** the earlier cleanup landed — the registry now has a single «المصروفات» → `/finance/expenses` plus clearly-distinct siblings («اعتماد مصاريف بالجملة», «موزّع التكاليف», «معدل الحرق», «محلّل مزيج المصاريف»). **No remaining duplicate of the core expenses page was found.** The quick-action `/finance/expenses?action=new` correctly reuses the same page. ✅

### 2.4 Class 4 — Tabs pointing to a redirect / retired / legacy page

| # | Tab (file:line) | Tab path | Resolves to | Sev | Disp |
|---|---|---|---|---|---|
| 4.1 | `hr-tabs-nav.tsx:18` «الهيكل» | `/hr/organization` | **REDIRECT → `/hr/org-tree`** (hrRoutes.tsx:169) | high | SAFE |
| 4.2 | `fleet-tabs-nav.tsx:31` «التتبع المباشر» | `/fleet/telematics/live-map` | live (OK) — but the tab `match` also covers `/fleet/telematics` (live) | low | SAFE |

> 4.1 is the only **tab → redirect** found. It is safe to retarget the tab to `/hr/org-tree` (the canonical path the registry already uses) — the redirect keeps old bookmarks working, but a tab should never point through a redirect. All other 13 tab files point at live, non-redirect routes.
>
> **No tab points to a retired/unregistered page.** (Retired families — `/driver-portal/*`, FiscalPeriods v1, classic roles — are not referenced by any tab.)

### 2.5 Class 5 — Menu label != page title (same destination)

Because the header chip == menu label (Structural fact #1), the only real Class-5 drift is **menu label vs the page's own `PageShell title=`**. Confirmed examples:

| # | Path | Menu label | In-page `PageShell` title | Sev | Disp |
|---|---|---|---|---|---|
| 5.1 | `/finance/cfo-cockpit` | لوحة المدير المالي | لوحة المدير المالي اليومية (CFO Cockpit) | high | SAFE |
| 5.2 | `/finance/gl-health` | GL Health Score | مؤشر صحة النظام المالي (GL Health Score) | high | SAFE |
| 5.3 | `/finance/entity-360` | ملف الجهة 360° | نظرة شاملة على كيان (Entity 360) | med | SAFE |
| 5.4 | `/finance/workflows-hub` | مركز سير العمل المالي | مركز سير عمل المالية | low | SAFE |

> Recommendation (Slice 2): the in-page `PageShell title` should equal the canonical Arabic name; English/parenthetical glosses move to `subtitle` or are dropped. A guard can assert `PageShell title === canonicalName(path)` for registry paths.

### 2.6 Class 6 — Tab label != page title/name

| # | Tab (file:line) | Path | Tab label | Canonical/registry name | Sev | Disp |
|---|---|---|---|---|---|---|
| 6.1 | `finance-tabs-nav.tsx:34` | `/finance/dimensional-routing` | التأصيل المالي | التوجيه البُعدي | med | OWNER |
| 6.2 | `fleet-telematics-tabs-nav.tsx:13` | `/fleet/telematics/video-evidence` | جلسات الفيديو | أدلة الفيديو | low | SAFE |
| 6.3 | `property-tabs-nav.tsx:15` | `/properties/sales` | بيع العقارات | المبيعات العقارية | low | SAFE |
| 6.4 | `transport-tabs-nav.tsx:22` | `/fleet/transport/service-lines` | أوامر الفوترة | طابور تسعير بنود النقل | med | OWNER |
| 6.5 | `finance-tabs-nav.tsx:27` | `/finance/tax` | الزكاة والضريبة | نظام الضرائب | med | OWNER |
| 6.6 | `transport-tabs-nav.tsx:20` | `/fleet/transport/rules` | قواعد الاستقبال | قواعد استقبال النقل | low | SAFE |
| 6.7 | `fleet-tabs-nav.tsx:33` | `/fleet/reports` (+`/fleet/tco`) | التقارير | التقارير والتكاليف | low | SAFE |

### 2.7 Class 7 — Quick-action buttons pointing to retired / redirect pages

`pageQuickActions` in `sidebar-layout.tsx` (L480–685). Cross-checked every `link:`:

| # | Quick-action (line) | Link | Status | Sev | Disp |
|---|---|---|---|---|---|
| 7.1 | L500 «إدارة الإجازات» | `/hr/leaves/management` | **REDIRECT → `/hr/leaves`** | high | SAFE |
| 7.2 | L560 «إدارة المخالفات» | `/hr/violations/management` | **REDIRECT → `/hr/violations`** | high | SAFE |
| 7.3 | L569–572 (whole `/hr/violations/management` action set) | keyed on a redirect path | the *key* `/hr/violations/management` only matches after the redirect already fired; effectively dead config | med | SAFE |
| 7.4 | L494–497 (whole `/hr/leaves/management` action set) | keyed on redirect path `/hr/leaves/management` | same as 7.3 — dead key | med | SAFE |
| 7.5 | L528, L530–533 «تقييم متقدم» / `/hr/performance/advanced` | `/hr/performance/advanced` | **REDIRECT → `/hr/performance`** (both as link and as a key) | high | SAFE |
| 7.6 | L580 «إدارة الورديات» | `/hr/shifts/management` | **REDIRECT → `/hr/shifts`** | high | SAFE |
| 7.7 | L582–585 (`/hr/shifts/management` action set) | keyed on redirect path | dead key | med | SAFE |
| 7.8 | L539, L543 «المتقدمين»/«الوظائف» recruitment | live (`/hr/recruitment/applications`, `/hr/recruitment`) | OK | — | — |

> **Highest-severity quick-action problems:** 7.1, 7.2, 7.5, 7.6 — visible buttons that route the user **through a redirect**. Functionally they still land somewhere valid, but they violate hard-rule "quick-actions point to live non-redirect routes". Also several `pageQuickActions` **keys** are redirect paths (7.3, 7.4, 7.7) so those action sets never actually display (the page redirects before the key can match) — dead config to be removed in Slice 2.

### 2.8 Class 8 — Non-Arabic / non-standardized terms still USER-VISIBLE

These appear as **menu labels** (registry) and therefore also as the header chip — fully user-visible. (Plus the in-page titles in §2.5.)

| # | Surface (file:line) | Path | Current visible text | Proposed canonical AR | Sev | Disp |
|---|---|---|---|---|---|---|
| 8.1 | registry L408 | `/finance/reports/zatca` | **ZATCA Reports Hub** | مركز تقارير ZATCA (الفوترة الإلكترونية) | high | SAFE |
| 8.2 | registry L420 | `/finance/gl-health` | **GL Health Score** | مؤشر صحة دفتر الأستاذ | high | SAFE |
| 8.3 | registry L442 | `/finance/approvals-inbox` | **Approvals Inbox** | صندوق الاعتمادات | high | SAFE |
| 8.4 | registry L447 | `/finance/reports/gl-integrity-gaps` | **GL Integrity Gaps** | فجوات سلامة دفتر الأستاذ | high | SAFE |
| 8.5 | registry L449 | `/finance/reports/unmapped-lines` | **Unmapped Lines** | بنود غير مُوجَّهة | high | SAFE |
| 8.6 | registry L450 | `/finance/journal/activity` | **Posting Activity** | نشاط الترحيل | high | SAFE |
| 8.7 | registry L415 | `/finance/reports/is-vs-budget` | **P&L مقابل الميزانية** | قائمة الدخل مقابل الموازنة | med | SAFE |
| 8.8 | registry L418 | `/finance/reports/yoy` | المقارنة السنوية (سنة/سنة) | المقارنة السنوية (مقبول) | low | SAFE |
| 8.9 | registry L431 | `/finance/reports/cogs-summary` | ملخص التكلفة (CoGS) | ملخص تكلفة المبيعات | low | SAFE |
| 8.10 | registry L300 | `/finance/cfo-cockpit` | لوحة المدير المالي (label OK) — but page title has «CFO Cockpit» (§5.1) | — | high | SAFE |
| 8.11 | registry L565–576 | `/fleet/telematics*` | «التتبع (Telematics)», «نظام التتبع (Telematics)», «إعدادات CMSV6», «أجهزة MDVR» | التتبع المباشر / إعدادات الكاميرات / أجهزة التسجيل (مع إبقاء الرمز الفني كقوس) | med | OWNER |
| 8.12 | registry L460 | `/finance/dunning` | متابعة Dunning | متابعة التذكير بالتحصيل | low | SAFE |
| 8.13 | registry L583 | `/fleet/transport/dispatch` | الإرسال (Dispatch) | الإرسال | low | SAFE |
| 8.14 | registry L299, L318, L443, L455 | various | «...workflows-hub / reconciliation-hub / entity-360 hub» rendered AR but the page titles carry «Hub/360» English (§2.5) | — | med | SAFE |

> The cluster of **fully-English finance menu labels** (8.1–8.6) is the single biggest standardization gap and the highest-severity Class-8 group: these are core navigation labels the user reads every day. All are SAFE to rename (label-only change; path untouched).

---

## 3. Dead-link & redirect cross-check (summary)

- **Dead links (nav/tab/quick-action → unregistered route): 0.** Every referenced path resolves. ✅ (`check-sidebar-coverage.mjs` exits 0.)
- **Redirect targets referenced as destinations:** the menu deliberately points to canonical paths; the *leaks* are the tab in §2.4 (4.1) and the quick-actions in §2.7 (7.1, 7.2, 7.5, 7.6) plus the dead `pageQuickActions` keys.
- **Full redirect map** (from `routes/*.tsx`, all built via `redirect-to.tsx`):

  | SOURCE | TARGET |
  |---|---|
  | `/finance/fiscal-periods` | `/finance/fiscal-periods-v2` |
  | `/hr/leaves/management` | `/hr/leaves` |
  | `/hr/performance/advanced` | `/hr/performance` |
  | `/hr/training/advanced` | `/hr/training` |
  | `/hr/organization` | `/hr/org-tree` |
  | `/hr/organization/structure` | `/hr/org-tree` |
  | `/hr/recruitment/advanced` | `/hr/recruitment` |
  | `/hr/violations/management` | `/hr/violations` |
  | `/hr/shifts/management` | `/hr/shifts` |
  | `/guide/properties` | `/properties/guide` |
  | `/admin/attendance-categories` | `/hr/attendance-categories` |
  | `/admin/scoring-weights` | `/hr/scoring-weights` |
  | `/settings/print-templates` | `/admin/print-templates` |
  | `/bi/dashboards` `/bi/kpis` `/bi/reports` | `/bi` |

  > ⚠️ The registry itself lists `/bi/dashboards`, `/bi/kpis`, `/bi/reports` as **menu children** (L876–877) and the BI tabs list them too — but routes redirect all three to `/bi`. That is **menu/tabs → redirect** (a Class-4/Class-7 variant inside BI). Flagged: **bi-tabs-nav L7/L8/L9** and **registry L876–877** point through redirects. Sev: med, Disp: OWNER (decide whether BI sub-pages are real or should be dropped from the menu).

---

## 4. Finding counts

| Class | Title | Count | Highest sev |
|---|---|---:|---|
| 1 | same path, >1 label | 12 | high (×1) |
| 2 | same label, different paths | 9 | med |
| 3 | same function, different names | 6 | high (×1) |
| 4 | tab → redirect/retired | 2 (+3 BI) | high (×1) |
| 5 | menu label != page title | 4 | high (×2) |
| 6 | tab label != page title | 7 | med |
| 7 | quick-action → redirect/dead | 8 | high (×4) |
| 8 | non-Arabic user-visible | 14 | high (×6) |
| **Total** | | **~62 findings** | |

### Highest-severity duplicates (the things to fix first in Slice 2)
1. **English finance menu labels** (8.1–8.6): `ZATCA Reports Hub`, `GL Health Score`, `Approvals Inbox`, `GL Integrity Gaps`, `Unmapped Lines`, `Posting Activity`. — SAFE label-only renames.
2. **Quick-actions through redirects** (7.1/7.2/7.5/7.6) + **dead quick-action keys** (7.3/7.4/7.7): retarget to canonical live paths, delete dead keys. — SAFE.
3. **Org-structure tab → redirect** (4.1): `hr-tabs-nav` «الهيكل» → `/hr/organization` should become `/hr/org-tree`. — SAFE.
4. **Page titles carrying English** (5.1/5.2): CFO Cockpit, GL Health Score in-page titles. — SAFE.
5. **«لوحة التحكم» × 6 destinations** (2.1): module-qualify the labels. — OWNER.

---

## 5. Proposals (Slice 2+) — DESIGN ONLY, not implemented in this slice

Nothing below is wired. These are the artifacts the next slices would add.

### 5.1 `docs/ux/ARABIC_NAVIGATION_GLOSSARY.md` ✅ created in this slice
A starting catalog of the canonical Arabic term per function, seeded from the findings above and reconciled with the existing `docs/ux/ARABIC_BUSINESS_TERMS.md`. See that file.

### 5.2 `navigation.canonical-map.ts` — shape & location (design only)
- **Where:** `artifacts/ghayth-erp/src/components/layout/navigation.canonical-map.ts` (next to the registry, same import surface).
- **What:** a single exported const keyed by a stable **function id** (not by path, so a function that later moves keeps its identity).

```ts
// DESIGN SKETCH — do NOT create as an active file in Slice 1.
export interface CanonicalEntry {
  /** stable function id, e.g. "finance.gl_health" */
  fn: string;
  /** THE one official Arabic name shown in menu + tab + page title */
  arabicName: string;
  /** THE one official path (must be a live, non-redirect route) */
  path: string;
  /** search-only alternative names (English term, old AR label, abbreviations) */
  aliases: string[];
}

export const NAVIGATION_CANONICAL_MAP: Record<string, CanonicalEntry> = {
  "finance.gl_health": {
    fn: "finance.gl_health",
    arabicName: "مؤشر صحة دفتر الأستاذ",
    path: "/finance/gl-health",
    aliases: ["GL Health Score", "صحة GL"],
  },
  // ... one entry per function
};
```

- **Consumers (later slices):** the registry, the tab navs, and `PageShell` would read `arabicName` from this map instead of hard-coding labels; the command palette would index `aliases` for search-only matching. **Not wired in Slice 1** — registry stays the source of truth until the map is reviewed.

### 5.3 `scripts/src/check-tabs-coverage.mjs` — what it would assert (design only)
- Parse every `artifacts/ghayth-erp/src/components/shared/*-tabs-nav.tsx`, extract `{label, path}` per tab.
- **Assert A:** every tab `path` is a **registered route** (reuse `routes/registry.ts` `isRegisteredRoute`).
- **Assert B:** every tab `path` is **NOT a redirect source** (cross-check against the redirect table derived from `routes/*.tsx` / `redirect-to.tsx`). → would catch §2.4 (4.1) and BI tabs.
- **Assert C:** tab `label` == canonical `arabicName` for that path (from `navigation.canonical-map.ts`). → would catch §2.6.
- **Assert D:** no tab points at a **create/detail** page (path ending `/create`, `/new`, or containing `:`) unless the path is in an explicit `TAB_EXCEPTION_ALLOWLIST`.
- Exit non-zero with a per-violation report; wired into CI next to `check-sidebar-coverage.mjs`.

### 5.4 `scripts/src/check-quick-actions-coverage.mjs` — what it would assert (design only)
- Parse `pageQuickActions` from `sidebar-layout.tsx` (object literal → `{key, label, link}` rows).
- **Assert A:** every quick-action `link` (after stripping `?query`) is a **live, registered, non-redirect** route. → would catch §2.7 (7.1/7.2/7.5/7.6).
- **Assert B:** every `pageQuickActions` **key** is itself a live non-redirect route (so action sets aren't keyed on a path that redirects away before they show). → would catch the dead keys 7.3/7.4/7.7.
- **Assert C:** create/`?action=new` style links are allowed (that's the point of a quick-action) but their **destination page** must exist; non-create links' labels should match the canonical `arabicName`.
- Exit non-zero with a per-violation report; wired into CI.

---

## 6. Slice-1 acceptance

- ✅ Report shows where duplication / confusion / unruly names live (§2–§4).
- ✅ **No code changed, no routes touched** — only `docs/ux/` files created.
- ✅ `node scripts/src/check-sidebar-coverage.mjs` exits **0** (unaffected by docs).
- ✅ `git status` shows only `docs/ux/` additions (this file + the glossary).
- ✅ The `.ts` canonical map and the two `.mjs` guards are **described only**, not created as active files.
