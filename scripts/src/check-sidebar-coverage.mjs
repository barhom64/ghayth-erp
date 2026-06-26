#!/usr/bin/env node
// scripts/src/check-sidebar-coverage.mjs
//
// Sidebar-coverage + navigation-governance gate. Answers the user-facing
// question: "this feature exists on the server and is wired into
// React Router, but how does a user actually navigate to it?" — and,
// with --strict, fails the build when the navigation registry drifts.
//
// What it does:
//   1. Reads every mounted route from artifacts/ghayth-erp/src/routes/*.tsx
//      (the same `{ path: "/x", component: X }` shape adminRoutes etc.
//      already use).
//   2. Reads every `path: "/..."` literal from the navigation registry
//      (artifacts/ghayth-erp/src/components/layout/navigation.registry.ts)
//      — the single source of truth the sidebar derives from.
//   3. Removes the routes that are LEGITIMATELY off-sidebar:
//        - detail pages with `:id` params (opened from list pages)
//        - create/edit pages (`/create`, `/new`, `/:id/edit`) — opened
//          from a button on the list/detail page
//        - redirect stubs (`component: redirectTo(...)` / `RedirectToXxx`) —
//          deep-link aliases that bounce to a canonical page, not real pages
//        - login / 404 / shell routes
//   4. Reports the difference, plus governance checks (below).
//
// Governance gate (HARD — fail under --strict):
//   - orphan          : a real list/dashboard page with no nav entry.
//   - dead-link       : a nav entry pointing at a path that no route mounts.
//   - create-in-sidebar: a create/edit/detail page wired into the nav drawer
//                        (violates the "create/edit = standalone page opened
//                        from a button, never the nav" convention). A small
//                        allowlist covers intentional self-service entries.
//
// Governance checks (SOFT — report-only):
//   - no-perm         : nav leaf with no explicit `perm`/`module` gate. Many
//                       pages legitimately rely on module+minRoleLevel only,
//                       so this is informational, not a hard failure.
//   - leader-path / status are guaranteed for every page by construction in
//     getNavigationRegistry() (each PageMeta is assigned a leaderPath and a
//     status), so a runtime check would be redundant — building the registry
//     IS the enforcement.
//
// Usage:
//   node scripts/src/check-sidebar-coverage.mjs           # report-only
//   node scripts/src/check-sidebar-coverage.mjs --strict  # exit 1 on HARD violations
//
// Output: stdout, plain text. Pipe to a file or read directly.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const ROUTES_DIR = path.join(REPO, "artifacts/ghayth-erp/src/routes");
// The navigation tree was lifted into navigation.registry.ts (single source of
// truth). The sidebar derives from it, so the nav paths now live there.
const SIDEBAR_FILE = path.join(
  REPO,
  "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts",
);

const STRICT = process.argv.includes("--strict");

// Intentional create/edit-style pages that ARE primary nav entries (e.g.
// employee self-service "submit leave request"). Keep this list tiny and
// justified — every entry is an explicit exception to the
// "no create/edit in the nav drawer" convention.
const CREATE_IN_SIDEBAR_ALLOWLIST = new Set([
  "/hr/leaves/create", // employee self-service "طلب إجازة" entry point
  "/employees/quick-create", // "إنشاء موظف سريع" — intentional quick-access HR entry point (mirrors the leave self-service precedent)
]);

// Pages intentionally OFF the sidebar because a tab-shell page supersets them —
// the shell re-implements their endpoints as in-page tabs, so the standalone
// route stays mounted for deep-links + command-palette search but must NOT count
// as an orphan. See CROSS_MODULE_DUPLICATION_AUDIT.md (Warehouse «عمليات متقدّمة»).
const SUPERSEDED_BY_SHELL = new Set([
  "/warehouse/lots",         // → /warehouse/advanced · tab "lots"
  "/warehouse/serials",      // → /warehouse/advanced · tab "serials"
  "/warehouse/cycle-counts", // → /warehouse/advanced · tab "cycle-counts"
  "/warehouse/abc",          // → /warehouse/advanced · tab "abc"
]);

