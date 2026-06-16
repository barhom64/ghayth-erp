#!/usr/bin/env node
//
// scripts/src/check-tabs-coverage.test.mjs
//
// Pure-logic fixtures for the tabs-nav coverage guard. Exercises the extractors
// and the match-coverage helper against positive (broken) and negative (valid)
// snippets without touching any file or DB — runs in every environment and
// guards the guard itself.
//
// Run:  node scripts/src/check-tabs-coverage.test.mjs
// Exits 0 on pass, 1 on any assertion failure.

import {
  basePath,
  extractRoutePaths,
  extractRedirectRoutes,
  extractTabs,
  isMatchCovered,
} from "./check-tabs-coverage.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// ── extractTabs ─────────────────────────────────────────────────────────────
console.log("extractTabs");
const tabSrc = `
const TABS = [
  { href: "/bi", label: "نظرة عامة", icon: A, match: ["/bi"], exact: true },
  { href: "/bi/operations", label: "y", icon: B, match: ["/bi/operations"] },
  { href: '/single', label: 'z', icon: C },
];
`;
const tabs = extractTabs(tabSrc);
assert(tabs.length === 3, "finds all three tabs");
assert(tabs[0].href === "/bi", "picks href");
assert(tabs[0].matches.includes("/bi"), "picks match[] entries");
assert(tabs[2].href === "/single", "quote-agnostic (single quotes)");
assert(tabs[2].matches.length === 0, "no match[] → empty matches");
// JSX `href={tab.href}` on the rendered <a> must NOT be mistaken for a tab def.
assert(extractTabs(`<Link href={tab.href}><a href={tab.href}>x</a></Link>`).length === 0, "ignores JSX href={...}");

// ── extractRoutePaths ─────────────────────────────────────────────────────────
console.log("extractRoutePaths");
const routeSrc = `
  { path: "/bi", component: BI },
  { path: "/bi/operations", component: Ops },
  { path: '/single', component: S },
`;
assert(extractRoutePaths(routeSrc).includes("/bi/operations"), "picks route paths");
assert(extractRoutePaths(routeSrc).includes("/single"), "quote-agnostic");

// ── extractRedirectRoutes ─────────────────────────────────────────────────────
console.log("extractRedirectRoutes");
const redirSrc = `
  { path: "/bi/kpis", component: redirectTo("/bi") },
  { path: "/admin/x", component: RedirectToHrX },
  { path: "/real", component: RealPage },
`;
const redir = extractRedirectRoutes(redirSrc);
assert(redir.get("/bi/kpis") === "/bi", "picks inline redirectTo target");
assert(redir.has("/admin/x"), "picks named RedirectToXxx component");
assert(!redir.has("/real"), "ignores real (non-redirect) pages");

// ── classification: dead / redirect (mirrors main()'s per-tab logic) ─────────
console.log("classification");
const routes = new Set(["/bi", "/bi/operations", "/bi/kpis"]);
const redirects = new Map([["/bi/kpis", "/bi"]]);
assert(!routes.has(basePath("/totally/missing")), "DEAD: href with no mounted route");
assert(routes.has("/bi/kpis") && redirects.has("/bi/kpis"), "REDIRECT: href resolves but is a stub");
assert(routes.has("/bi/operations") && !redirects.has("/bi/operations"), "OK: real, non-redirect tab");

// ── isMatchCovered (prefix-aware) ─────────────────────────────────────────────
console.log("isMatchCovered");
const r2 = new Set(["/fleet/transport/bookings", "/x"]);
assert(isMatchCovered("/x", r2), "exact route is covered");
assert(isMatchCovered("/fleet/transport", r2), "parent prefix of a route is covered");
assert(!isMatchCovered("/nope", r2), "unrelated path is NOT covered");
assert(!isMatchCovered("/fleet/transport/bookings/extra", r2), "deeper-than-any-route is NOT covered");

// ── basePath ──────────────────────────────────────────────────────────────────
console.log("basePath");
assert(basePath("/module-dashboards?tab=fleet") === "/module-dashboards", "strips query string");
assert(basePath("/x#frag") === "/x", "strips hash");

if (failed) {
  console.error(`\n[check:tabs-coverage.test] ${failed} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\n[check:tabs-coverage.test] all assertions passed");
