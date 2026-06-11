#!/usr/bin/env node
//
// scripts/src/check-scoped-where-ambiguity.mjs
//
// Ambiguous-column guard for the runtime-injected WHERE fragments that
// `buildScopedWhere()` (artifacts/api-server/src/lib/scopedQuery.ts)
// splices into raw SQL — the blind spot the *static* ambiguity scanner
// (check-sql-ambiguity.mjs) deliberately treats as opaque.
//
// Why this exists (Task #486):
//
//   buildScopedWhere() emits a tenant predicate using a DEFAULT, *bare*
//   (un-aliased) column when the caller doesn't pass an aliased
//   companyColumn / branchColumn / softDeleteColumn:
//
//       conditions.push(`"companyId" = $1`)    // <- bare default
//
//   The static scanner replaces every `${…}` (including `${where}`)
//   with a neutral placeholder, so it can NOT see this injected
//   `"companyId"`. If that `${where}` is spliced into a multi-table
//   JOIN whose relations BOTH carry `companyId`, Postgres raises the
//   parse-time 500:
//
//       error: column reference "companyId" is ambiguous
//
//   Today every JOIN call site happens to pass an aliased column
//   (e.g. `t."companyId"`), but nothing ENFORCED it — a future route
//   that drops the alias would ship the bug. This guard enforces it.
//
// What it does (mirrors check-sql-ambiguity / check-ghost-rows):
//   1. Connect via $DATABASE_URL and pull table → column names from
//      information_schema (public schema only).
//   2. Walk every .ts file under artifacts/api-server/src/routes/.
//   3. Find every `const { where[: alias], … } = <call>(…)` site. The
//      destructured `where` property is the signal that <call> returns
//      a buildScopedWhere() result (works for the direct call AND for
//      thin wrappers like buildFilter / buildFilterNoBranch). From the
//      call's object-literal argument we learn whether companyColumn /
//      branchColumn / softDeleteColumn were passed ALIASED.
//   3b. ALSO find every scopedQuery() / scopedCount() call (and any
//      wrapper listed in SCOPED_SQL_HELPERS). These helpers DON'T expose
//      a destructurable `where` — they take the SQL as their first
//      argument and inject the scoped predicate straight into it (at a
//      `{{WHERE}}` placeholder, or appended). The aliasing options live
//      in the 4th argument, parsed the same way. Without this, a future
//      scopedQuery call into a multi-table JOIN would reintroduce the
//      exact ambiguity blind spot this guard exists to close.
//   4. For each rawQuery(`…`) body, find the `${…}` holes that
//      reference one of those where-variables, and decide — using the
//      nearest preceding producer assignment — which scope columns it
//      would inject BARE.
//   5. Decompose the body into per-SELECT scopes (same machinery as the
//      static scanner), and for any scope whose `${where}` hole would
//      inject a bare companyId/branchId/deletedAt that is shared by 2+
//      of the scope's joined relations, emit a finding.
//   6. Allowlist file at `scripts/scoped-where-ambiguity-allowlist.txt`
//      records intentional exceptions. Format: `routes/<file>.ts`
//      (whole-file) or `routes/<file>.ts:<col>` (one column within the
//      file); `#` starts a comment.
//
// Scope columns checked: companyId, branchId, deletedAt — the three
// defaults buildScopedWhere can emit bare. (departmentId follows the
// same default but is excluded here to match the task's stated surface
// and keep the gate conservative.)
//
// Run:  node scripts/src/check-scoped-where-ambiguity.mjs
// Exits 0 clean, 1 on findings, 2 on environment error.
//

import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

import {
  stripCommentsAndStrings,
  splitStatements,
  findFromJoinReferences,
} from "./check-ghost-rows.mjs";
import { extractScopes, computeSharedColumns } from "./check-sql-ambiguity.mjs";
import {
  stripInterpolations,
  extractRawQueryBodiesWithOffsets,
} from "./lib/raw-query-bodies.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");
const ALLOWLIST_FILE = join(
  REPO_ROOT,
  "scripts/scoped-where-ambiguity-allowlist.txt",
);

// The scope columns buildScopedWhere can inject with a bare default,
// keyed by the buildScopedWhere option that aliases them.
const SCOPE_COLUMNS = ["companyId", "branchId", "deletedAt"];

