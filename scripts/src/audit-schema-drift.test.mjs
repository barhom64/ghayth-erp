#!/usr/bin/env node
//
// scripts/src/audit-schema-drift.test.mjs
//
// Pure-logic fixtures for the audit-schema-drift scanner's template
// sanitiser — no DB needed, so this runs in every environment to guard
// the guard itself.
//
// THE REGRESSION THIS LOCKS IN (Task #492 — sibling of the Task #490
// typed-rawQuery silent skip): `sanitiseTemplate()` used to blank
// `${…}` interpolations with a one-level regex `/\$\{[^}]*\}/g`. That
// `[^}]*` stops at the FIRST `}`, so a NESTED interpolation like
// `${ cond ? `${x}` : '' }` is only partially blanked — leftover
// SQL-looking debris can produce a false finding, or (worse) a real
// quoted identifier drift can slip through unscanned. A clean run then
// silently means "the stripper choked on the braces", not "nothing is
// wrong". These tests assert nested `${…}` is FULLY neutralised, so the
// scanner can never quietly regress to the one-level behaviour. They
// mirror check-schema-drift.test.mjs because both scanners now share the
// depth-aware stripInterpolations() helper.
//
// Run:  node scripts/src/audit-schema-drift.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//

import { sanitiseTemplate, findQuotedIdentifiers } from "./audit-schema-drift.mjs";
import { extractRawQueryBodies } from "./lib/raw-query-bodies.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

console.log("sanitiseTemplate — nested ${…} neutralisation");

// A flat single-level interpolation must collapse to the placeholder.
assert(
  sanitiseTemplate("SELECT a FROM t WHERE id = ${id}")
    .replace(/\s+/g, " ")
    .trim() === "SELECT a FROM t WHERE id = ?",
  "collapses a flat ${…} to a neutral placeholder",
);

// A nested interpolation (an inner `${…}` template inside the outer one)
// must be fully blanked — no inner-identifier or trailing-brace debris.
{
  const out = sanitiseTemplate(
    "SELECT a FROM t WHERE x = ${ cond ? `${inner}` : '' } AND b = 1",
  );
  assert(
    !out.includes("inner"),
    "removes the inner identifier of a nested ${…}",
  );
  assert(
    !out.includes("}") && !out.includes("{"),
    "leaves no stray braces from a nested ${…}",
  );
  assert(
    out.replace(/\s+/g, " ").trim() === "SELECT a FROM t WHERE x = ? AND b = 1",
    "collapses the whole balanced nested ${…} span to one placeholder",
  );
}

// Deeply nested (3 levels) must also fully collapse — proves the walker
// is depth-aware, not just two-level tolerant.
{
  const out = sanitiseTemplate(
    "WHERE q = ${ a ? `${ b ? `${c}` : '' }` : '' } END",
  );
  assert(
    !/[abc{}]/.test(out.replace(/[A-Z= ]/g, "")) &&
      out.replace(/\s+/g, " ").trim() === "WHERE q = ? END",
    "collapses a 3-level nested ${…} to one placeholder",
  );
}

// The exact one-level-regex failure mode, asserted directly: the old
// `/\$\{[^}]*\}/g` would leave `\`} : '' }` debris behind. A real quoted
// identifier sitting AFTER a nested interpolation must still be visible
// to the quoted-identifier harvester (this scanner flags unknown quoted
// names), and no interpolation guts may survive.
{
  const out = sanitiseTemplate(
    'SELECT "realCol" FROM t WHERE x = ${ f(`${y}`) }',
  );
  assert(
    out.includes('"realCol"'),
    "preserves a real quoted identifier next to a nested ${…}",
  );
  assert(
    !out.includes("y") || !/\$\{|`/.test(out),
    "leaves no interpolation guts (no ${ or backticks) after stripping",
  );
}

// Regression guard for the silent typed-call skip (Task #490 sibling): a
// rawQuery written with an inline — even NESTED — generic type argument
// must be EXTRACTED and its quoted identifiers scanned. A bogus quoted
// column inside such a typed call has to surface as an unknown identifier;
// if the shared extractor silently skipped the typed body the scanner
// would report zero ids and the drift would ship unscanned.
console.log("typed rawQuery<…> bodies are scanned for schema drift");
{
  const src =
    'await rawQuery<Record<string, unknown>>(`SELECT "bogusDriftCol" FROM employees`);';
  const bodies = extractRawQueryBodies(src);
  assert(
    bodies.length === 1,
    "extracts the nested-generic typed rawQuery body",
  );
  const ids = findQuotedIdentifiers(sanitiseTemplate(bodies[0]));
  assert(
    ids.includes("bogusDriftCol"),
    'flags a bogus quoted identifier inside a typed rawQuery<…> call',
  );
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll audit-schema-drift fixtures passed.");
process.exit(0);
