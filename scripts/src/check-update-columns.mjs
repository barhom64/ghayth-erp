// scripts/src/check-update-columns.mjs
//
// Diagnostic: UPDATE SET-clause columns that don't exist on the target table.
//
// WHY THIS EXISTS (the gap it closes)
//   check-insert-columns catches INSERT column lists that name a column the
//   target table doesn't have. The exact same bug class lives on the UPDATE
//   side: `UPDATE <t> SET <col> = …` where <col> isn't a column of <t> 500s
//   with `column "<col>" of relation "<t>" does not exist`. audit-schema-drift
//   validates identifiers GLOBALLY (a column on ANY table passes), so a write
//   that stamps e.g. clients.updatedAt — a column clients never had — sails
//   through until the path runs.
//
//   Found + fixed 9 such columns (#1594, migration 284): updatedAt on
//   clients/documents/employee_assignments, approvedBy/approvedAt on
//   employee_commission_calculations (commission approval 500'd), deletedAt on
//   gov_integration_links (whole soft-delete endpoint dead), paidAmount on
//   purchase_orders, lastSentAt on scheduled_reports, totalSpend on suppliers.
//
// HOW
//   The SET-clause assignment targets of an UPDATE are unambiguously columns of
//   the updated table (you can't alias them), so this is accurate and
//   table-anchored: it reads the per-table column map from the live schema
//   (information_schema), finds each `UPDATE <table> SET …`, takes the left-hand
//   identifier of every top-level `=` assignment up to WHERE/FROM/RETURNING, and
//   reports any that isn't a column of <table>. Aliased updates
//   (`UPDATE t x SET …`) are skipped (the regex needs SET right after the
//   table), so they never misparse.
//
// IMPORTANT — accuracy depends on a FULLY-MIGRATED database (migration HEAD), so
//   this is NOT wired into guard.sh (CI provisions Postgres from the
//   db/schema.sql dump = baseline). Manual diagnostic, like its siblings.
//
// EXIT: advisory by default (0). `--strict` exits 1 if any violation is found.
//
// USAGE: DATABASE_URL=… node scripts/src/check-update-columns.mjs [--strict]

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
    console.error("[check:update-columns] ERROR — DATABASE_URL is not set. This check needs a live Postgres connection.");
    process.exit(2);
  }
  const sql = "SELECT table_name || '|' || column_name FROM information_schema.columns WHERE table_schema='public';";
  const res = spawnSync("psql", [url, "-Atqc", sql], { encoding: "utf8" });
  if (res.status !== 0) {
    console.error("[check:update-columns] ERROR — psql failed:\n" + (res.stderr || res.stdout));
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

// Split on top-level commas (respecting parens + quotes).
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

const KW = new Set(["where", "from", "returning", "set"]);

function main() {
  const schema = loadSchema();
  const updRe = /UPDATE\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+SET\s/gi;
  const termRe = /\bWHERE\b|\bFROM\b|\bRETURNING\b|`|;/i;
  const found = new Map(); // "table.col" -> [file:line]
  for (const file of tsFiles(SRC_DIR)) {
    const src = readFileSync(file, "utf8");
    let m; updRe.lastIndex = 0;
    while ((m = updRe.exec(src)) !== null) {
      const cols = schema.get(m[1]);
      if (!cols) continue; // unknown table (view/CTE/temp) — out of scope
      const seg = src.slice(m.index + m[0].length, m.index + m[0].length + 1500);
      const tm = seg.match(termRe);
      const body = tm ? seg.slice(0, tm.index) : seg;
      for (const assign of splitTop(body)) {
        const eq = assign.indexOf("=");
        if (eq < 0) continue;
        const lhs = assign.slice(0, eq).trim();
        const cm = lhs.match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?$/);
        if (!cm) continue; // tuple-assignment / expression — skip
        const col = cm[1];
        if (KW.has(col.toLowerCase())) continue;
        if (!cols.has(col)) {
          const line = src.slice(0, m.index).split("\n").length;
          const key = `${m[1]}.${col}`;
          const loc = `${file.split("/src/")[1]}:${line}`;
          if (!found.has(key)) found.set(key, [loc]);
          else found.get(key).push(loc);
        }
      }
    }
  }
  if (found.size === 0) {
    console.log(`[check:update-columns] OK — every UPDATE SET column exists on its target table (${schema.size} tables scanned).`);
    process.exit(0);
  }
  console.log(`[check:update-columns] ${found.size} UPDATE SET column(s) not found on their target table (verify the DB is at migration head):`);
  for (const k of [...found.keys()].sort()) {
    console.log(`   • ${k}   ${found.get(k)[0]}${found.get(k).length > 1 ? `  (+${found.get(k).length - 1} more)` : ""}`);
  }
  process.exit(STRICT ? 1 : 0);
}
main();
