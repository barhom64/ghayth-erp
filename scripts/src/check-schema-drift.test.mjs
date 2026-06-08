#!/usr/bin/env node
//
// scripts/src/check-schema-drift.test.mjs
//
// Pure-logic fixtures for the schema-drift scanner's template
// sanitiser — no DB needed, so this runs in every environment to guard
// the guard itself.
//
// THE REGRESSION THIS LOCKS IN (Task #492 — sibling of the Task #490
// typed-rawQuery silent skip): `sanitiseTemplate()` used to blank
// `${…}` interpolations with a one-level regex `/\$\{[^}]*\}/g`. That
// `[^}]*` stops at the FIRST `}`, so a NESTED interpolation like
// `${ cond ? `${x}` : '' }` is only partially blanked — leftover
// SQL-looking debris can produce a false finding, or (worse) a real
// identifier/column drift can slip through unscanned. A clean run then
// silently means "the stripper choked on the braces", not "nothing is
// wrong". These tests assert nested `${…}` is FULLY neutralised, so the
// scanner can never quietly regress to the one-level behaviour.
//
// Run:  node scripts/src/check-schema-drift.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//

import {
  collectLocallyDefinedIdentifiers,
  findQuotedIdentifiers,
  findTableReferences,
  sanitiseTemplate,
} from "./check-schema-drift.mjs";
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
// `/\$\{[^}]*\}/g` would leave `\`} : '' }` debris behind. Prove that a
// quoted identifier sitting AFTER a nested interpolation is still seen
// as plain SQL (not swallowed) AND that no interpolation guts survive.
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

// ---------------------------------------------------------------------
// Typed-rawQuery extraction — the silent-skip regression this guards.
//
// check-schema-drift used to carry its OWN `extractRawQueryBodies` with
// the narrow matcher `/rawQuery\s*\(\s*`/g`, which has no generic
// handling and therefore silently skipped every `rawQuery<RowType>(`…`)`
// call. A real column drift inside a typed query was never scanned and
// the guard reported a clean run anyway. It now routes through the shared
// generic-tolerant `extractRawQueryBodies`. These fixtures prove a typed
// call's body is actually extracted and its bogus column surfaced — so a
// reintroduced narrow matcher would fail loudly here.
console.log("\nextractRawQueryBodies — typed rawQuery<…> not silently skipped");

{
  const source =
    'const rows = await rawQuery<Record<string, unknown>>(`SELECT "bogusColumn" FROM t`);';
  const bodies = extractRawQueryBodies(source);
  assert(
    bodies.length === 1,
    "extracts the body of a nested-generic rawQuery<Record<string, unknown>>(…) call",
  );
  const ids = bodies.flatMap((b) =>
    findQuotedIdentifiers(sanitiseTemplate(b)).map((x) => x.name),
  );
  assert(
    ids.includes("bogusColumn"),
    "surfaces the bogus quoted column from inside the typed call so it can be flagged",
  );
}

// The exact narrow-matcher failure mode, asserted directly: the old
// `/rawQuery\s*\(\s*`/g` returns ZERO bodies for a typed call, so a
// nonexistent column would never be flagged.
{
  const narrow = /rawQuery\s*\(\s*`/g;
  const source =
    'await rawQuery<Record<string, unknown>>(`SELECT "bogusColumn" FROM t`);';
  assert(
    narrow.exec(source) === null && extractRawQueryBodies(source).length === 1,
    "narrow matcher misses the typed call while the shared extractor catches it",
  );
}

// ---------------------------------------------------------------------
// findTableReferences — FROM-keyword false positives newly surfaced by
// scanning typed rawQuery<…> calls.
//
// `FROM` is overloaded: inside `EXTRACT(field FROM source)` (and TRIM /
// SUBSTRING / OVERLAY) it is a function delimiter, not a table source.
// Bare `pg_*` system catalogs are likewise never in the public
// information_schema snapshot. These stayed hidden while typed calls were
// skipped; once scanned they would mis-report bogus tables, so they must
// be filtered.
console.log("\nfindTableReferences — EXTRACT/TRIM FROM & pg_* are not tables");

{
  const names = (sql) => findTableReferences(sql).map((r) => r.name);

  assert(
    !names('SELECT EXTRACT(YEAR FROM "startDate") FROM financial_periods').includes(
      "startDate",
    ),
    "EXTRACT(YEAR FROM \"startDate\") does not flag startDate as a table",
  );
  assert(
    names('SELECT EXTRACT(YEAR FROM "startDate") FROM financial_periods').includes(
      "financial_periods",
    ),
    "the real FROM table after an EXTRACT is still detected",
  );
  assert(
    !names("SELECT EXTRACT(DAY FROM NOW() - x) FROM t").includes("NOW"),
    "EXTRACT(DAY FROM NOW() - x) does not flag NOW as a table",
  );
  assert(
    !names("SELECT TRIM(BOTH ' ' FROM name) FROM users").includes("name"),
    "TRIM(... FROM name) does not flag name as a table",
  );
  assert(
    !names("SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public'").includes(
      "pg_tables",
    ),
    "bare pg_tables system catalog is not flagged as a table",
  );
}

// ---------------------------------------------------------------------
// collectLocallyDefinedIdentifiers — columns of tables a route
// self-creates via exec()/rawExecute() CREATE TABLE (not just rawQuery)
// must be treated as locally defined. Otherwise, once typed rawQuery<…>
// calls are scanned, a column declared only in an `exec(`CREATE TABLE…`)`
// is wrongly reported as drift (the fx_revaluations.revaluationDate case).
console.log(
  "\ncollectLocallyDefinedIdentifiers — exec()-created CREATE TABLE columns are local",
);

{
  const source = [
    "async function ensure() {",
    "  await exec(`",
    "    CREATE TABLE IF NOT EXISTS fx_revaluations (",
    "      id SERIAL PRIMARY KEY,",
    '      "companyId" INTEGER NOT NULL,',
    '      "revaluationDate" DATE NOT NULL,',
    '      "totalImpact" NUMERIC(15,2)',
    "    )",
    "  `);",
    "}",
    'const rows = await rawQuery<Record<string, unknown>>(`SELECT "revaluationDate" FROM fx_revaluations`);',
  ].join("\n");
  const bodies = extractRawQueryBodies(source);
  const local = collectLocallyDefinedIdentifiers(bodies, source);
  assert(
    local.has("fx_revaluations"),
    "table created via exec() CREATE TABLE is treated as locally defined",
  );
  assert(
    local.has("revaluationDate"),
    "column declared only in an exec() CREATE TABLE is treated as locally defined",
  );
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll check-schema-drift fixtures passed.");
process.exit(0);