// Helpers that take SQL as their FIRST argument and runtime-inject a
// scoped WHERE directly into it — either replacing a `{{WHERE}}`
// placeholder or appending `WHERE <scope>` — using the SAME aliasing
// options as buildScopedWhere (passed as the 4th argument:
// `(sql, scope, filters, options)`). Unlike buildScopedWhere, these
// expose NO destructurable `where`, so the producer signal in
// findProducers() can never see them. Any future wrapper that injects
// scope predicates through this sql-first shape (a new `scopedQuery` /
// `scopedCount` variant) MUST be listed here so the guard keeps
// covering it.
const SCOPED_SQL_HELPERS = ["scopedQuery", "scopedCount"];

// Synthetic hole name used to model the scoped WHERE these helpers splice
// into their SQL argument, so the analysis can reuse the same machinery
// as the `${where}` interpolation path.
const SCOPED_HELPER_HOLE = "__scopedHelperWhere__";

// ──────────────────────────────────────────────────────────────────────
// Pure helpers (exported for the unit-fixture file). None touch the DB
// or filesystem — they take a `tableColumns` Map of tableName →
// Set<columnName> and/or plain strings so they can be exercised with
// fixtures.
// ──────────────────────────────────────────────────────────────────────

// Is a column expression (the string buildScopedWhere would emit, e.g.
// `t."companyId"` or `"companyId"`) qualified by a table alias? A bare
// `"companyId"` / `companyId` is NOT — anything with an `<ident> .`
// prefix IS.
export function columnIsAliased(expr) {
  return /[A-Za-z_]\w*\s*\.\s*"?[A-Za-z_]/.test(expr);
}

// Parse the object-literal argument passed to buildScopedWhere / a
// wrapper into the subset of options that affect bare-column injection.
// String options keep their inner value (single- OR double-quoted JS
// string); boolean options are recognised as `key: true`.
export function parseScopedOptions(optsText) {
  const out = {};
  if (!optsText) return out;
  for (const key of [
    "companyColumn",
    "branchColumn",
    "softDeleteColumn",
    "departmentColumn",
  ]) {
    const re = new RegExp(`\\b${key}\\s*:\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`);
    const m = optsText.match(re);
    if (m) out[key] = m[2];
  }
  for (const key of [
    "disableBranchScope",
    "disableDepartmentScope",
    "enforceBranchScope",
    "enforceDepartmentScope",
  ]) {
    const re = new RegExp(`\\b${key}\\s*:\\s*true\\b`);
    if (re.test(optsText)) out[key] = true;
  }
  return out;
}

// Given the parsed options (and the callee name, used to detect the
// branch-stripping wrapper buildFilterNoBranch), return the set of
// logical scope columns this producer would inject BARE (un-aliased).
// A column already aliased — or disabled — is NOT in the set, so it can
// never produce an ambiguity finding.
export function bareScopeColumns(options = {}, calleeName = "") {
  const bare = new Set();

  // companyId — always emitted for a logged-in caller.
  const companyCol = options.companyColumn || '"companyId"';
  if (!columnIsAliased(companyCol)) bare.add("companyId");

  // branchId — emittable unless branch scoping is disabled (explicit
  // flag) or the producer is the branch-stripping NoBranch wrapper.
  const branchDisabled =
    options.disableBranchScope === true || /NoBranch/i.test(calleeName);
  if (!branchDisabled) {
    const branchCol = options.branchColumn || '"branchId"';
    if (!columnIsAliased(branchCol)) bare.add("branchId");
  }

  // deletedAt — only emitted when softDeleteColumn is passed at all.
  if (options.softDeleteColumn && !columnIsAliased(options.softDeleteColumn)) {
    bare.add("deletedAt");
  }

  return bare;
}

// Find the bare scope columns that are shared across 2+ of a SQL
// scope's joined relations — i.e. the columns whose bare injection
// would be ambiguous. `bareCols` is the Set from bareScopeColumns().
export function scopeAmbiguousColumns(scopeText, bareCols, tableColumns) {
  if (!bareCols || bareCols.size === 0) return [];
  const refs = findFromJoinReferences(scopeText).filter((r) =>
    tableColumns.has(r.table),
  );
  // One relation per distinct alias (self-join → two aliases, same table).
  const relByAlias = new Map();
  for (const r of refs) {
    const a = r.alias.toLowerCase();
    if (!relByAlias.has(a)) relByAlias.set(a, r.table);
  }
  if (relByAlias.size < 2) return [];
  const shared = computeSharedColumns([...relByAlias.values()], tableColumns);
  const hits = [];
  for (const col of bareCols) {
    if (SCOPE_COLUMNS.includes(col) && shared.has(col)) hits.push(col);
  }
  return hits;
}

