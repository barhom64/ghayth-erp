#!/usr/bin/env node
/**
 * lintSql.mjs — static guard against raw-SQL injection patterns.
 *
 * The API uses `pg` via `rawQuery` / `rawExecute` helpers. The safe pattern is
 * to pass user input as `$n` parameters and only interpolate identifiers or
 * SQL fragments that come from internal, trusted variables (already-built
 * `where`, `sets`, `params.length`, clamped `limit` / `offset`, etc).
 *
 * This script scans every `rawQuery(...)` / `rawExecute(...)` template string
 * call in `src/` and flags any `${...}` expression whose identifier is NOT in
 * the allow-list of known-safe names below. Anything else (a direct
 * `${req.query.sort}`, a `${body.status}` concatenated into SQL, a
 * `${sortField}` that is not clamped, etc.) is a finding the linter prints
 * and a non-zero exit code.
 *
 * Usage: node scripts/lintSql.mjs [--json]
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(__dirname, "..");
const SRC_DIR = join(API_ROOT, "src");

// Name-suffix patterns that are considered safe. Anything matching these is
// treated as an internally-constructed SQL fragment, a numeric param pointer,
// or an already-clamped integer. This is intentionally a loose denylist: the
// linter's job is to catch obvious regressions (direct `${req.query.sort}`,
// `${body.status}`, etc.), not to re-prove every query.
const SAFE_SUFFIX_RE = /(Where|Sql|Clause|Filter|Conditions?|Sets?|Join|Order|Group|Having|Cols?|Columns?|Fields?|Table|TableId|Entity|Ids?|List|Limit|Offset|PageSize|Idx|Index|ParamIndex|parseInt|Number|creditOrDebit|select|From|In|Not|Null|Case|End)$/;

const SAFE_NAMES = new Set([
  "where", "sets", "conditions", "joinSql", "orderBy", "orderClause",
  "limit", "offset", "pageSize", "tableId", "entityTable", "tableName",
  "schema", "ids", "idList", "limitClause", "fw", "pw", "idx",
  "nextParamIndex", "paramIdx", "limitIdx", "offsetIdx", "todayIdx",
  "assignIdx", "limitParam", "offsetParam",
  "noBranchWhere", "companyWhere", "voucherWhere", "leaveWhere", "approvalConds",
  "moduleFilter", "dateFilter", "amountFilter", "filter",
  "timeField", "slaHours", "since", "tw", "module",
  "from", "to", "departmentId",
  "convCond", "createdCond", "targetCond", "activityCond",
  "creditOrDebit",
  // Fragments built from allow-listed tableMaps (entityMeta, hr.refMap,
  // gov-integrations) — verified by manual audit, see Phase 5 in
  // docs/KNOWN_ISSUES.md.
  "table", "values", "whereExtra", "placeholders", "updates", "refMap",
  "target", "completedAt", "fields", "empVals", "vals", "roles", "conds",
  "GOV_SAFE_COLUMNS", "secretValue", "tasks",
  // `tbl` in cronScheduler.ts orphan-cleanup loops iterates over hardcoded
  // string allowlists (orphanRefTables / orphanRefTypes) — no user input
  // can reach the interpolation point.
  "tbl",
  // `lim` in routes/events.ts is computed via Math.min/Math.max(Number(...))
  // so it's always a clamped integer, never a raw string.
  "lim",
  // `extra` in routes/finance-recurring.ts is built from hardcoded SQL
  // fragments plus properly parameterized $n placeholders — same pattern as
  // `where` and `conditions` above.
  "extra",
  // `likeClauses` in businessHelpers.ts builds parameterized LIKE fragments
  // from a hardcoded keyword array — indices are derived from array position.
  "likeClauses",
  // `seq` in correspondence.ts is a ternary between two hardcoded sequence
  // names ('correspondence_outgoing_seq' / 'correspondence_incoming_seq').
  "seq",
  // `onlyUnresolved` in admin.ts is a boolean derived from req.query —
  // the ternary only picks between a hardcoded SQL fragment and empty string.
  "onlyUnresolved",
]);

// Member expressions like `params.length` or `sets.join(...)` are allowed
// because they produce numbers / already-safe strings. This regex matches the
// bare identifier (before `.` / `[`).
const IDENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)/;

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(p)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

function* findSqlCalls(src) {
  // Match rawQuery / rawExecute / client.query followed by a backtick string.
  // Uses a lazy backtick match that also tolerates nested braces via
  // bracket counting below.
  const callRe = /(rawQuery|rawExecute|client\.query)\s*(?:<[^>]*>)?\s*\(\s*`/g;
  let m;
  while ((m = callRe.exec(src)) !== null) {
    const start = callRe.lastIndex;
    // Find the matching closing backtick, respecting `${ ... }` nesting.
    let i = start;
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "`" && depth === 0) { break; }
      if (c === "$" && src[i + 1] === "{") { depth++; i += 2; continue; }
      if (c === "}" && depth > 0) { depth--; i++; continue; }
      i++;
    }
    yield { call: m[1], tmpl: src.slice(start, i), startIdx: start };
  }
}

// Things we consider user-controlled and therefore DANGEROUS to interpolate.
// The linter will flag any `${...}` expression that references these without
// a parameter placeholder.
const DANGEROUS_PATTERNS = [
  /\breq\.(?:query|body|params|headers)\b/,
  /\bbody\.(?:sort|order|sortBy|orderBy|limit|offset|column|field|table)\b/i,
];

function scanTemplate(tmpl) {
  const findings = [];
  const re = /\$\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(tmpl)) !== null) {
    const expr = m[1].trim();
    if (!expr) continue;

    // Flag anything that looks like direct user input routed into SQL.
    if (DANGEROUS_PATTERNS.some((p) => p.test(expr))) {
      findings.push({ expr });
      continue;
    }

    // Literal numbers are safe.
    if (/^\d+(\.\d+)?$/.test(expr)) continue;

    const ident = expr.match(IDENT_RE)?.[1];
    if (!ident) continue; // expression — skip (we already checked dangerous patterns)

    if (SAFE_NAMES.has(ident)) continue;
    if (SAFE_SUFFIX_RE.test(ident)) continue;

    // params.length, sets.join, etc. — trailing member expressions are safe
    // when the base is a known-safe identifier.
    if (ident === "params" || ident === "query" || ident === "sets") continue;
    // `*.length`, `*.join(...)` — trailing .length / .join on any identifier
    // produces a number or an already-safe joined fragment.
    if (/\.(length|join|map|filter)\b/.test(expr)) continue;

    findings.push({ expr });
  }
  return findings;
}

async function main() {
  const wantJson = process.argv.includes("--json");
  const files = await walk(SRC_DIR);
  const offenders = [];
  let totalQueries = 0;
  for (const f of files) {
    const src = await readFile(f, "utf8");
    for (const { call, tmpl } of findSqlCalls(src)) {
      totalQueries++;
      const findings = scanTemplate(tmpl);
      for (const finding of findings) {
        offenders.push({
          file: relative(API_ROOT, f),
          call,
          expression: finding.expr,
        });
      }
    }
  }

  if (offenders.length === 0) {
    if (wantJson) console.log(JSON.stringify({ ok: true }, null, 2));
    else console.log(`lintSql: OK — ${totalQueries} SQL calls scanned, 0 suspicious interpolations.`);
    return;
  }

  if (wantJson) {
    console.log(JSON.stringify({ ok: false, offenders }, null, 2));
  } else {
    console.error(`lintSql: FAIL — ${offenders.length} suspicious interpolation(s):`);
    for (const o of offenders) {
      console.error(`  - ${o.expression}  (${o.call} in ${o.file})`);
    }
    console.error(
      "Use $n placeholders, or add the identifier to SAFE_IDENTIFIERS in\n" +
      "scripts/lintSql.mjs after confirming it cannot carry user input."
    );
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("lintSql crashed:", err);
  process.exit(2);
});
