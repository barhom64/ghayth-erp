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
  effectiveSource,
} from "./check-page-operability.mjs";
import path from "node:path";
import url from "node:url";

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
// custom controlled search box (state named *search*/query bound to an input)
assert(hasSearch('const [search, setSearch] = useState(""); <Input value={search} placeholder="اسم..." /><DataTable noToolbar/>'), "custom search state+binding ⇒ search");
assert(hasSearch('const [userSearch, setUserSearch] = useState(""); <Input value={userSearch} /><DataTable noToolbar/>'), "userSearch state+binding ⇒ search");
assert(!hasSearch('const [search, setSearch] = useState(""); <DataTable noToolbar/>'), "search state but no input binding ⇒ no search");
assert(!hasSearch('const [count, setCount] = useState(0); <Input value={count} /><DataTable noToolbar/>'), "non-search state binding ⇒ no search");

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

console.log("effectiveSource (thin-wrapper delegation)");
{
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const APP = path.resolve(__dirname, "..", "..", "artifacts/ghayth-erp/src");
  // A synthetic wrapper that renders a relative default import is unioned
  // with the parent's source; one without a render is left untouched.
  const wrapperFile = path.join(APP, "pages/finance/customer-statement.tsx");
  const wrapperSrc = `import AccountStatementPage from "./account-statement";\nexport default () => <AccountStatementPage entityType="customer" />;`;
  const merged = effectiveSource(wrapperFile, wrapperSrc);
  assert(hasPrint(merged), "wrapper unions parent ⇒ PrintButton seen via delegation");
  const noRender = `import AccountStatementPage from "./account-statement";\nexport default () => null;`;
  assert(!hasPrint(effectiveSource(wrapperFile, noRender)), "imported-but-not-rendered ⇒ not followed");
}

if (failed) {
  console.error(`\n[check:page-operability.test] ${failed} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\n[check:page-operability.test] all assertions passed");
