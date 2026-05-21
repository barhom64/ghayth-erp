#!/usr/bin/env node
//
// scripts/src/check-migration-policy.test.mjs — self-test for the breaking-
// change detection in check-migration-policy.mjs ("guard the guard").
//
// Pure logic: no DB, no filesystem, no migration directory needed — so it
// runs in every environment via scripts/guard.sh, exactly like
// check-ghost-rows.test.mjs. Exits 0 when every fixture passes, 1 otherwise.

import { stripSql, findBreakingStatements } from "./check-migration-policy.mjs";

let failed = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}`);
    failed++;
  }
}

/** True when the SQL (after comment/string stripping) flags as breaking. */
const breaks = (sql) => findBreakingStatements(stripSql(sql)).length > 0;

console.log("findBreakingStatements — backward-incompatible statements ARE flagged");
check("ALTER COLUMN … TYPE", breaks(`ALTER TABLE t ALTER COLUMN c TYPE bigint;`));
check("ALTER … SET DATA TYPE (COLUMN keyword omitted)", breaks(`ALTER TABLE t ALTER c SET DATA TYPE text;`));
check("SET NOT NULL on an existing column", breaks(`ALTER TABLE t ALTER COLUMN c SET NOT NULL;`));
check("DROP CONSTRAINT", breaks(`ALTER TABLE t DROP CONSTRAINT t_chk;`));
check("ADD COLUMN … NOT NULL without DEFAULT", breaks(`ALTER TABLE t ADD COLUMN c integer NOT NULL;`));
check("ADD COLUMN … NOT NULL (COLUMN keyword omitted)", breaks(`ALTER TABLE t ADD c integer NOT NULL;`));

console.log("findBreakingStatements — additive / safe statements are NOT flagged");
check("ADD COLUMN … NOT NULL DEFAULT", !breaks(`ALTER TABLE t ADD COLUMN c integer NOT NULL DEFAULT 0;`));
check("ADD COLUMN nullable", !breaks(`ALTER TABLE t ADD COLUMN IF NOT EXISTS c integer;`));
check("ADD COLUMN … DEFAULT now()", !breaks(`ALTER TABLE t ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();`));
check("NOT NULL inside a fresh CREATE TABLE", !breaks(`CREATE TABLE t (id serial PRIMARY KEY, c integer NOT NULL);`));
check("ADD CONSTRAINT … CHECK … NOT VALID", !breaks(`ALTER TABLE t ADD CONSTRAINT t_chk CHECK (s IN ('a','b')) NOT VALID;`));
check("breaking keyword only inside a -- comment", !breaks(`-- @rollback: ALTER TABLE t DROP CONSTRAINT t_chk;\nALTER TABLE t ADD COLUMN c integer;`));
check("plain ALTER TABLE … ADD COLUMN (no TYPE clause)", !breaks(`ALTER TABLE t ADD COLUMN c integer;`));

if (failed > 0) {
  console.error(`\n[check-migration-policy.test] FAIL — ${failed} fixture(s) failed.`);
  process.exit(1);
}
console.log("\n[check-migration-policy.test] PASS — all breaking-detection fixtures passed.");