// Replace every `${…}` interpolation (balanced braces) in a rawQuery
// body. Holes that reference a known scope-where variable become a
// unique `_swhole_K_` token (recorded with the union of bare columns
// those variables inject); all other interpolations collapse to a
// neutral `_interp_`. `nameToBareCols` is a Map name → Set<col>.
export function tagScopedHoles(body, nameToBareCols) {
  const holes = [];
  // Reuse the single shared depth-aware walker; the per-hole decision
  // (scope-where → _swhole_, anything else → _interp_) lives in this
  // replacement callback, which receives each interpolation's inner text.
  const text = stripInterpolations(body, (inner) => {
    const bare = new Set();
    let referencesScopeWhere = false;
    for (const [name, cols] of nameToBareCols) {
      const re = new RegExp(`(?:^|[^.\\w])${escapeRegex(name)}\\b`);
      if (re.test(inner)) {
        referencesScopeWhere = true;
        for (const c of cols) bare.add(c);
      }
    }
    if (referencesScopeWhere) {
      const token = ` _swhole_${holes.length}_ `;
      holes.push(bare);
      return token;
    }
    return " _interp_ ";
  });
  return { text, holes };
}

// Analyse one rawQuery body end-to-end. `nameToBareCols` resolves each
// scope-where variable referenced in the body to the bare columns it
// would inject. Returns { col }[] (deduped by caller).
export function analyzeBodyScoped(body, nameToBareCols, tableColumns) {
  const { text, holes } = tagScopedHoles(body, nameToBareCols);
  if (holes.length === 0) return [];
  const sql = stripCommentsAndStrings(text);
  const found = [];
  for (const stmt of splitStatements(sql)) {
    for (const scope of extractScopes(stmt)) {
      // Which holes landed inside this scope? Union their bare columns.
      const bare = new Set();
      for (let k = 0; k < holes.length; k++) {
        if (scope.includes(`_swhole_${k}_`)) {
          for (const c of holes[k]) bare.add(c);
        }
      }
      if (bare.size === 0) continue;
      for (const col of scopeAmbiguousColumns(scope, bare, tableColumns)) {
        found.push({ col });
      }
    }
  }
  return found;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Analyse one scoped-SQL-helper call (scopedQuery / scopedCount / a
// wrapper). Unlike the `${where}` path, the scope predicate is injected
// straight into the SQL argument: replacing a `{{WHERE}}` placeholder, or
// — when the SQL has none — appended as a trailing `WHERE <scope>`. We
// model that injection point as a single hole and then reuse the same
// per-SELECT scope analysis. `bareCols` is the Set from bareScopeColumns()
// for the call's options. Returns { col }[] (deduped by caller).
export function analyzeScopedHelperBody(sqlBody, bareCols, tableColumns) {
  if (!bareCols || bareCols.size === 0) return [];
  const hole = `\${${SCOPED_HELPER_HOLE}}`;
  const holed = sqlBody.includes("{{WHERE}}")
    ? sqlBody.split("{{WHERE}}").join(hole)
    : `${sqlBody} WHERE ${hole}`;
  return analyzeBodyScoped(
    holed,
    new Map([[SCOPED_HELPER_HOLE, bareCols]]),
    tableColumns,
  );
}

// Read a string/template-literal argument's inner text (without the
// surrounding quotes or backticks). Returns null when the argument is not
// a literal we can statically read (e.g. a variable holding the SQL) — in
// that case we can't see the JOIN shape, so the call is conservatively
// skipped.
export function readSqlLiteralArg(argText) {
  if (!argText) return null;
  const t = argText.trim();
  const q = t[0];
  if (q !== "`" && q !== '"' && q !== "'") return null;
  if (t.length < 2 || t[t.length - 1] !== q) return null;
  return t.slice(1, -1);
}

// ──────────────────────────────────────────────────────────────────────
// Source-parsing plumbing (not exercised by fixtures): find producer
// assignments + rawQuery bodies with their source offsets so a hole can
// be resolved against the NEAREST preceding producer of the same name.
// ──────────────────────────────────────────────────────────────────────

// Walk forward from the `(` at `open` and return the index just past
// the matching `)`, tolerant of nested parens / brackets / braces and
// string + template literals. Returns -1 if unbalanced.
function matchParen(src, open) {
  let depth = 0;
  let inStr = null;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

// Split a call's argument string into top-level arguments.
function splitTopLevelArgs(args) {
  const out = [];
  let curr = "";
  let depth = 0;
  let inStr = null;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (inStr) {
      curr += ch;
      if (ch === "\\") {
        curr += args[i + 1] ?? "";
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      curr += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      out.push(curr);
      curr = "";
      continue;
    }
    curr += ch;
  }
  if (curr.trim()) out.push(curr);
  return out;
}

// Find every `const|let { … where[: alias] … } = <callee>(<args>)`
// producer assignment. Returns { index, name, bareCols }[] sorted by
// index. The destructured `where` property is the signal that <callee>
// returns a buildScopedWhere() result.
function findProducers(source) {
  const producers = [];
  const re = /(?:const|let)\s*\{([^}]*)\}\s*=\s*([A-Za-z_]\w*)\s*\(/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const destructure = m[1];
    const callee = m[2];
    // The destructure must bind the `where` property (bare or aliased).
    const whereMatch = destructure.match(
      /(?:^|[,{\s])where(?:\s*:\s*([A-Za-z_]\w*))?(?=\s*[,}])/,
    );
    if (!whereMatch) continue;
    const name = whereMatch[1] || "where";
    const open = m.index + m[0].length - 1;
    const close = matchParen(source, open);
    if (close < 0) continue;
    const argsText = source.slice(open + 1, close - 1);
    const optsArg = splitTopLevelArgs(argsText).find((a) =>
      a.trim().startsWith("{"),
    );
    const options = parseScopedOptions(optsArg || "");
    const bareCols = bareScopeColumns(options, callee);
    producers.push({ index: m.index, name, bareCols });
  }
  return producers.sort((a, b) => a.index - b.index);
}

// Extract every rawQuery(`…`) body together with its source offset.
// Delegates to the single shared, generic-tolerant extractor (it returns
// `{ body, index }`, exactly the shape this scanner needs to resolve a
// `${where}` hole against its nearest preceding producer) so there is no
// private copy of the extraction loop to drift from the canonical one.
export const findRawQueryBodies = extractRawQueryBodiesWithOffsets;

// Find every scoped-SQL-helper call (scopedQuery / scopedCount / a
// listed wrapper) whose first argument is a readable SQL literal. Returns
// { index, body, optionsText, callee }[]. The injected scope predicate is
// modelled later via analyzeScopedHelperBody(). Calls whose SQL is passed
// as a variable (not a literal) are skipped — the JOIN shape isn't
// statically visible there.
function findScopedHelperCalls(source) {
  const calls = [];
  const re = new RegExp(
    `\\b(${SCOPED_SQL_HELPERS.join("|")})\\b\\s*(?:<[^(]*>)?\\s*\\(`,
    "g",
  );
  let m;
  while ((m = re.exec(source)) !== null) {
    const callee = m[1];
    const open = m.index + m[0].length - 1;
    const close = matchParen(source, open);
    if (close < 0) continue;
    const argsText = source.slice(open + 1, close - 1);
    const args = splitTopLevelArgs(argsText);
    const body = readSqlLiteralArg(args[0]);
    if (body === null) continue;
    // Signature is (sql, scope, filters, options) — options is the 4th arg.
    const optsArg = args[3];
    const optionsText =
      optsArg && optsArg.trim().startsWith("{") ? optsArg : "";
    calls.push({ index: m.index, body, optionsText, callee });
  }
  return calls;
}

// For a rawQuery body at `bodyIndex`, build the name → bareCols map by
// resolving each producer name to the NEAREST preceding assignment of
// that name (the one that actually fed this query). Names with no
// preceding assignment fall back to their earliest assignment so a hole
// is still analysed conservatively.
function resolveNamesForBody(producers, bodyIndex) {
  const byName = new Map();
  for (const p of producers) {
    const existing = byName.get(p.name);
    if (p.index < bodyIndex) {
      // Keep the closest preceding assignment.
      if (!existing || existing.index < p.index) byName.set(p.name, p);
    } else if (!existing) {
      // No preceding assignment yet — remember the first as a fallback.
      byName.set(p.name, p);
    }
  }
  const map = new Map();
  for (const [name, p] of byName) map.set(name, p.bareCols);
  return map;
}

// ──────────────────────────────────────────────────────────────────────
// DB + filesystem plumbing.
// ──────────────────────────────────────────────────────────────────────

function loadLiveSchema() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "[check:scoped-where-ambiguity] ERROR — DATABASE_URL is not set. " +
        "This check needs a live Postgres connection.",
    );
    process.exit(2);
  }
  const sql = `
    SELECT table_name AS tbl, column_name AS name
      FROM information_schema.columns
     WHERE table_schema = 'public';
  `;
  const res = spawnSync(
    "psql",
    [url, "-Atqc", sql.replace(/\s+/g, " ").trim()],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    console.error("[check:scoped-where-ambiguity] ERROR — psql failed:");
    console.error(res.stderr || res.stdout);
    process.exit(2);
  }
  const tableColumns = new Map();
  for (const line of res.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [tbl, name] = trimmed.split("|");
    if (!tbl || !name) continue;
    if (!tableColumns.has(tbl)) tableColumns.set(tbl, new Set());
    tableColumns.get(tbl).add(name);
  }
  return tableColumns;
}

