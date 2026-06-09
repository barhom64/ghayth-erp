// scripts/src/check-write-path-contracts.mjs
//
// Meta-runner: the full write-path schema-contract detector suite, one command.
//
// WHY
//   The #1594 write-path review produced five table-anchored detectors, each of
//   which closed a distinct class of runtime-only 500 (a write whose SQL is
//   syntactically fine but contradicts the live schema, so unit tests never see
//   it). They share a hard requirement — a database at migration HEAD — which is
//   why none is wired into guard.sh (guard CI provisions Postgres from the
//   db/schema.sql dump = baseline, and merely marks migrations applied without
//   running them, so post-dump columns/constraints read as false positives).
//
//   This runner is the single entry point a developer (or a future CI lane that
//   boots a migration-HEAD database) invokes to enforce all five at once.
//
// THE SUITE (each is also runnable on its own — see package.json)
//   check:insert-columns        INSERT names a column the table doesn't have
//   check:required-columns      INSERT omits a NOT-NULL-without-default column
//   check:update-columns        UPDATE SET names a column the table doesn't have
//   check:constraint-literals   a literal value rejected by the column's CHECK
//   check:on-conflict-targets   ON CONFLICT (cols) with no matching unique index
//
// EXIT: 0 if every detector is clean, 1 if any reports a violation (all run in
//   --strict so the first non-clean detector makes the suite fail, but every
//   detector still runs so one invocation surfaces all classes at once).
//
// USAGE: DATABASE_URL=… node scripts/src/check-write-path-contracts.mjs

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error("[check:write-path-contracts] ERROR — DATABASE_URL is not set. This suite needs a live Postgres at migration HEAD.");
  process.exit(2);
}

const DETECTORS = [
  ["insert-columns",      "check-insert-columns.mjs"],
  ["required-columns",    "check-required-columns.mjs"],
  ["update-columns",      "check-update-columns.mjs"],
  ["constraint-literals", "check-check-constraint-literals.mjs"],
  ["on-conflict-targets", "check-on-conflict-targets.mjs"],
];

let failed = 0;
const summary = [];
for (const [name, file] of DETECTORS) {
  const res = spawnSync(process.execPath, [join(HERE, file), "--strict"], {
    stdio: "inherit",
    env: process.env,
  });
  const ok = res.status === 0;
  if (!ok) failed++;
  summary.push(`   ${ok ? "✓" : "✗"} check:${name}`);
}

console.log("\n[check:write-path-contracts] suite summary:");
console.log(summary.join("\n"));
if (failed > 0) {
  console.log(`\n[check:write-path-contracts] ${failed} detector(s) found violations — see output above.`);
  process.exit(1);
}
console.log("\n[check:write-path-contracts] OK — all five write-path schema-contract detectors are clean.");
process.exit(0);
