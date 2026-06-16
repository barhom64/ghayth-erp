#!/usr/bin/env node
//
// scripts/src/check-tenant-isolation.mjs
//
// Tenant-isolation guard (FND-013). Catches the cross-tenant leak class the
// SCOPE_HELPER_ADOPTION_AUDIT and GHAITH_SYSTEM_GAP_MATRIX flag as P0:
// `buildScopedWhere` is not enforced, so a hand-written query that reads/writes
// a tenant-scoped table (one with a "companyId" column) but forgets the
// "companyId" predicate silently serves — or mutates — one tenant's rows from
// another tenant's session.
//
// Approach (mirrors check-ghost-rows, conservative / zero-false-positive bias):
//   1. Tenant-scoped tables = CREATE TABLE blocks in db/schema_pre.sql whose
//      body declares a "companyId" column. Read statically — no DB needed.
//   2. Walk routes/*.ts; for each rawQuery body, split into statements.
//   3. For SELECT / UPDATE / DELETE statements that reference a tenant-scoped
//      table (FROM / JOIN / DELETE FROM / UPDATE <tbl>):
//        - skip if the statement contains `${…}` (a helper such as
//          buildScopedWhere may inject the scope — keeps false positives at 0);
//        - otherwise require a `"companyId"` token somewhere in the statement;
//        - if absent → flag.
//   4. Allowlist at scripts/tenant-isolation-allowlist.txt (file or file:table)
//      for legitimate exceptions (global lookups, cross-tenant admin reports,
//      filter-by-globally-unique-id). Fails CI only on a NEW offender.
//
import { readdir, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { extractRawQueryBodies } from "./lib/raw-query-bodies.mjs";
import {
  stripCommentsAndStrings,
  splitStatements,
  findFromJoinReferences,
} from "./check-ghost-rows.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");
const SCHEMA_FILE = join(REPO_ROOT, "db/schema_pre.sql");
const ALLOWLIST_FILE = join(REPO_ROOT, "scripts/tenant-isolation-allowlist.txt");

// Tenant-scoped tables — CREATE TABLE blocks whose body has a "companyId" column.
function loadTenantTables() {
  const sql = readFileSync(SCHEMA_FILE, "utf8");
  const tables = new Set();
  const re = /CREATE TABLE\s+(?:public\.)?"?([a-zA-Z_][\w]*)"?\s*\(([\s\S]*?)\n\);/g;
  let m;
  while ((m = re.exec(sql)) !== null) {
    if (/"companyId"/.test(m[2])) tables.add(m[1]);
  }
  return tables;
}

async function loadAllowlist() {
  if (!existsSync(ALLOWLIST_FILE)) return { files: new Set(), pairs: new Set() };
  const txt = await readFile(ALLOWLIST_FILE, "utf8");
  const files = new Set();
  const pairs = new Set();
  for (const raw of txt.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    (line.includes(":") ? pairs : files).add(line);
  }
  return { files, pairs };
}

async function walk(dir, acc = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, acc);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) acc.push(full);
  }
  return acc;
}

// UPDATE <tbl> targets (findFromJoinReferences already covers FROM/JOIN and
// DELETE FROM). Returns bare table names.
function findUpdateTargets(stmt) {
  const out = [];
  const re = /\bUPDATE\s+(?:ONLY\s+)?(?:public\.)?"?([a-zA-Z_][\w]*)"?/gi;
  let m;
  while ((m = re.exec(stmt)) !== null) out.push(m[1]);
  return out;
}

async function main() {
  const tenant = loadTenantTables();
  if (tenant.size === 0) {
    console.error("[check:tenant-isolation] ERROR — no \"companyId\" tables parsed from db/schema_pre.sql.");
    process.exit(2);
  }
  const allow = await loadAllowlist();
  const files = await walk(ROUTES_DIR);

  const findings = [];
  let stmtCount = 0;
  let skippedInterp = 0;

  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    const relFromSrc = relative(join(REPO_ROOT, "artifacts/api-server/src"), file);
    if (allow.files.has(relFromSrc)) continue;
    const source = await readFile(file, "utf8");
    if (!source.includes("rawQuery") && !source.includes("rawExecute")) continue;

    for (const body of extractRawQueryBodies(source)) {
      const cleaned = stripCommentsAndStrings(body);
      for (const stmt of splitStatements(cleaned)) {
        if (!/\b(SELECT|UPDATE|DELETE)\b/i.test(stmt)) continue;
        stmtCount++;
        if (stmt.includes("${")) { skippedInterp++; continue; }

        const refs = new Set([
          ...findFromJoinReferences(stmt).map((r) => r.table),
          ...findUpdateTargets(stmt),
        ].filter((t) => tenant.has(t)));
        if (refs.size === 0) continue;

        // Scoped if the statement names "companyId" anywhere (over-allow:
        // matching ghost-rows' zero-false-positive bias).
        if (/"companyId"/.test(stmt)) continue;

        for (const table of refs) {
          if (allow.pairs.has(`${relFromSrc}:${table}`)) continue;
          findings.push({ file: rel, table, snippet: stmt.replace(/\s+/g, " ").trim().slice(0, 160) });
        }
      }
    }
  }

  // Collapse duplicates per (file, table).
  const seen = new Set();
  const unique = findings.filter((f) => {
    const k = `${f.file}::${f.table}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });

  console.log(
    `[check:tenant-isolation] ${files.length} route file(s) · ${tenant.size} tenant-scoped table(s) · ` +
      `${stmtCount} statement(s) inspected · ${skippedInterp} skipped (\${…}) · ` +
      `${allow.files.size} file / ${allow.pairs.size} table allowlisted.`,
  );

  if (unique.length === 0) {
    console.log("[check:tenant-isolation] OK — every static read/write of a tenant-scoped table carries a \"companyId\" predicate.");
    process.exit(0);
  }

  console.error(
    `[check:tenant-isolation] FAIL — ${unique.length} static statement(s) touch a tenant-scoped table ` +
      "without a \"companyId\" predicate (cross-tenant leak risk, FND-013):\n",
  );
  for (const f of unique) console.error(`  ${f.file}  →  ${f.table}\n    ${f.snippet}`);
  console.error(
    "\nFix: add `\"companyId\" = $n` to the WHERE (or route the query through buildScopedWhere).\n" +
      "If intentional (global lookup, cross-tenant admin report, filter-by-globally-unique-id),\n" +
      "add an exception to scripts/tenant-isolation-allowlist.txt — `routes/<file>.ts` or\n" +
      "`routes/<file>.ts:<table>`. Comments start with `#`.\n",
  );
  process.exit(1);
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/^.*\//, "") ?? "\0");
if (isDirectRun) {
  main().catch((err) => {
    console.error("[check:tenant-isolation] crashed:", err);
    process.exit(2);
  });
}