// Routes intentionally kept off the sidebar that the structural heuristics
// (detail / create / redirect-stub) can't classify. Keep this list tiny and
// justified — every entry is an explicit exception.
const OFF_SIDEBAR_ALLOWLIST = new Set([
  // بوابة السائق الذاتية: صفحة البلاغات الميدانية (وقود/عطل/حادث). تُفتح من زر
  // «البلاغات» على /me/driver، لا من القائمة الجانبية (شاشة سائق، ليست إدارية).
  "/me/driver/reports",
  // Back-compat alias → /work-inbox (PR-4 #2163). The redirect is component-
  // level (pages/my/work-queue.tsx calls setLocation), so the route reads as
  // `component: WorkQueue` and the redirectTo/RedirectToXxx detection can't see
  // it. /work-inbox (the canonical inbox) IS in the sidebar; this stays mounted
  // only for old bookmarks, and is pinned as a redirect shell by
  // platformWave2Pr4OrphansCleanupSmoke + hr015_016_017Smoke.
  "/my/work-queue",
  // عرض «القوائم الموحدة» للمعاملات البينية — قراءة فقط (الخلفية GET فقط، لا إنشاء).
  // يُفتح من زر «القوائم الموحدة» على /finance/intercompany، لا من القائمة. كان
  // مسبقًا تحت لاحقة /create المُضلِّلة فصُنّف تلقائيًا؛ بعد إسقاط اللاحقة يحتاج إدراجًا صريحًا.
  "/finance/intercompany/consolidation",
  // create variant — reuses ExpensesCreate, opened from the expenses list.
  "/finance/expenses/multi-line",
  // بوابة الاستيراد المالي (م٢-أ): variant إنشاء «استيراد من ملف» للمستند الموحّد
  // «تسجيل واقعة مالية». تمرّ على نفس POST /finance/documents (لا اشتقاق مكرّر)،
  // وتُفتح بزر لا من القائمة الجانبية. تُسطَّح في القائمة مع شقيقتها
  // /finance/documents/create عند م٨ (التبديل الكامل + تنظيف القائمة)؛ تبقى حتى
  // ذلك قابلة للوصول بالرابط/لوحة الأوامر مثل صفحة الإنشاء الموحّدة.
  "/finance/documents/import",
  // ملاحظة: /finance/collect صار مُدرجًا في القائمة (navigation.registry) بديلًا عن
  // «سند قبض العميل» القديم (م٨ إكمال التبديل)، فأُزيل من off-sidebar (لم يعد مخفيًّا).
  // فاتورة مبيعات تشغيلية (م٤): variant إنشاء يُفتح بزر من «تسجيل واقعة». نفس جدول
  // البنود الموحّد + ربط كل بند بكيانه، يمرّ على منفذ الفاتورة القائم
  // POST /finance/invoices (روحان لنفس السجل §١١.٢). يُسطَّح/يُدمج عند م٨.
  "/finance/documents/invoice",
  // فاتورة مشتريات تشغيلية (م٤): variant إنشاء يُفتح بزر من «تسجيل واقعة». نفس جدول
  // البنود + غرض حساب وربط لكل بند + مرفق إلزامي، يمرّ على منفذ فاتورة المورد القائم
  // POST /finance/vendor-invoices (روحان لنفس السجل §١١.٢). يُسطَّح/يُدمج عند م٨.
  "/finance/documents/vendor-invoice",
  // Settings-hub tab deep-paths: each opens a tab of /settings by URL / command
  // palette / search without adding a separate sidebar entry (the hub is one
  // page). branches/companies/departments/audit-log DO have sidebar entries; the
  // rest are deep-link-only so the sidebar stays uncluttered.
  "/settings/letterhead",
  "/settings/channels",
  "/settings/controls",
  "/settings/approvals",
  "/settings/numbering",
  "/settings/accounting",
  "/settings/resolved",
  "/settings/zatca",
  "/settings/gov",
  // Parallel org-model overlay (legal_entities/positions/teams) retired from the
  // sidebar as a duplicate of companies/branches/departments; kept URL-reachable
  // (hr/org-tree links org-memberships for team/committee CRUD).
  "/admin/org-model",
  "/admin/org-memberships",
  // «سير العمل» — workflows table has no executor; dropped from sidebar, route kept.
  "/requests/workflows",
]);

