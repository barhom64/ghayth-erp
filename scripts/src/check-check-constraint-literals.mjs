// scripts/src/check-check-constraint-literals.mjs
//
// Diagnostic: route-written literals vs value-set CHECK constraints (live schema).
//
// WHY THIS EXISTS (the gap it closes)
//   A column guarded by `CHECK (col = ANY (ARRAY['a','b',...]))` rejects any
//   other literal at runtime. When a route writes a status/type/etc. value the
//   constraint never listed, the write 500s and the whole transaction rolls
//   back — invisible to unit tests that don't exercise that exact path.
//
//   This is the class behind:
//     • migration 281 (purchase_orders/hr_leave_requests status narrower than
//       their lifecycle),
//     • migration 282 (invoices 'amended'),
//     • migration 283 (journal_entries 'reversed' — reversing ANY journal entry
//       or payment voucher 500'd because the CHECK omitted 'reversed').
//
//   audit-schema-drift validates column NAMES, not the VALUES written into a
//   constrained column. check-insert-columns validates column EXISTENCE. This
//   closes the remaining gap: the LITERAL VALUE vs the column's allowed set.
//
// HOW
//   Loads every single-column value-set CHECK constraint from the live schema
//   (pg_constraint via psql), then scans api-server source for table-anchored
//   writes — `UPDATE <table> SET <col> = '<lit>'` and
//   `INSERT INTO <table> (<cols>) VALUES (<vals>)` — and flags any literal that
//   is NOT in that (table, column)'s allowed set. Table-anchoring is what makes
//   it accurate: a bare `status = 'x'` is only ever checked against the
//   constraint of the table actually being written, so sibling columns
//   (billingStatus / lastSyncStatus / qualityControlStatus) never cross-trip.
//   Parameterised values (`$1`), expressions, and CASE are skipped — only bare
//   string literals are checkable.
//
// IMPORTANT — accuracy depends on a FULLY-MIGRATED database (migration HEAD): a
//   DB behind HEAD reports literals a newer migration adds to the allowed set as
//   false positives. This is why it is NOT wired into guard.sh (CI provisions
//   Postgres from the db/schema.sql dump = baseline, not HEAD). Run it manually
//   against a head-of-main DB.
//
// EXIT: advisory by default (0). `--strict` exits 1 if any violation is found.
//
// USAGE: DATABASE_URL=… node scripts/src/check-check-constraint-literals.mjs [--strict]

import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC_DIR = join(REPO_ROOT, "artifacts/api-server/src");
const STRICT = process.argv.includes("--strict");

function loadConstraints() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[check:check-constraint-literals] ERROR — DATABASE_URL is not set. This check needs a live Postgres connection.");
    process.exit(2);
  }
  // Two columns; psql -At separates them with '|'. The constraint def for a
  // value-set CHECK never contains a literal '|', so splitting on the FIRST
  // '|' cleanly recovers (table, def).
  const sql =
    "SELECT c.conrelid::regclass::text, pg_get_constraintdef(c.oid) " +
    "FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace " +
    "WHERE c.contype='c' AND n.nspname='public' " +
    "AND pg_get_constraintdef(c.oid) LIKE '%= ANY (ARRAY[%';";
  const res = spawnSync("psql", [url, "-Atqc", sql], { encoding: "utf8" });
  if (res.status !== 0) {
    console.error("[check:check-constraint-literals] ERROR — psql failed:\n" + (res.stderr || res.stdout));
    process.exit(2);
  }
  // (table, column) -> Set(allowed literals)
  const allowed = new Map();
  const colRe = /\(\("?([a-zA-Z_]+)"?\)::text = ANY \(ARRAY\[(.*?)\]\)\)/gs;
  const litRe = /'([^']*)'::/g;
  for (const line of res.stdout.split("\n")) {
    const bar = line.indexOf("|");
    if (bar < 0) continue;
    const tbl = line.slice(0, bar).replace(/^public\./, "").replace(/"/g, "");
    const def = line.slice(bar + 1);
    let cm;
    while ((cm = colRe.exec(def)) !== null) {
      const col = cm[1];
      const key = `${tbl}\t${col}`;
      const set = allowed.get(key) ?? new Set();
      let lm;
      const inner = cm[2];
      litRe.lastIndex = 0;
      while ((lm = litRe.exec(inner)) !== null) set.add(lm[1]);
      allowed.set(key, set);
    }
  }
  return allowed;
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
  const allowed = loadConstraints();
  const updRe = /UPDATE\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+SET\s/gi;
  const setAssign = /"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*=\s*'([^']*)'/g;
  const insRe = /INSERT\s+INTO\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(([^;]*?)\)\s*VALUES\s*\(([^;]*?)\)/gis;
  const termRe = /\bWHERE\b|\bRETURNING\b|`|;/i;

  const found = new Map(); // "tbl.col = 'lit'" -> file
  let examined = 0;

  for (const file of tsFiles(SRC_DIR)) {
    const src = readFileSync(file, "utf8");
    const rel = file.split("/src/")[1];

    // UPDATE <tbl> SET <col> = '<lit>'
    updRe.lastIndex = 0;
    let um;
    while ((um = updRe.exec(src)) !== null) {
      const tbl = um[1];
      const slice = src.slice(um.index + um[0].length, um.index + um[0].length + 1200);
      const tm = slice.match(termRe);
      const body = tm ? slice.slice(0, tm.index) : slice;
      setAssign.lastIndex = 0;
      let am;
      while ((am = setAssign.exec(body)) !== null) {
        const key = `${tbl}\t${am[1]}`;
        if (!allowed.has(key)) continue;
        examined++;
        if (!allowed.get(key).has(am[2])) {
          const k = `${tbl}.${am[1]} = '${am[2]}'`;
          if (!found.has(k)) found.set(k, `${rel} (UPDATE)`);
        }
      }
    }

    // INSERT INTO <tbl> (cols) VALUES (vals)
    insRe.lastIndex = 0;
    let im;
    while ((im = insRe.exec(src)) !== null) {
      const tbl = im[1];
      const cols = splitTop(im[2]).map((c) => c.trim().replace(/"/g, ""));
      const vals = splitTop(im[3]);
      if (cols.length !== vals.length) continue;
      for (let i = 0; i < cols.length; i++) {
        const key = `${tbl}\t${cols[i]}`;
        if (!allowed.has(key)) continue;
        const lm = vals[i].trim().match(/^'([^']*)'$/);
        if (!lm) continue;
        examined++;
        if (!allowed.get(key).has(lm[1])) {
          const k = `${tbl}.${cols[i]} = '${lm[1]}'`;
          if (!found.has(k)) found.set(k, `${rel} (INSERT)`);
        }
      }
    }
  }

  if (found.size === 0) {
    console.log(`[check:check-constraint-literals] OK — ${examined} constrained-column literal write(s) examined across ${allowed.size} (table,column) pairs; every literal is in its CHECK set.`);
    process.exit(0);
  }
  console.log(`[check:check-constraint-literals] ${found.size} literal write(s) not in the column's CHECK set (verify the DB is at migration head):`);
  for (const k of [...found.keys()].sort()) console.log(`   • ${k}   (${found.get(k)})`);
  process.exit(STRICT ? 1 : 0);
}
main();
