#!/usr/bin/env node
// check-dump-drift.mjs — fails when db/schema_pre.sql falls behind the
// migrations it claims to include.
//
// Contract (db/.baseline-cutoff): every migration <= cutoff is ASSUMED to
// be inside the schema dump — fresh installs (provision-agent-db.sh,
// db/bootstrap.sh, guard.yml, migrate.ts baseline) never re-run them. If a
// pre-cutoff migration created a table that the dump doesn't carry, every
// fresh environment is silently missing it (the 2026-06 incident:
// message_read_state/thread_snoozes/administrations/employee_lifecycle_events
// were absent → GET /api/inbox/threads 500'd on every clean install).
//
// The check is deliberately narrow + zero-dependency: it extracts every
// `CREATE TABLE [IF NOT EXISTS] <name>` from migrations <= cutoff and
// asserts the table exists in the dump text. Columns/indexes/data drift
// are out of scope (covered at runtime by check-schema-drift against a
// live DB); table-level presence is the failure mode that actually bit.
//
// Run: pnpm run check:dump-drift   (wired into scripts/guard.sh)
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG_DIR = resolve(ROOT, "artifacts/api-server/src/migrations");

const cutoff = readFileSync(resolve(ROOT, "db/.baseline-cutoff"), "utf8")
  .split("\n")
  .find((l) => l.trim() && !l.startsWith("#"))
  ?.trim();
if (!cutoff) {
  console.error("✗ check-dump-drift: db/.baseline-cutoff missing or empty");
  process.exit(1);
}

// Version-aware compare, mirrors src/lib/migrate.ts compareMigrationFiles
// (plain string compare misorders once prefixes pass 3 digits).
const num = (f) => parseInt(f, 10) || 0;
const isPreCutoff = (f) =>
  num(f) < num(cutoff) || (num(f) === num(cutoff) && f <= cutoff);

const dump =
  readFileSync(resolve(ROOT, "db/schema_pre.sql"), "utf8") +
  readFileSync(resolve(ROOT, "db/schema_post.sql"), "utf8");

// Tables present in the dump. VIEWs count too: a migration may guard its
// CREATE TABLE behind `IF NOT EXISTS (... pg_class ...)` because the base
// schema ships the same relation as a VIEW (e.g. payroll_records).
const dumped = new Set(
  [
    ...dump.matchAll(/^CREATE TABLE (?:public\.)?"?([a-zA-Z0-9_]+)"?/gm),
    ...dump.matchAll(/^CREATE (?:OR REPLACE )?VIEW (?:public\.)?"?([a-zA-Z0-9_]+)"?/gm),
  ].map((m) => m[1]),
);

const CREATE_RE =
  /CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?/gi;
// A later pre-cutoff migration may DROP a table an earlier one created
// (renames/consolidations) — a dropped table is legitimately absent.
const DROP_RE = /DROP TABLE(?: IF EXISTS)?\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?/gi;

const created = new Map(); // table -> migration file (last creator wins)
const dropped = new Set();
for (const f of readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort()) {
  if (!isPreCutoff(f)) continue;
  const sql = readFileSync(resolve(MIG_DIR, f), "utf8")
    // strip SQL comments so commented-out DDL doesn't count
    .replace(/--.*$/gm, "");
  for (const m of sql.matchAll(CREATE_RE)) {
    created.set(m[1], f);
    dropped.delete(m[1]);
  }
  for (const m of sql.matchAll(DROP_RE)) dropped.add(m[1]);
}

const missing = [...created.entries()].filter(
  ([t]) => !dumped.has(t) && !dropped.has(t),
);

if (missing.length) {
  console.error(
    `✗ check-dump-drift: ${missing.length} table(s) created by pre-cutoff migrations (<= ${cutoff}) are MISSING from db/schema_pre.sql:`,
  );
  for (const [t, f] of missing) console.error(`    ${t}  (created by ${f})`);
  console.error(
    "  Fresh installs assume these exist and will 500. Regenerate the dump:\n" +
      "    DATABASE_URL=<head-of-main DB> bash db/dump-schema.sh\n" +
      "  (build the head DB with scripts/provision-agent-db.sh first).",
  );
  process.exit(1);
}

console.log(
  `✓ check-dump-drift: dump covers all ${created.size} tables created by migrations <= ${cutoff} (${dumped.size} tables in dump).`,
);
