#!/usr/bin/env node
//
// scripts/src/check-display-tables.test.mjs
//
// Pure-logic fixtures for the display-table detector. Exercises
// `fileHasDisplayTable` against page snippets that MUST flag (raw <table>,
// line-start or inline) and ones that MUST NOT (no table, comment prose) —
// no file/DB access, so it guards the guard itself.
//
// Run:  node scripts/src/check-display-tables.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//
import { fileHasDisplayTable } from "./check-display-tables.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

console.log("positives — must FLAG (raw <table> in a page)");
assert(
  fileHasDisplayTable(`        <table className="w-full text-sm">\n          <tbody></tbody>\n        </table>`),
  "line-start <table>",
);
assert(
  fileHasDisplayTable(`        <div className="overflow-x-auto"><table className="w-full">\n        </table></div>`),
  "inline <div><table> (wrapped but still raw)",
);
assert(
  fileHasDisplayTable(`              <div className="rounded-xl border overflow-hidden">\n                <table>\n                </table>\n              </div>`),
  "<table> with no className",
);

console.log("negatives — must NOT flag");
assert(
  !fileHasDisplayTable(`  return <DataTable columns={cols} data={rows} />;`),
  "page already on DataTable (no raw table)",
);
assert(
  !fileHasDisplayTable(` * The page deliberately hand-rolls a raw <table> in M4.\n  return <div>no table here</div>;`),
  "JSDoc comment mentioning <table> (not a real element)",
);
assert(
  !fileHasDisplayTable(`  // legacy <table> removed in favour of DataTable\n  return <DataTable />;`),
  "// comment mentioning <table>",
);
assert(
  !fileHasDisplayTable(`  return (\n    <TableCard>\n      <DataTable />\n    </TableCard>\n  );`),
  "component named like a table but no <table> element",
);

if (failed) {
  console.error(`\n[check:display-tables:test] ${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log("\n[check:display-tables:test] all assertions passed.");
