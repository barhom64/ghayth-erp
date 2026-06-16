#!/usr/bin/env node
//
// scripts/src/check-tx-coverage.mjs — multi-table-write transaction coverage.
//
// Data-integrity guard (the class the GHAYTH defect inventory flagged as the
// only one without a guard): a route handler that writes to TWO OR MORE
// distinct tables in sequence WITHOUT a transaction. If the second write
// fails, the first stays committed — a silent partial/corrupt write
// (an invoice with no log row, a template header with no lines, a dispatch
// order whose booking line never flipped, …).
//
// Approach (static, schema-validated, zero-DB — like the other ratchets):
//   1. Real table names = CREATE TABLE blocks in db/schema_pre.sql. Only
//      writes to a REAL table count, so regex noise (`UPDATE ... SET`, the
//      word "expense", etc.) never produces a false table.
//   2. Walk artifacts/api-server/src/routes/*.ts. Split each file into
//      handler spans on `<x>Router.<method>(` for method ∈ {post,patch,put,
//      delete} (GET handlers don't mutate and also bound the previous span).
//   3. For each write-handler span, collect the distinct real tables hit by
//      `INSERT INTO <t>` / `UPDATE <t> SET` / `DELETE FROM <t>`.
//   4. A span is "transaction-covered" if it contains withTransaction( or
//      applyTransition( (the project's two atomic-write entry points) or a
//      client.query( (a passed-in transaction client). Coarse on purpose —
//      the goal is to catch the "no transaction at all" case.
//   5. A span hitting >= 2 distinct real tables and NOT covered is an
//      offender. Allowlist baseline at scripts/tx-coverage-allowlist.txt
//      (one `routes/<file>.ts:<METHOD> <path>` per line). The guard fails
//      only on a NEW offender, so the debt can shrink but never grow.
//
// Regenerate the baseline:
//   node scripts/src/check-tx-coverage.mjs --write-allowlist
//
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const ROUTES_DIR = join(REPO, "artifacts/api-server/src/routes");
const SCHEMA_FILE = join(REPO, "db/schema_pre.sql");
const ALLOWLIST = join(REPO, "scripts/tx-coverage-allowlist.txt");

function realTables() {
  const sql = readFileSync(SCHEMA_FILE, "utf8");
  const set = new Set();
  const re = /CREATE TABLE\s+(?:public\.)?"?([a-zA-Z_][\w]*)"?\s*\(/g;
  let m;
  while ((m = re.exec(sql)) !== null) set.add(m[1]);
  return set;
}

function stripCommentsAndStrings(src) {
  // Drop // and /* */ comments so a table name inside a comment never counts.
  return src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const HANDLER_RE = /\b[A-Za-z_$][\w$]*\.(get|post|patch|put|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
const WRITE_METHODS = new Set(["post", "patch", "put", "delete"]);

function spans(src) {
  const hdrs = [];
  let m;
  HANDLER_RE.lastIndex = 0;
  while ((m = HANDLER_RE.exec(src)) !== null) {
    hdrs.push({ index: m.index, method: m[1], path: m[2] });
  }
  return hdrs.map((h, i) => ({
    method: h.method,
    path: h.path,
    body: src.slice(h.index, i + 1 < hdrs.length ? hdrs[i + 1].index : src.length),
  }));
}

function tablesWritten(body, tables) {
  const found = new Set();
  const re = /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?([a-zA-Z_][\w]*)"?/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (tables.has(m[1])) found.add(m[1]);
  }
  return found;
}

function isCovered(body) {
  return /\bwithTransaction\s*\(/.test(body)
    || /\bapplyTransition\s*\(/.test(body)
    || /\bclient\.query\s*\(/.test(body);
}

function scan() {
  const tables = realTables();
  const offenders = [];
  for (const f of readdirSync(ROUTES_DIR).filter((n) => n.endsWith(".ts"))) {
    const src = stripCommentsAndStrings(readFileSync(join(ROUTES_DIR, f), "utf8"));
    for (const sp of spans(src)) {
      if (!WRITE_METHODS.has(sp.method)) continue;
      if (isCovered(sp.body)) continue;
      const hit = tablesWritten(sp.body, tables);
      if (hit.size >= 2) {
        offenders.push(`routes/${f}:${sp.method.toUpperCase()} ${sp.path}`);
      }
    }
  }
  return offenders.sort();
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST)) return new Set();
  return new Set(
    readFileSync(ALLOWLIST, "utf8").split("\n")
      .map((l) => l.trim()).filter((l) => l && !l.startsWith("#")),
  );
}

function main() {
  const offenders = scan();
  if (process.argv.includes("--write-allowlist")) {
    const header = [
      "# tx-coverage-allowlist.txt — multi-table writes without a transaction.",
      "# Baseline of handlers that write 2+ tables outside withTransaction/",
      "# applyTransition. As each is wrapped, delete its line — the guard fails",
      "# on any NEW offender. Regenerate: node scripts/src/check-tx-coverage.mjs --write-allowlist",
      `# Baseline: ${offenders.length} handler(s).`,
      "",
    ].join("\n");
    writeFileSync(ALLOWLIST, header + offenders.join("\n") + "\n", "utf8");
    console.log(`[check:tx-coverage] wrote ${offenders.length} baseline entries.`);
    return;
  }
  const allow = loadAllowlist();
  const fresh = offenders.filter((o) => !allow.has(o));
  const stale = [...allow].filter((a) => !offenders.includes(a)).sort();
  if (stale.length) {
    console.log(`[check:tx-coverage] NOTE: ${stale.length} stale allowlist entr${stale.length === 1 ? "y" : "ies"} (now wrapped — prune):`);
    for (const s of stale) console.log(`    - ${s}`);
  }
  if (fresh.length) {
    console.error(`\n[check:tx-coverage] FAIL: ${fresh.length} NEW handler(s) write 2+ tables without a transaction:`);
    for (const o of fresh) console.error(`    ✗ ${o}`);
    console.error(
      "\n  A failure on the second+ write would leave the first committed (partial/corrupt data).\n" +
      "  Wrap the writes in withTransaction(async () => { ... }) (lib/rawdb.ts) — the existing\n" +
      "  rawQuery/rawExecute calls auto-join the ambient transaction. If it genuinely needs no\n" +
      "  transaction, add its line to scripts/tx-coverage-allowlist.txt with a reason.",
    );
    process.exit(1);
  }
  const covered = allow.size - stale.length;
  console.log(`[check:tx-coverage] OK — ${offenders.length} baseline multi-table handler(s) allowlisted, 0 new (${covered} still pending wrap).`);
}

main();
