// scripts/src/check-on-conflict-targets.mjs
//
// Diagnostic: INSERT … ON CONFLICT (cols) with no matching unique constraint.
//
// WHY THIS EXISTS (the gap it closes)
//   `INSERT … ON CONFLICT (<cols>) DO …` needs a unique or exclusion constraint
//   whose columns match <cols> exactly, or Postgres rejects it at runtime with
//   `there is no unique or exclusion constraint matching the ON CONFLICT
//   specification`. Nothing static catches this: the column names all exist, so
//   audit-schema-drift / check-insert-columns pass — the write only blows up
//   when it runs.
//
//   Found + fixed fleet_alerts (#1594, migration 285): the fleet-alert recompute
//   upserts ON CONFLICT ("companyId", type, "relatedType", "relatedId") but the
//   table had no unique index on that tuple, so every recompute 500'd and the
//   alerts table stayed permanently empty.
//
// HOW
//   Loads every PLAIN unique index (no partial predicate, no expression columns)
//   from the live schema as table -> set of column-sets. Scans api-server source
//   for `INSERT INTO <t> … ON CONFLICT (<cols>)`, BOUNDED to a single SQL
//   template literal so a conflict clause can never be paired with an INSERT from
//   a different statement. Flags a target when <cols> is a plain column list that
//   is not a unique-index column-set of <t>.
//
//   Conservative to stay false-positive-free: tables that ALSO carry a partial
//   or expression unique index are reported as SKIPPED (an expression arbiter
//   like `ON CONFLICT (COALESCE("branchId",0), "schemeId")` can't be matched by
//   column name), and ON CONFLICT clauses containing an expression are skipped.
//
// IMPORTANT — accuracy depends on a FULLY-MIGRATED database (migration HEAD), so
//   this is NOT wired into guard.sh (CI provisions Postgres from the
//   db/schema.sql dump = baseline). Manual diagnostic, like its siblings.
//
// EXIT: advisory by default (0). `--strict` exits 1 if any violation is found.
//
// USAGE: DATABASE_URL=… node scripts/src/check-on-conflict-targets.mjs [--strict]

import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC_DIR = join(REPO_ROOT, "artifacts/api-server/src");
const STRICT = process.argv.includes("--strict");

function psql(sql) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[check:on-conflict-targets] ERROR — DATABASE_URL is not set. This check needs a live Postgres connection.");
    process.exit(2);
  }
  const res = spawnSync("psql", [url, "-Atqc", sql], { encoding: "utf8" });
  if (res.status !== 0) {
    console.error("[check:on-conflict-targets] ERROR — psql failed:\n" + (res.stderr || res.stdout));
    process.exit(2);
  }
  return res.stdout;
}

function loadUnique() {
  // Plain unique indexes (no partial predicate, no expression columns).
  const rows = psql(
    "SELECT t.relname, array_agg(a.attname ORDER BY a.attname) " +
    "FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid " +
    "JOIN pg_namespace n ON n.oid=t.relnamespace " +
    "JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ANY(i.indkey) " +
    "WHERE i.indisunique AND n.nspname='public' AND i.indpred IS NULL AND i.indexprs IS NULL " +
    "GROUP BY i.indexrelid, t.relname;"
  );
  const uniq = new Map(); // table -> Set("a,b,c" sorted)
  for (const line of rows.split("\n")) {
    if (!line.includes("|")) continue;
    const [t, cols] = [line.slice(0, line.indexOf("|")), line.slice(line.indexOf("|") + 1)];
    const set = cols.replace(/[{}]/g, "").split(",").map((c) => c.trim()).sort().join(",");
    const s = uniq.get(t) ?? new Set();
    s.add(set); uniq.set(t, s);
  }
  // Tables with a partial/expression unique index — can't verify statically.
  const skip = new Set(
    psql(
      "SELECT DISTINCT t.relname FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid " +
      "JOIN pg_namespace n ON n.oid=t.relnamespace " +
      "WHERE i.indisunique AND n.nspname='public' AND (i.indpred IS NOT NULL OR i.indexprs IS NOT NULL);"
    ).split("\n").map((s) => s.trim()).filter(Boolean)
  );
  return { uniq, skip };
}

function* tsFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* tsFiles(p);
    else if (e.name.endsWith(".ts")) yield p;
  }
}

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
  const { uniq, skip } = loadUnique();
  const tmplRe = /`([^`]*)`/gs;
  const insRe = /INSERT\s+INTO\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\b/i;
  const oncRe = /ON\s+CONFLICT\s*\(([^)]*)\)/i;
  const found = new Map();
  let examined = 0, skipped = 0;
  for (const file of tsFiles(SRC_DIR)) {
    const src = readFileSync(file, "utf8");
    let tm; tmplRe.lastIndex = 0;
    while ((tm = tmplRe.exec(src)) !== null) {
      const body = tm[1];
      const im = body.match(insRe);
      const om = body.match(oncRe);
      if (!im || !om) continue;
      const table = im[1];
      const parts = splitTop(om[1]).map((c) => c.replace(/["\s]/g, "")).filter(Boolean);
      if (parts.length === 0) continue;               // ON CONFLICT DO NOTHING (no target)
      if (parts.some((c) => c.includes("(") || /COALESCE/i.test(c))) continue; // expression arbiter
      if (skip.has(table)) { skipped++; continue; }   // partial/expr unique idx — unverifiable
      const key = parts.slice().sort().join(",");
      examined++;
      if (!uniq.has(table) || !uniq.get(table).has(key)) {
        const line = src.slice(0, tm.index).split("\n").length;
        const k = `${table} (${parts.join(", ")})`;
        if (!found.has(k)) found.set(k, `${file.split("/src/")[1]}:${line}`);
      }
    }
  }
  if (found.size === 0) {
    console.log(`[check:on-conflict-targets] OK — ${examined} ON CONFLICT target(s) match a unique constraint (${skipped} skipped: partial/expression index).`);
    process.exit(0);
  }
  console.log(`[check:on-conflict-targets] ${found.size} ON CONFLICT target(s) with no matching unique constraint (verify the DB is at migration head):`);
  for (const k of [...found.keys()].sort()) console.log(`   • ${k}   (${found.get(k)})`);
  process.exit(STRICT ? 1 : 0);
}
main();
