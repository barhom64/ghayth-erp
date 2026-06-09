// scripts/src/check-insert-columns.mjs
//
// Diagnostic: per-table INSERT-column existence (live schema).
//
// WHY THIS EXISTS (the gap it closes)
//   audit-schema-drift validates identifiers against a GLOBAL column set — a
//   name that is a column on ANY table passes. That lets a whole bug class
//   through: `INSERT INTO invoice_lines (... total ...)` passed because `total`
//   is a column on `invoices`, though invoice_lines has only `lineTotal`. The
//   same shape broke the invoice-amend path (invoices.date, invoice_lines.total,
//   invoice_lines.branchId) and the purchase chain (purchase_orders.updatedAt) —
//   each a column that exists somewhere but NOT on the target table, so the
//   write 500s at runtime, undetected by unit tests.
//
//   This complements audit-schema-drift with a PER-TABLE check.
//
// HOW
//   Reads the per-table column map from the live schema (information_schema via
//   psql — accurate; static SQL parsing is defeated by NUMERIC(5,2) commas,
//   `--` comments, and multi-column ALTERs), scans api-server source for
//   `INSERT INTO <table> ( <cols> )`, and reports columns missing from that
//   table.
//
// IMPORTANT — accuracy depends on a FULLY-MIGRATED database (migration HEAD). A
//   DB behind HEAD reports columns that a newer migration adds as FALSE
//   positives — which is why this is NOT wired into guard.sh: that CI
//   provisions Postgres from the db/schema.sql dump (pre-server-boot), so it
//   sits at the dump baseline, not HEAD. Run it manually against a head-of-main
//   DB (e.g. after `db/bootstrap.sh` + a server boot that applies all
//   migrations) to triage. It found + fixed 14 real per-table column bugs.
//
// EXIT: advisory by default (0). `--strict` exits 1 if any violation is found.
//
// USAGE: DATABASE_URL=… node scripts/src/check-insert-columns.mjs [--strict]

import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC_DIR = join(REPO_ROOT, "artifacts/api-server/src");
const STRICT = process.argv.includes("--strict");

function loadSchema() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[check:insert-columns] ERROR — DATABASE_URL is not set. This check needs a live Postgres connection.");
    process.exit(2);
  }
  const sql = "SELECT table_name || '|' || column_name FROM information_schema.columns WHERE table_schema='public';";
  const res = spawnSync("psql", [url, "-Atqc", sql], { encoding: "utf8" });
  if (res.status !== 0) {
    console.error("[check:insert-columns] ERROR — psql failed:\n" + (res.stderr || res.stdout));
    process.exit(2);
  }
  const map = new Map();
  for (const line of res.stdout.split("\n")) {
    const [t, c] = line.split("|");
    if (!t || !c) continue;
    const set = map.get(t) ?? new Set();
    set.add(c); map.set(t, set);
  }
  return map;
}

function* tsFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* tsFiles(p);
    else if (e.name.endsWith(".ts")) yield p;
  }
}

const SQL_KW = new Set(["select", "from", "values", "default", "now", "true", "false", "null", "public", "on", "conflict"]);

function main() {
  const schema = loadSchema();
  const insertRe = /INSERT\s+INTO\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(([^;]*?)\)\s*(?:VALUES|SELECT|ON\s+CONFLICT)/gi;
  const found = new Map(); // table.col -> file
  for (const file of tsFiles(SRC_DIR)) {
    const src = readFileSync(file, "utf8");
    let m; insertRe.lastIndex = 0;
    while ((m = insertRe.exec(src)) !== null) {
      const cols = schema.get(m[1]);
      if (!cols) continue; // unknown table (view/CTE/temp) — out of scope
      for (const tok of m[2].split(",")) {
        const cm = tok.trim().match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?$/);
        if (!cm) continue; // expression, not a bare column
        const col = cm[1];
        if (SQL_KW.has(col.toLowerCase())) continue;
        if (!cols.has(col)) {
          const key = `${m[1]}.${col}`;
          if (!found.has(key)) found.set(key, file.split("/src/")[1]);
        }
      }
    }
  }
  if (found.size === 0) {
    console.log(`[check:insert-columns] OK — every INSERT column exists on its target table (${schema.size} tables scanned).`);
    process.exit(0);
  }
  console.log(`[check:insert-columns] ${found.size} INSERT column(s) not found on their target table (verify the DB is at migration head):`);
  for (const k of [...found.keys()].sort()) console.log(`   • ${k}   (${found.get(k)})`);
  process.exit(STRICT ? 1 : 0);
}
main();
