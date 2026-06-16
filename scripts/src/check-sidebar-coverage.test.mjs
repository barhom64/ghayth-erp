#!/usr/bin/env node
//
// scripts/src/check-sidebar-coverage.test.mjs
//
// Pure-logic fixtures for the sidebar-coverage / navigation-governance gate.
// Exercises the extractors and the off-sidebar / create-edit classifiers against
// positive and negative snippets without touching any file or DB — runs in every
// environment and guards the guard itself.
//
// Run:  node scripts/src/check-sidebar-coverage.test.mjs
// Exits 0 on pass, 1 on any assertion failure.

import {
  basePath,
  extractRoutePaths,
  extractRedirectRoutes,
  extractSidebarPaths,
  isLegitimatelyOffSidebar,
  isCreateEditDetail,
} from "./check-sidebar-coverage.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// ── extractRoutePaths ─────────────────────────────────────────────────────────
console.log("extractRoutePaths");
const routeSrc = `
  { path: "/finance/expenses", component: Expenses },
  { path: "/finance/expenses/create", component: ExpensesCreate },
  { path: "/finance/invoices/:id", component: InvoiceDetail },
`;
assert(extractRoutePaths(routeSrc).includes("/finance/expenses"), "picks plain path");
assert(extractRoutePaths(routeSrc).includes("/finance/invoices/:id"), "picks param path");
assert(extractRoutePaths(routeSrc).length === 3, "picks exactly the three routes");

// ── extractRedirectRoutes ─────────────────────────────────────────────────────
console.log("extractRedirectRoutes");
const redirSrc = `
  { path: "/finance/expenses/multi-line", component: redirectTo("/finance/expenses/create") },
  { path: "/admin/scoring-weights", component: RedirectToHrScoringWeights },
  { path: "/finance/expenses", component: Expenses },
`;
const redir = extractRedirectRoutes(redirSrc);
assert(redir.get("/finance/expenses/multi-line") === "/finance/expenses/create", "inline redirectTo target captured");
assert(redir.has("/admin/scoring-weights"), "named RedirectToXxx component captured");
assert(!redir.has("/finance/expenses"), "real (non-redirect) page ignored");

// ── extractSidebarPaths ───────────────────────────────────────────────────────
console.log("extractSidebarPaths");
const navSrc = `
  { label: "المصروفات", path: "/finance/expenses", icon: X },
  { label: "العقارات", path: '/properties/guide', icon: Y },
`;
assert(extractSidebarPaths(navSrc).includes("/finance/expenses"), "picks nav path");
assert(extractSidebarPaths(navSrc).includes("/properties/guide"), "quote-agnostic (single quotes)");

// ── isLegitimatelyOffSidebar ──────────────────────────────────────────────────
console.log("isLegitimatelyOffSidebar — must be TRUE (legit off-sidebar)");
assert(isLegitimatelyOffSidebar("/finance/expenses/create"), "/…/create");
assert(isLegitimatelyOffSidebar("/finance/customer-advances/quick-create"), "/…/quick-create (hyphen variant)");
assert(isLegitimatelyOffSidebar("/x/bulk-new"), "/…/-new hyphen variant");
assert(isLegitimatelyOffSidebar("/x/inline-edit"), "/…/-edit hyphen variant");
assert(isLegitimatelyOffSidebar("/finance/invoices/:id"), "param (detail) page");
assert(isLegitimatelyOffSidebar("/login"), "login shell");
assert(isLegitimatelyOffSidebar("/dashboard"), "dashboard shell");

console.log("isLegitimatelyOffSidebar — must be FALSE (a real list/dashboard page)");
assert(!isLegitimatelyOffSidebar("/finance/expenses"), "plain list page is NOT off-sidebar");
assert(!isLegitimatelyOffSidebar("/bi/operations"), "plain page is NOT off-sidebar");
// guard against over-broad hyphen matching: a page that merely ends in a word
// containing create/new/edit mid-token must NOT be exempted.
assert(!isLegitimatelyOffSidebar("/x/screen"), "'/x/screen' (ends in 'creen' not 'create') is NOT off-sidebar");
assert(!isLegitimatelyOffSidebar("/x/renew"), "'/x/renew' (no /- before 'new') is NOT off-sidebar");

// ── isCreateEditDetail ────────────────────────────────────────────────────────
console.log("isCreateEditDetail");
assert(isCreateEditDetail("/x/create"), "create page detected");
assert(isCreateEditDetail("/x/quick-create"), "hyphen create variant detected");
assert(isCreateEditDetail("/x/:id"), "param page detected");
assert(!isCreateEditDetail("/x"), "plain page not flagged");

// ── basePath ──────────────────────────────────────────────────────────────────
console.log("basePath");
assert(basePath("/module-dashboards?tab=fleet") === "/module-dashboards", "strips query string");
assert(basePath("/x#frag") === "/x", "strips hash");

if (failed) {
  console.error(`\n[check:sidebar-coverage.test] ${failed} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\n[check:sidebar-coverage.test] all assertions passed");
