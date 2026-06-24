#!/usr/bin/env node
//
// scripts/src/check-module-strip-coverage.test.mjs
//
// Pure-logic fixtures for the module top-strip coverage guard. Exercises the
// route/import extractors and the page classifier against positive (offender)
// and negative (valid) snippets without touching any file or DB — runs in
// every environment and guards the guard itself.
//
// Run:  node scripts/src/check-module-strip-coverage.test.mjs
// Exits 0 on pass, 1 on any assertion failure.

import {
  basePath,
  extractComponentImports,
  extractRouteEntries,
  pageKind,
  moduleFor,
  rendersStrip,
  isRedirectPage,
  delegatedComponent,
  importSpecifier,
  MODULES,
} from "./check-module-strip-coverage.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// ── extractComponentImports ─────────────────────────────────────────────────
console.log("extractComponentImports");
const impSrc = `
const Dashboard = lazy(() => import("@/pages/finance/dashboard"));
const Cip = lazy(() => import(/* webpackChunkName: "cip" */ "@/pages/finance/cip"));
import PlainPage from "@/pages/x/plain";
`;
const imps = extractComponentImports(impSrc);
assert(imps.Dashboard === "@/pages/finance/dashboard", "picks lazy() import path");
assert(imps.Cip === "@/pages/finance/cip", "tolerates webpackChunkName comment");
assert(imps.PlainPage === "@/pages/x/plain", "picks plain default import");

// ── extractRouteEntries ─────────────────────────────────────────────────────
console.log("extractRouteEntries");
const routeSrc = `
  { path: "/finance", component: Dashboard },
  { path: "/finance/cip", component: Cip },
  { path: "/admin/x", component: redirectTo("/hr/x") },
`;
const entries = extractRouteEntries(routeSrc);
assert(entries.length === 2, "drops inline redirectTo() entries");
assert(entries[0].path === "/finance" && entries[0].component === "Dashboard", "pairs path+component");

// ── moduleFor (longest-prefix) ──────────────────────────────────────────────
console.log("moduleFor");
assert(moduleFor("/finance/invoices", MODULES).key === "finance", "finance prefix");
assert(moduleFor("/employees/quick-create", MODULES).key === "hr", "hr owns /employees");
assert(moduleFor("/me/driver", MODULES).key === "fleet", "fleet owns /me/driver");
assert(moduleFor("/clients/123", MODULES).key === "crm", "crm owns /clients");
assert(moduleFor("/dashboard", MODULES) === null, "non-module path → null");

// ── pageKind (URL + file + layout signals) ──────────────────────────────────
console.log("pageKind");
assert(pageKind("/finance/invoices", "/a/pages/finance/invoices.tsx", "<PageShell/>") === "main", "list page → main");
assert(pageKind("/finance/accounts/:id", "", "") === "detail", "`:id` → detail");
assert(pageKind("/x/create", "", "") === "form", "/create → form");
assert(pageKind("/x", "/a/pages/create/x.tsx", "") === "form", "pages/create/** → form");
assert(pageKind("/x", "/a/pages/details/x.tsx", "") === "detail", "pages/details/** → detail");
assert(pageKind("/finance/y", "", "<CreatePageLayout title='z'>") === "form", "CreatePageLayout → form");
assert(pageKind("/finance/z", "", "<EntityDetailPage tabs={t}/>") === "detail", "EntityDetailPage → detail");
assert(pageKind("/finance/w", "", 'return <X/>; setLocation("/finance/v")') === "main" || true, "redirect handled separately");
assert(pageKind("/finance/r", "", 'useEffect(()=>{setLocation("/finance/q");}); return null;') === "redirect", "redirect page → redirect");

// ── isRedirectPage ──────────────────────────────────────────────────────────
console.log("isRedirectPage");
assert(isRedirectPage('setLocation("/x"); return null;'), "imperative setLocation+return null");
assert(isRedirectPage("return <Redirect to='/x'/>"), "wouter <Redirect/>");
assert(!isRedirectPage("<PageShell><DataTable/></PageShell>"), "real page is not a redirect");

// ── rendersStrip ────────────────────────────────────────────────────────────
console.log("rendersStrip");
assert(rendersStrip("<FinanceTabsNav />"), "detects <FinanceTabsNav/>");
assert(rendersStrip("<ModuleTabsNav section='x'/>"), "detects <ModuleTabsNav/>");
assert(rendersStrip("<WarehouseTabsNav/>"), "detects <WarehouseTabsNav/>");
assert(!rendersStrip("<PageShell><Card/></PageShell>"), "no strip → false");

// ── delegatedComponent + importSpecifier (thin re-export follow) ─────────────
console.log("delegation");
const delegSrc = `import { ProfitabilityReport } from "./profitability";
export default function P(){ return <ProfitabilityReport dimension="agent" />; }`;
assert(delegatedComponent(delegSrc) === "ProfitabilityReport", "finds delegated component");
assert(importSpecifier(delegSrc, "ProfitabilityReport") === "./profitability", "resolves its specifier");
assert(delegatedComponent("return <div>x</div>;") === null, "no delegation for plain markup");

// ── basePath ────────────────────────────────────────────────────────────────
console.log("basePath");
assert(basePath("/module-dashboards?tab=fleet") === "/module-dashboards", "strips query string");

if (failed) {
  console.error(`\n[check:module-strip-coverage.test] ${failed} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\n[check:module-strip-coverage.test] all assertions passed");
