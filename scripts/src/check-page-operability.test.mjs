#!/usr/bin/env node
//
// scripts/src/check-page-operability.test.mjs
// Pure-logic fixtures for the operability census classifiers.
// Run:  node scripts/src/check-page-operability.test.mjs

import {
  hasBackShell,
  hasPrint,
  hasSort,
  hasSearch,
  pageType,
  assess,
} from "./check-page-operability.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) console.log(`  ✓ ${label}`);
  else { console.error(`  ✗ ${label}`); failed++; }
}

console.log("element detectors");
assert(hasBackShell("<PageShell title='x'/>"), "PageShell ⇒ back");
assert(hasBackShell("<CreatePageLayout backPath='/x'/>"), "CreatePageLayout ⇒ back");
assert(!hasBackShell("<div>x</div>"), "bare div ⇒ no back shell");
assert(hasPrint("<PrintButton entityType='x'/>"), "PrintButton ⇒ print");
assert(!hasPrint("<Button>طباعة</Button>"), "plain button is not PrintButton");
assert(hasSort("<DataTable data={x}/>"), "DataTable ⇒ sort");
assert(!hasSort("<ul/>"), "no DataTable ⇒ no sort");

console.log("hasSearch (incl. DataTable built-in toolbar)");
assert(hasSearch("<AdvancedFilters/>"), "AdvancedFilters ⇒ search");
assert(hasSearch("<DataTable data={x}/>"), "DataTable w/o noToolbar ⇒ built-in search");
assert(!hasSearch("<DataTable data={x} noToolbar/>"), "DataTable noToolbar + nothing ⇒ no search");
assert(hasSearch('<DataTable noToolbar/><AdvancedFilters/>'), "noToolbar but AdvancedFilters ⇒ search");

console.log("pageType");
assert(pageType("/x/create", "", "") === "form", "/create ⇒ form");
assert(pageType("/x", "/a/pages/create/x.tsx", "") === "form", "pages/create ⇒ form");
assert(pageType("/x/:id", "", "") === "detail", ":id ⇒ detail");
assert(pageType("/x", "", "<EntityDetailPage/>") === "detail", "EntityDetailPage ⇒ detail");
assert(pageType("/x", "", "<DataTable/>") === "list", "DataTable ⇒ list");
assert(pageType("/x", "", "<PageShell><Card/></PageShell>") === "page", "shell-only ⇒ page");

console.log("assess (applicability matrix)");
assert(assess("list", false, "print").state === "missing", "list w/o print ⇒ missing");
assert(assess("list", true, "search").state === "present", "list w/ search ⇒ present");
assert(assess("form", false, "print").state === "na", "form: print n/a");
assert(assess("page", false, "sort").state === "na", "page: sort n/a");
assert(assess("detail", false, "sort").state === "na", "detail: sort n/a");

if (failed) {
  console.error(`\n[check:page-operability.test] ${failed} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\n[check:page-operability.test] all assertions passed");
