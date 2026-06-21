#!/usr/bin/env node
//
// scripts/src/check-filter-bar-coverage.test.mjs
//
// Pure-logic fixtures for the filter/search-bar inventory (جرد). Exercises the
// classifiers against positive/negative snippets without touching any file or
// DB — guards the guard itself.
//
// Run:  node scripts/src/check-filter-bar-coverage.test.mjs

import {
  isListPage,
  usesCanonicalBar,
  hasHandRolledFilter,
  filtersServerSide,
  classify,
} from "./check-filter-bar-coverage.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) console.log(`  ✓ ${label}`);
  else { console.error(`  ✗ ${label}`); failed++; }
}

console.log("isListPage");
assert(isListPage("<DataTable data={x}/>"), "detects <DataTable>");
assert(!isListPage("<Card>x</Card>"), "no DataTable → false");

console.log("usesCanonicalBar");
assert(usesCanonicalBar("<AdvancedFilters config={c}/>"), "AdvancedFilters → canonical");
assert(usesCanonicalBar('<DataTable searchPlaceholder="بحث" data={x}/>'), "DataTable searchPlaceholder → canonical");
assert(!usesCanonicalBar('<DataTable noToolbar searchPlaceholder="x" data={x}/>'), "noToolbar cancels the built-in toolbar");
assert(!usesCanonicalBar("<DataTable data={x}/>"), "bare DataTable → not canonical");

console.log("hasHandRolledFilter");
assert(hasHandRolledFilter('<Button variant={statusFilter === s ? "default" : "outline"}>x</Button>'), "status-toggle buttons");
assert(hasHandRolledFilter("<Select onValueChange={setStatusFilter}>"), "filter Select");
assert(!hasHandRolledFilter('<div className="flex gap-2"><Button onClick={save}>حفظ</Button></div>'), "actions row is NOT a filter (no false positive)");

console.log("filtersServerSide");
assert(filtersServerSide("const url = `/x?status=${statusFilter}`"), "filter var in URL → server-side");
assert(filtersServerSide("qsParts.push(`status=${s}`)"), "qsParts assembly → server-side");
assert(filtersServerSide("useApiQuery([`k`, seasonFilter], `/x?season=${seasonFilter}`)"), "filter var in useApiQuery call → server-side");
assert(!filtersServerSide("const filtered = items.filter(i => i.status === statusFilter)"), "in-memory filter → client-side");

console.log("classify");
assert(classify("<Card/>") === "not-list", "no DataTable → not-list");
assert(classify("<DataTable data={x}/><AdvancedFilters/>") === "canonical", "canonical bar");
assert(
  classify('<DataTable data={f} noToolbar/><Button variant={statusFilter===s?"default":"outline"}/>const filtered=items.filter(x=>x.status===statusFilter)') === "handrolled-client",
  "hand-rolled + in-memory → client",
);
assert(
  classify('<DataTable data={d} noToolbar/><Select onValueChange={setStatusFilter}/>useApiQuery([`k`,statusFilter],`/x?status=${statusFilter}`);') === "handrolled-server",
  "hand-rolled + server query → server",
);

if (failed) {
  console.error(`\n[check:filter-bar-coverage.test] ${failed} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\n[check:filter-bar-coverage.test] all assertions passed");