/** Strip a trailing query string / hash so nav paths compare to route paths. */
export function basePath(p) {
  return p.replace(/[?#].*$/, "");
}

/** Pure: every `{ path: "/x", … }` route-path literal in a source string. */
export function extractRoutePaths(src) {
  const out = [];
  for (const m of src.matchAll(/\{\s*path:\s*["']([^"']+)["']/g)) out.push(m[1]);
  return out;
}

/** Pull every `{ path: "/x", component: … }` literal from the routes/*.tsx files. */
function getMountedRoutes() {
  const set = new Set();
  for (const file of fs.readdirSync(ROUTES_DIR)) {
    if (!file.endsWith(".tsx")) continue;
    for (const p of extractRoutePaths(fs.readFileSync(path.join(ROUTES_DIR, file), "utf-8"))) set.add(p);
  }
  return [...set].sort();
}

/**
 * Map of redirect-route path → the target it forwards to. A redirect route is one
 * whose component is `redirectTo("/x")` or a named `RedirectToXxx` component.
 * These are deep-link / back-compat aliases that bounce to a canonical page, not
 * pages in their own right, so (like detail / create pages) they are never
 * expected to carry a sidebar entry. Returned as a Map so callers can both test
 * membership (`.has()`) and report the bounce target (`.get()`).
 */
export function extractRedirectRoutes(src) {
  const map = new Map();
  // `redirectTo("/target")` — capture the literal target.
  for (const m of src.matchAll(
    /\{\s*path:\s*["']([^"']+)["']\s*,\s*component:\s*redirectTo\(\s*["']([^"']+)["']/g,
  )) {
    map.set(m[1], m[2]);
  }
  // Named `RedirectToXxx` components — target isn't a static literal here.
  for (const m of src.matchAll(
    /\{\s*path:\s*["']([^"']+)["']\s*,\s*component:\s*(RedirectTo[A-Za-z]*)/g,
  )) {
    if (!map.has(m[1])) map.set(m[1], m[2]);
  }
  return map;
}

function getRedirectRoutePaths() {
  const map = new Map();
  for (const file of fs.readdirSync(ROUTES_DIR)) {
    if (!file.endsWith(".tsx")) continue;
    for (const [p, t] of extractRedirectRoutes(fs.readFileSync(path.join(ROUTES_DIR, file), "utf-8"))) {
      if (!map.has(p)) map.set(p, t);
    }
  }
  return map;
}

/** Pure: every `path: "/x"` value in a navigation-registry source string. */
export function extractSidebarPaths(src) {
  const out = [];
  // Virtual wrappers (path "#…") are visual sidebar containers, not pages/routes
  // — skip them, consistent with getNavigationRegistry which also skips "#" paths.
  for (const m of src.matchAll(/\bpath:\s*["']([^"']+)["']/g)) {
    if (!m[1].startsWith("#")) out.push(m[1]);
  }
  return out;
}

/** Pull every `path: "/x"` value from the navigation registry. */
function getSidebarPaths() {
  return [...new Set(extractSidebarPaths(fs.readFileSync(SIDEBAR_FILE, "utf-8")))].sort();
}

/**
 * A path is "legitimately off-sidebar" when it represents a detail/
 * create/edit page that's opened from another page (list or detail),
 * not from the nav drawer. Heuristics:
 *   - has `:` (route parameter) → detail/edit
 *   - ends with `/create`|`-create` or `/new`|`-new` → create page
 *     (the `-` form covers variants like `…/quick-create`)
 *   - ends with `/edit`|`-edit` → edit page
 *   - is the login page or the special shell roots
 */
export function isLegitimatelyOffSidebar(routePath) {
  if (routePath.includes(":")) return true;
  if (/[/-](create|new|edit)$/.test(routePath)) return true; // /create OR quick-create, bulk-new …
  if (routePath === "/login") return true;
  if (routePath === "/") return true;
  if (routePath === "/dashboard") return true; // home shell
  return false;
}

/** True when a nav-drawer path is a create/edit/detail page (convention breach). */
export function isCreateEditDetail(p) {
  const b = basePath(p);
  return b.includes(":") || /[/-](create|new|edit)$/.test(b);
}

function main() {
  const routes = getMountedRoutes();
  const routesSet = new Set(routes);
  const redirectPaths = getRedirectRoutePaths();
  const sidebarPaths = [...new Set(getSidebarPaths())].sort();
  const sidebarSet = new Set(sidebarPaths);

  // ── coverage: routes with no nav entry ────────────────────────────────
  const missing = [];
  let legitimatelyOff = 0;
  let redirectOff = 0;
  let supersededOff = 0;
  for (const r of routes) {
    if (sidebarSet.has(r)) continue;
    // Redirect-only routes are intentional deep-link aliases, not orphans.
    if (redirectPaths.has(r)) {
      redirectOff++;
      continue;
    }
    // OFF_SIDEBAR_ALLOWLIST covers the few the heuristics can't classify.
    if (OFF_SIDEBAR_ALLOWLIST.has(r) || isLegitimatelyOffSidebar(r)) {
      legitimatelyOff++;
      continue;
    }
    // Superseded by a tab-shell page — intentional off-sidebar, not an orphan.
    if (SUPERSEDED_BY_SHELL.has(r)) {
      supersededOff++;
      continue;
    }
    missing.push(r);
  }

  // ── governance: dead links (nav → no mounted route) ───────────────────
  const SHELL_PATHS = new Set(["/", "/dashboard", "/login"]);
  const deadLinks = [];
  for (const p of sidebarPaths) {
    const b = basePath(p);
    if (SHELL_PATHS.has(b)) continue;
    if (!routesSet.has(b)) deadLinks.push(p);
  }

  // ── soft: nav entries that point at a redirect stub (dead-end bounce) ──
  // Clicking these lands on a redirect route that immediately forwards to a
  // canonical page (e.g. the BI dashboards/kpis/reports duplicates removed in
  // #2518). The route resolves, so it's not a dead link — but the entry is a
  // redundant bounce, usually a stale alias that should point straight at the
  // target (or be dropped when the target is itself a sidebar entry).
  const redirectLinks = sidebarPaths.filter((p) => redirectPaths.has(basePath(p)));

  // ── governance: create/edit/detail pages wired into the nav drawer ────
  const createInSidebar = sidebarPaths.filter(
    (p) => isCreateEditDetail(p) && !CREATE_IN_SIDEBAR_ALLOWLIST.has(basePath(p)),
  );

  // ── soft: nav leaves with no explicit perm/module gate (informational) ─
  // Pull each leaf object's own line and flag those lacking perm/module.
  const src = fs.readFileSync(SIDEBAR_FILE, "utf-8");
  const noPerm = [];
  for (const line of src.split("\n")) {
    const m = line.match(/\bpath:\s*["']([^"']+)["']/);
    if (!m) continue;
    const p = m[1];
    if (SHELL_PATHS.has(basePath(p))) continue;
    if (!/\bperm:/.test(line) && !/\bmodule:/.test(line)) noPerm.push(p);
  }

  // ── report ────────────────────────────────────────────────────────────
  console.log(`# sidebar-coverage + navigation-governance audit\n`);
  console.log(`mode:                                    ${STRICT ? "STRICT (gate)" : "report-only"}`);
  console.log(`total mounted routes:                    ${routes.length}`);
  console.log(`entries in sidebar:                      ${sidebarSet.size}`);
  console.log(`legitimately off-sidebar (detail/create): ${legitimatelyOff}`);
  console.log(`redirect routes (off-sidebar, legit):    ${redirectOff}`);
  console.log(`superseded by tab-shell (off-sidebar):   ${supersededOff}`);
  console.log(`[HARD] orphan pages (missing from nav):  ${missing.length}`);
  console.log(`[HARD] dead links (nav → no route):      ${deadLinks.length}`);
  console.log(`[HARD] create/edit pages in nav drawer:  ${createInSidebar.length}`);
  console.log(`[soft] nav leaves w/o perm/module gate:  ${noPerm.length}`);
  console.log(`[soft] nav entries → redirect stub:      ${redirectLinks.length}\n`);

  if (missing.length > 0) {
    console.log(`## [HARD] orphan pages (missing from the sidebar)\n`);
    const byDomain = new Map();
    for (const p of missing) {
      const domain = p.split("/")[1] || "(root)";
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain).push(p);
    }
    const sorted = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [domain, list] of sorted) {
      console.log(`### /${domain} (${list.length})`);
      for (const p of list) console.log(`  ${p}`);
      console.log();
    }
  }

  if (deadLinks.length > 0) {
    console.log(`## [HARD] dead links (nav entry → no mounted route)\n`);
    for (const p of deadLinks) console.log(`  ${p}`);
    console.log();
  }

  if (createInSidebar.length > 0) {
    console.log(`## [HARD] create/edit/detail pages wired into the nav drawer\n`);
    console.log(`(create/edit pages must be standalone pages opened from a button,`);
    console.log(` never the nav drawer; add an intentional exception to`);
    console.log(` CREATE_IN_SIDEBAR_ALLOWLIST only with justification)\n`);
    for (const p of createInSidebar) console.log(`  ${p}`);
    console.log();
  }

  if (noPerm.length > 0) {
    console.log(`## [soft] nav leaves with no explicit perm/module gate (informational)\n`);
    for (const p of noPerm) console.log(`  ${p}`);
    console.log();
  }

  if (redirectLinks.length > 0) {
    console.log(`## [soft] nav entries pointing at a redirect stub (dead-end bounce)\n`);
    console.log(`(clicking these forwards to a canonical page; repoint the entry at`);
    console.log(` the target, or drop it when the target is itself a sidebar entry)\n`);
    for (const p of redirectLinks) {
      console.log(`  ${p}  →  ${redirectPaths.get(basePath(p))}`);
    }
    console.log();
  }

  const hardViolations = missing.length + deadLinks.length + createInSidebar.length;
  if (hardViolations === 0) {
    console.log(`✓ navigation governance: no HARD violations.`);
  }

  if (STRICT && hardViolations > 0) {
    console.error(
      `\n✗ navigation governance gate FAILED: ${hardViolations} HARD violation(s) ` +
        `(${missing.length} orphan, ${deadLinks.length} dead-link, ${createInSidebar.length} create-in-nav).`,
    );
    process.exit(1);
  }
}

// Auto-run only when invoked directly (so the .test.mjs sibling can import the
// pure helpers without triggering a scan/exit).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
