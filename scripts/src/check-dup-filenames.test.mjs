#!/usr/bin/env node
//
// scripts/src/check-dup-filenames.test.mjs
//
// Pure-logic fixtures for the duplicate-basename detector. Exercises
// `groupDuplicates` against path lists with and without collisions, without
// touching any file or DB — so it runs in every environment and guards the
// guard itself.
//
// Run:  node scripts/src/check-dup-filenames.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//

import { groupDuplicates } from "./check-dup-filenames.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  \u2713 ${label}`);
  } else {
    console.error(`  \u2717 ${label}`);
    failed++;
  }
}

// ── positives: same basename in 2+ paths must be grouped ────────────────
console.log("positives — must DETECT duplicates");
{
  const d = groupDuplicates([
    "artifacts/ghayth-erp/src/pages/legal/policies-tab.tsx",
    "artifacts/ghayth-erp/src/pages/governance/policies-tab.tsx",
  ]);
  assert(d.has("policies-tab.tsx"), "two policies-tab.tsx in different dirs flagged");
  assert(d.get("policies-tab.tsx").length === 2, "duplicate set records both paths");
}
{
  const d = groupDuplicates([
    "a/settings.tsx",
    "b/settings.tsx",
    "c/settings.tsx",
  ]);
  assert(d.get("settings.tsx").length === 3, "three-way collision records all paths");
}
{
  // paths are returned sorted for stable output
  const d = groupDuplicates(["z/x.ts", "a/x.ts"]);
  assert(
    JSON.stringify(d.get("x.ts")) === JSON.stringify(["a/x.ts", "z/x.ts"]),
    "duplicate paths returned sorted",
  );
}

// ── negatives: unique basenames must NOT be grouped ─────────────────────
console.log("negatives — must NOT flag");
{
  const d = groupDuplicates([
    "artifacts/ghayth-erp/src/pages/a.tsx",
    "artifacts/ghayth-erp/src/pages/b.tsx",
    "artifacts/ghayth-erp/src/lib/c.ts",
  ]);
  assert(d.size === 0, "all-unique basenames produce no duplicates");
}
{
  // same basename but only once → not a duplicate
  const d = groupDuplicates(["only/index.tsx"]);
  assert(!d.has("index.tsx"), "single occurrence is not a duplicate");
}
{
  // extension matters: foo.ts and foo.tsx are distinct basenames
  const d = groupDuplicates(["a/foo.ts", "b/foo.tsx"]);
  assert(d.size === 0, "foo.ts and foo.tsx are distinct basenames");
}

if (failed) {
  console.error(`\n[check:dup-filenames:tests] FAIL — ${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log("\n[check:dup-filenames:tests] OK — all fixtures pass.");