async function loadAllowlist() {
  if (!existsSync(ALLOWLIST_FILE))
    return { files: new Set(), pairs: new Set() };
  const txt = await readFile(ALLOWLIST_FILE, "utf8");
  const files = new Set();
  const pairs = new Set();
  for (const raw of txt.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colonIdx = line.lastIndexOf(":");
    if (colonIdx > line.indexOf(".ts")) {
      const file = line.slice(0, colonIdx).trim();
      const col = line.slice(colonIdx + 1).trim();
      pairs.add(`${file}:${col}`);
    } else {
      files.add(line);
    }
  }
  return { files, pairs };
}

async function walk(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, acc);
    else if (entry.name.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

async function main() {
  const tableColumns = loadLiveSchema();
  if (tableColumns.size === 0) {
    console.error(
      "[check:scoped-where-ambiguity] ERROR — no columns returned from " +
        "information_schema. Is DATABASE_URL pointing at an empty database?",
    );
    process.exit(2);
  }
  const allow = await loadAllowlist();
  const files = await walk(ROUTES_DIR);

  const findings = [];
  let producerCount = 0;
  let scopedHelperCount = 0;
  for (const file of files) {
    const relFromSrc = relative(
      join(REPO_ROOT, "artifacts/api-server/src"),
      file,
    );
    if (allow.files.has(relFromSrc)) continue;
    const source = await readFile(file, "utf8");
    const producers = findProducers(source);
    producerCount += producers.length;
    const scopedHelperCalls = findScopedHelperCalls(source);
    scopedHelperCount += scopedHelperCalls.length;
    if (producers.length === 0 && scopedHelperCalls.length === 0) continue;

    const seen = new Set();
    const record = (col, via) => {
      if (allow.pairs.has(`${relFromSrc}:${col}`)) return;
      const sig = `${relFromSrc}:${col}`;
      if (seen.has(sig)) return;
      seen.add(sig);
      findings.push({ file: relFromSrc, col, via });
    };

    if (producers.length > 0) {
      for (const { body, index } of findRawQueryBodies(source)) {
        const nameToBareCols = resolveNamesForBody(producers, index);
        if (nameToBareCols.size === 0) continue;
        for (const f of analyzeBodyScoped(body, nameToBareCols, tableColumns)) {
          record(f.col, "buildScopedWhere");
        }
      }
    }

    for (const { body, optionsText, callee } of scopedHelperCalls) {
      const options = parseScopedOptions(optionsText);
      const bareCols = bareScopeColumns(options, callee);
      for (const f of analyzeScopedHelperBody(body, bareCols, tableColumns)) {
        record(f.col, callee);
      }
    }
  }

  console.log(
    `[check:scoped-where-ambiguity] scanned ${files.length} route files · ` +
      `${producerCount} scoped-where producers · ${scopedHelperCount} ` +
      `scoped-sql-helper calls · ${tableColumns.size} tables · ` +
      `${allow.files.size} file allowlist · ${allow.pairs.size} column allowlist.`,
  );

  if (findings.length === 0) {
    console.log(
      "[check:scoped-where-ambiguity] ✓ no bare scope columns injected into " +
        "multi-table queries.",
    );
    process.exit(0);
  }

  console.error(
    `\n[check:scoped-where-ambiguity] ✗ ${findings.length} bare scope ` +
      `column(s) injected into a multi-table query:\n`,
  );
  for (const f of findings) {
    console.error(
      `  ${f.file}: ${f.via} injects a BARE "${f.col}" into a ` +
        `JOIN where "${f.col}" exists on 2+ relations — pass an aliased ` +
        `option (e.g. { companyColumn: 'alias."${f.col}"' }) so the ` +
        `predicate isn't ambiguous.`,
    );
  }
  console.error(
    "\n  Fix: pass the aliased column option (companyColumn /\n" +
      "  branchColumn / softDeleteColumn) to buildScopedWhere — or, for a\n" +
      "  scopedQuery/scopedCount call, in its options argument. If a hit is\n" +
      "  a genuine false positive, add it to\n" +
      "  scripts/scoped-where-ambiguity-allowlist.txt as\n" +
      "  `routes/<file>.ts:<col>` (paths relative to artifacts/api-server/src/).",
  );
  process.exit(1);
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[check:scoped-where-ambiguity] ERROR —", err);
    process.exit(2);
  });
}
