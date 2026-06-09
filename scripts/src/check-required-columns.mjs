// scripts/src/check-required-columns.mjs
//
// Diagnostic: NOT-NULL-without-default columns omitted from INSERT (live schema).
//
// WHY THIS EXISTS (the gap it closes)
//   A column that is NOT NULL and has no DEFAULT must appear in every INSERT, or
//   Postgres rejects the write with `null value in column "X" violates not-null
//   constraint` — a runtime 500 that unit tests miss unless they exercise that
//   exact path. This is the inverse of check-insert-columns (which catches
//   columns that DON'T exist on the target): here the column exists and is
//   REQUIRED, but the INSERT leaves it out.
//
//   Found + fixed four such silent breakages (#1594 write-path review):
//     • hr_leave_balances omitted assignmentId — the yearly renewal cron threw
//       on every run (the error was caught + logged, so balances silently never
//       renewed),
//     • tasks omitted `type` in rulesEngine / legal hearing-task creation,
//     • umrah_groups omitted nuskGroupNumber in batch dimension auto-create.
//
// HOW
//   Loads each table's required columns from the live schema (information_schema:
//   is_nullable='NO' AND column_default IS NULL AND is_identity='NO', minus the
//   serial `id`), scans api-server source for `INSERT INTO <table> ( <cols> )`,
//   and reports any required column missing from that list. Table-anchored, so a
//   column required on one table never trips an INSERT into another.
//
// KNOWN LIMITATION — a NOT-NULL column filled by a BEFORE-INSERT trigger would
//   read as a false positive (the value is supplied by the DB, not the column
//   list). None exist today (clean run); add an allowlist here if one appears.
//
// IMPORTANT — accuracy depends on a FULLY-MIGRATED database (migration HEAD), so
//   this is NOT wired into guard.sh (CI provisions Postgres from the
//   db/schema.sql dump = baseline). Manual diagnostic, like check-insert-columns
//   and check-check-constraint-literals.
//
// EXIT: advisory by default (0). `--strict` exits 1 if any violation is found.
//
// USAGE: DATABASE_URL=… node scripts/src/check-required-columns.mjs [--strict]

import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC_DIR = join(REPO_ROOT, "artifacts/api-server/src");
const STRICT = process.argv.includes("--strict");

function loadRequired() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[check:required-columns] ERROR — DATABASE_URL is not set. This check needs a live Postgres connection.");
    process.exit(2);
  }
  const sql =
    "SELECT table_name || '|' || column_name FROM information_schema.columns " +
    "WHERE table_schema='public' AND is_nullable='NO' AND column_default IS NULL " +
    "AND is_identity='NO' AND column_name <> 'id';";
  const res = spawnSync("psql", [url, "-Atqc", sql], { encoding: "utf8" });
  if (res.status !== 0) {
    console.error("[check:required-columns] ERROR — psql failed:\n" + (res.stderr || res.stdout));
    process.exit(2);
  }
  const req = new Map(); // table -> Set(required columns)
  for (const line of res.stdout.split("\n")) {
    const [t, c] = line.split("|");
    if (!t || !c) continue;
    const set = req.get(t) ?? new Set();
    set.add(c); req.set(t, set);
  }
  return req;
}

function* tsFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* tsFiles(p);
    else if (e.name.endsWith(".ts")) yield p;
  }
}

// Split a SQL list on top-level commas (respecting parens + quotes).
function splitTop(s) {
  const out = [];
  let depth = 0, q = null, cur = "";
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function main() {
  const req = loadRequired();
  const insertRe = /INSERT\s+INTO\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(([^;]*?)\)\s*(?:VALUES|SELECT|ON\s+CONFLICT)/gis;
  const found = new Map(); // "table: missing,cols" -> "file:line"
  for (const file of tsFiles(SRC_DIR)) {
    const src = readFileSync(file, "utf8");
    let m; insertRe.lastIndex = 0;
    while ((m = insertRe.exec(src)) !== null) {
      const required = req.get(m[1]);
      if (!required) continue; // unknown table (view/CTE/temp) — out of scope
      const provided = new Set();
      for (const tok of splitTop(m[2])) {
        const cm = tok.trim().match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?$/);
        if (cm) provided.add(cm[1]);
      }
      const missing = [...required].filter((c) => !provided.has(c)).sort();
      if (missing.length) {
        const line = src.slice(0, m.index).split("\n").length;
        const key = `${m[1]}: ${missing.join(", ")}`;
        const loc = `${file.split("/src/")[1]}:${line}`;
        if (!found.has(key)) found.set(key, [loc]);
        else found.get(key).push(loc);
      }
    }
  }
  if (found.size === 0) {
    console.log(`[check:required-columns] OK — every INSERT supplies all NOT-NULL-without-default columns (${req.size} tables scanned).`);
    process.exit(0);
  }
  console.log(`[check:required-columns] ${found.size} INSERT(s) omit a required column (verify the DB is at migration head):`);
  for (const k of [...found.keys()].sort()) {
    console.log(`   • ${k}`);
    for (const loc of found.get(k)) console.log(`        ${loc}`);
  }
  process.exit(STRICT ? 1 : 0);
}
main();
