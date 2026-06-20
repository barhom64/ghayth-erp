#!/usr/bin/env node
//
// scripts/src/check-scope-suffix-glue.test.mjs
//
// Pure-logic fixtures for the "scope suffix glued with the wrong query
// separator" detector. The separator (`&` vs `?`) is read from the in-scope
// `scopeSuffix = ...` definition, so each fixture declares one. Exercises both
// separator invariants against the real bug class and legitimate usage without
// touching any file or DB, so it runs in every environment and guards the
// guard itself.
//
// Exits 0 on pass, 1 on any assertion failure.
//
import { findScopeSuffixGlue, collectSuffixDefs } from "./check-scope-suffix-glue.mjs";

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures++;
    console.error(`  \u2717 ${label}`);
  }
}

const AMP = 'const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";';
const QM = 'const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";';

// ── separator detection ─────────────────────────────────────────────────────
assert(collectSuffixDefs(AMP)[0].sep === "&", "reads `&` separator from definition");
assert(collectSuffixDefs(QM)[0].sep === "?", "reads `?` separator from definition");

// ── sep `&`: the real bug class (no `?` before ${scopeSuffix}) ───────────────
assert(
  findScopeSuffixGlue(`${AMP}\nuseApiQuery(["k"], \`/hr/stats\${scopeSuffix}\`)`).length === 1,
  "sep `&`: flags `/hr/stats${scopeSuffix}` (no `?`)",
);
assert(
  findScopeSuffixGlue(`${AMP}\nuseApiQuery(["k"], \`/employees?page=1&limit=1\${scopeSuffix}\`)`).length === 0,
  "sep `&`: does NOT flag a path that already has `?page=1`",
);

// ── sep `?`: bare path is CORRECT; an existing `?` is the double-`?` bug ──────
assert(
  findScopeSuffixGlue(`${QM}\nuseApiQuery(["k"], \`/my-space\${scopeSuffix}\`)`).length === 0,
  "sep `?`: does NOT flag a bare path (the correct form for a `?` separator)",
);
assert(
  findScopeSuffixGlue(`${QM}\nuseApiQuery(["k"], \`/x?page=1\${scopeSuffix}\`)`).length === 1,
  "sep `?`: flags `/x?page=1${scopeSuffix}` (would produce a double `?`)",
);

// ── the fixed hr.tsx form (no scopeSuffix var at all) ───────────────────────
assert(
  findScopeSuffixGlue('useApiQuery(["k"], `/hr/stats?${scopeQueryString || ""}`)').length === 0,
  "does NOT flag the fixed `/hr/stats?${scopeQueryString || \"\"}` form",
);

// ── nearest-preceding definition wins (two scopes in one file) ──────────────
{
  const src = `
    ${AMP}
    const a = useApiQuery(["a"], \`/properties/contracts/\${id}/schedule?x=1\${scopeSuffix}\`);
    ${QM}
    const b = useApiQuery(["b"], \`/properties/contracts\${scopeSuffix}\`);
  `;
  assert(
    findScopeSuffixGlue(src).length === 0,
    "resolves the nearest definition per usage (& after `?x=1`, then `?` on a bare path) — both OK",
  );
}

// ── no resolvable definition -> skipped (can't judge) ───────────────────────
assert(
  findScopeSuffixGlue('useApiQuery(["k"], `/hr/stats${scopeSuffix}`)').length === 0,
  "skips a usage with no in-scope definition (cannot determine the separator)",
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll check-scope-suffix-glue fixtures passed.");
