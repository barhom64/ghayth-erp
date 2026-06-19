#!/usr/bin/env node
//
// scripts/src/check-responsive-tables.test.mjs
//
// Pure-logic fixtures for the responsive-table detector. Exercises
// `fileHasBareTable` against bare (must flag) and wrapped/comment (must not
// flag) snippets — no file/DB access, so it guards the guard itself.
//
// Run:  node scripts/src/check-responsive-tables.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//
import { fileHasBareTable } from "./check-responsive-tables.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

console.log("positives — must FLAG (bare table)");
assert(
  fileHasBareTable(`      <div className="rounded border">\n        <table className="w-full">\n        </table>\n      </div>`),
  "table whose wrapper has no overflow",
);
assert(
  fileHasBareTable(`        <table className="w-full text-sm">\n          <tbody></tbody>\n        </table>`),
  "table with no wrapper at all",
);
assert(
  fileHasBareTable(`      <div className="rounded-xl border overflow-hidden">\n        <table className="w-full">\n        </table>\n      </div>`),
  "table inside overflow-HIDDEN (clips on mobile)",
);

console.log("negatives — must NOT flag");
assert(
  !fileHasBareTable(`        <div className="overflow-x-auto">\n        <table className="w-full">\n        </table>\n        </div>`),
  "table wrapped in overflow-x-auto",
);
assert(
  !fileHasBareTable(`        <div className="overflow-x-auto"><table className="w-full"></table></div>`),
  "inline overflow-x-auto wrap",
);
assert(
  !fileHasBareTable(`        <div className="max-h-72 overflow-auto border">\n          <table className="w-full">\n          </table>\n        </div>`),
  "table inside overflow-auto (x+y scroll)",
);
assert(
  !fileHasBareTable(` * create pages hand-roll a raw <table> + add/remove logic.\n  return <div>no table here</div>;`),
  "JSDoc comment mentioning <table> (not a real element)",
);

if (failed) {
  console.error(`\n[check:responsive-tables:test] ${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log("\n[check:responsive-tables:test] all assertions passed.");
