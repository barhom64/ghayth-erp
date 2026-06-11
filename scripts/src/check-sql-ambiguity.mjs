#!/usr/bin/env node
//
// scripts/src/check-sql-ambiguity.mjs
//
// Ambiguous-column guard for raw SQL in the api-server routes.
//
// Why this exists: a multi-table JOIN/EXISTS query that references a
// column which exists on two or more of the joined relations *without*
// a table alias makes Postgres raise:
//
//     error: column reference "status" is ambiguous
//
// This is a parse-time error — it fires even with zero rows — and has
// shipped to users (the 360° evaluation page surfaced a "column
// reference status is ambiguous" toast). A bare `"companyId"`, bare
// `status`, bare `id`, etc. in a JOINed statement is the bug class.
//
// What it does (mirrors check-schema-drift / check-ghost-rows):
//   1. Connect via $DATABASE_URL and pull table → column names from
//      information_schema (public schema only).
//   2. Walk every .ts file under artifacts/api-server/src/routes/.
//   3. Extract every rawQuery(`…`) body, replace ${…} interpolations
//      with a neutral placeholder, strip comments/strings, split into
//      statements, and decompose each statement into per-SELECT scopes
//      (subqueries analysed independently, function-call parens kept).
//   4. For each scope with 2+ joined relations, compute the set of
//      columns shared by 2+ of those relations, then flag any bare
//      (unqualified) reference to a shared column.
//   5. Allowlist file at `scripts/sql-ambiguity-allowlist.txt` lets us
//      record intentional / false-positive exceptions. Format:
//      `routes/<file>.ts` (whole-file) or `routes/<file>.ts:<col>`
//      (one column within the file); `#` starts a comment.
//
// Scope (matches Task #470): only *multi-table* unqualified refs are
// flagged. Single-table bare refs, query-logic, and schema are out of
// scope. Runtime-injected SQL (the ${…} fragments produced by
// buildScopedWhere etc.) is opaque to a static scanner and is treated
// as an accepted blind spot — same precedent as check-ghost-rows.
//
// Run:  node scripts/src/check-sql-ambiguity.mjs
// Exits 0 clean, 1 on findings, 2 on environment error.
//

import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

import {
  extractRawQueryBodies,
  stripCommentsAndStrings,
  splitStatements,
  findFromJoinReferences,
} from "./check-ghost-rows.mjs";
import { stripInterpolations } from "./lib/raw-query-bodies.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");
const ALLOWLIST_FILE = join(REPO_ROOT, "scripts/sql-ambiguity-allowlist.txt");

// ──────────────────────────────────────────────────────────────────────
// Pure helpers (exported for the unit-fixture file). None of these touch
// the DB or the filesystem — they take a `tableColumns` Map of
// tableName → Set<columnName> so they can be exercised with fixtures.
// ──────────────────────────────────────────────────────────────────────

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replace every ${…} interpolation (balanced braces) with a neutral
// placeholder token so the surrounding static SQL still parses. The
// injected SQL itself is opaque (accepted blind spot). Delegates to the
// single shared depth-aware walker (stripInterpolations) so the
// brace-counting logic lives in exactly one place.
export function replaceInterpolations(body) {
  return stripInterpolations(body, " _interp_ ");
}

// Decompose a statement into independent query scopes. Every
// parenthesised group that contains a SELECT is a subquery: it is
// analysed on its own and replaced in the parent with `()` so its
// tables/columns don't leak into the outer FROM list. Function-call /
// expression parens (no SELECT) are kept verbatim because a bare ref
// inside e.g. COUNT(status) is still subject to the outer scope.
export function extractScopes(stmt) {
  const scopes = [];
  function recurse(text) {
    let result = "";
    let i = 0;
    while (i < text.length) {
      if (text[i] === "(") {
        let depth = 0;
        let j = i;
        for (; j < text.length; j++) {
          if (text[j] === "(") depth++;
          else if (text[j] === ")") {
            depth--;
            if (depth === 0) break;
          }
        }
        const inner = text.slice(i + 1, j);
        if (/\bselect\b/i.test(inner)) {
          recurse(inner);
          result += "()";
        } else {
          result += text.slice(i, j + 1);
        }
        i = j + 1;
      } else {
        result += text[i];
        i++;
      }
    }
    scopes.push(result);
  }
  recurse(stmt);
  return scopes;
}

// Columns shared by 2+ of the given relations. `relations` is an array
// of table names (one entry per FROM/JOIN alias — a self-join lists the
// same table twice so all of its columns count as shared).
export function computeSharedColumns(relations, tableColumns) {
  const counts = new Map();
  for (const table of relations) {
    const cols = tableColumns.get(table);
    if (!cols) continue;
    for (const c of cols) counts.set(c, (counts.get(c) || 0) + 1);
  }
  const shared = new Set();
  for (const [c, n] of counts) if (n >= 2) shared.add(c);
  return shared;
}

// Output column aliases defined in a scope via `AS name` / `AS "name"`.
// Postgres resolves bare names in ORDER BY / GROUP BY to these first, so
// such refs are NOT ambiguous and must not be flagged.
export function extractOutputAliases(scope) {
  const out = new Set();
  const re = /\bAS\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
  let m;
  while ((m = re.exec(scope)) !== null) out.add(m[1]);
  return out;
}

// Is `idx` inside an ORDER BY / GROUP BY region? (i.e. the nearest
// preceding top-level clause keyword is ORDER BY or GROUP BY.)
export function isInOrderOrGroupRegion(scope, idx) {
  const head = scope.slice(0, idx).toLowerCase();
  const clauses = [
    { re: /\bselect\b/g },
    { re: /\bfrom\b/g },
    { re: /\bwhere\b/g },
    { re: /\bhaving\b/g },
    { re: /\bgroup\s+by\b/g, group: true },
    { re: /\border\s+by\b/g, order: true },
  ];
  let bestPos = -1;
  let bestKind = null;
  for (const c of clauses) {
    let m;
    let last = -1;
    while ((m = c.re.exec(head)) !== null) last = m.index;
    if (last > bestPos) {
      bestPos = last;
      bestKind = c.order ? "order" : c.group ? "group" : "other";
    }
  }
  return bestKind === "order" || bestKind === "group";
}

// Core: given one query scope and the live schema, return findings of
// bare (unqualified) references to columns shared across 2+ relations.
export function findAmbiguousRefs(scope, tableColumns) {
  const refs = findFromJoinReferences(scope).filter((r) =>
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
  if (shared.size === 0) return [];

  const aliasSet = new Set(relByAlias.keys());
  const tableNameSet = new Set(
    [...relByAlias.values()].map((t) => t.toLowerCase()),
  );
  const outputAliases = extractOutputAliases(scope);
  const findings = [];

  for (const col of shared) {
    // Quoted refs: "col" not preceded by `<ident> .`
    const qre = new RegExp(`"${escapeRegex(col)}"`, "g");
    let m;
    while ((m = qre.exec(scope)) !== null) {
      const before = scope.slice(Math.max(0, m.index - 48), m.index);
      if (/[A-Za-z0-9_]\s*\.\s*$/.test(before)) continue; // alias."col"
      if (isInOrderOrGroupRegion(scope, m.index) && outputAliases.has(col)) {
        continue;
      }
      findings.push({ col, kind: "quoted", index: m.index });
    }

    // Unquoted refs only matter for columns that are valid as unquoted
    // identifiers. Postgres folds an unquoted token to lowercase, so a
    // camelCase column (e.g. companyId) can ONLY be referenced quoted —
    // a bare `companyId` would be "does not exist", never "ambiguous".
    if (!/[A-Z]/.test(col)) {
      const ure = new RegExp(`\\b${escapeRegex(col)}\\b`, "g");
      while ((m = ure.exec(scope)) !== null) {
        const idx = m.index;
        const prev = idx > 0 ? scope[idx - 1] : "";
        if (prev === "." || prev === '"') continue; // qualified / quoted
        const after = scope[idx + col.length] ?? "";
        if (after === "." || after === "(" || after === '"') continue; // qualifier / fn / quoted
        const lc = col.toLowerCase();
        if (tableNameSet.has(lc) || aliasSet.has(lc)) continue; // it's a relation name
        if (/\bas\s+$/i.test(scope.slice(Math.max(0, idx - 6), idx))) continue; // `AS col` definition
        if (isInOrderOrGroupRegion(scope, idx) && outputAliases.has(col)) {
          continue;
        }
        findings.push({ col, kind: "unquoted", index: idx });
      }
    }
  }
  return findings;
}

// Core (second bug class): given one query scope and the live schema,
// return qualified references (`alias.col` / `alias."col"`) to a column
// that does NOT exist on the aliased relation. This is the
// `column "grn.status" does not exist` → 500 class that schema-drift
// misses because it only validates *quoted* identifiers, not bare
// `alias.column` refs in a SELECT list.
//
// Precision rules (low false-positive — this is a hard merge gate):
//   * Only qualifiers that resolve to a known public table via FROM/JOIN
//     are checked. Unknown qualifiers (CTEs, subquery aliases, function
//     results, information_schema/pg_catalog tables) are skipped — same
//     accepted blind spot as the ambiguity scan.
//   * Quoted `alias."Col"` must match the stored column exactly.
//   * Unquoted `alias.col` is folded to lowercase by Postgres, so it only
//     matches a column stored all-lowercase — mirroring real PG resolution
//     (an unquoted ref to a camelCase column would itself 500).
export function findMissingQualifiedColumns(scope, tableColumns) {
  const refs = findFromJoinReferences(scope).filter((r) =>
    tableColumns.has(r.table),
  );
  if (refs.length === 0) return [];
  // qualifier (alias OR bare table name, lowercased) → table name
  const qualToTable = new Map();
  for (const r of refs) {
    qualToTable.set(r.alias.toLowerCase(), r.table);
    qualToTable.set(r.table.toLowerCase(), r.table);
  }
  const findings = [];
  const seen = new Set();
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*("?)([A-Za-z_][A-Za-z0-9_]*)\2/g;
  let m;
  while ((m = re.exec(scope)) !== null) {
    const qual = m[1].toLowerCase();
    const quoted = m[2] === '"';
    const col = m[3];
    // `alias.${…}` collapses to `alias._interp_` after interpolation
    // stripping — the column name is runtime-injected and opaque, so it
    // is an accepted blind spot, never a missing-column finding.
    if (col === "_interp_" || qual === "_interp_") continue;
    const table = qualToTable.get(qual);
    if (!table) continue; // unknown qualifier — accepted blind spot
    const cols = tableColumns.get(table);
    if (!cols) continue;
    const exists = quoted ? cols.has(col) : cols.has(col.toLowerCase());
    if (exists) continue;
    const sig = `${qual}.${col}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    findings.push({ table, qual, col, quoted });
  }
  return findings;
}

// Collect SQL-fragment string variables that are assembled OUTSIDE a
// rawQuery template and later spliced in via `${var}`. The pattern that
// shipped the `je."postingDate"` 500:
//
//     let dateFilter = "";
//     if (endDate) dateFilter += ` AND je."postingDate" < ...`;  // ← here
//     rawQuery(`SELECT ... FROM journal_entries je ... ${dateFilter}`);
//
// Each `var (+)= `…`` template literal that looks like SQL is accumulated
// per variable name. Returns Map<varName, concatenatedFragmentText>.
// Over-approximates by unioning every literal assigned to a name across
// the whole file — that is SAFE because a fragment inlined into a body
// whose FROM/JOIN does not bind the fragment's alias is simply skipped
// (unknown qualifier), so clean code can never produce a finding.
export function collectSqlFragmentVars(source) {
  const map = new Map();
  const re = /([A-Za-z_$][\w$]*)\s*\+?=\s*`([^`]*)`/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const name = m[1];
    const text = m[2];
    // Only keep SQL-looking fragments (a qualified ref or a SQL keyword) —
    // never inline unrelated template strings (HTML, log lines, etc.).
    const looksSql =
      /[A-Za-z_]\w*\s*\.\s*"?[A-Za-z_]/.test(text) ||
      /\b(AND|OR|WHERE|JOIN|SELECT|FROM|ORDER\s+BY|GROUP\s+BY|HAVING)\b/i.test(
        text,
      );
    if (!looksSql) continue;
    map.set(name, (map.has(name) ? map.get(name) + " " : "") + text);
  }
  return map;
}

// Split a route file into per-handler slices at every `router.<verb>(`
// boundary (plus the module-level preamble before the first handler).
// Fragment collection MUST be scoped to one handler: variable names like
// `where`, `q`, `filter` and aliases like `m`/`e`/`f` are reused across
// handlers binding DIFFERENT tables, so a file-wide union would inline one
// handler's fragment into another's body and resolve the alias to the
// wrong table — a false positive. Slicing errs toward NOT inlining (a
// fragment built in a helper and used in a separate handler is simply
// missed), which is the safe direction for a merge gate: false negatives,
// never false positives.
export function splitHandlerSlices(source) {
  // Match any router-like identifier (`router`, or any camelCase name ending
  // in `Router` such as `reportsRouter`/`accountsRouter`/`journalRouter`),
  // not just the literal `router`. Many route modules name their Router
  // instance differently, and a too-narrow boundary regex collapses the
  // whole file into one slice — which would let SQL-fragment vars bleed
  // across handlers and defeat the per-handler scoping guarantee. The
  // `*Router` shape is precise enough to avoid spurious splits on calls like
  // `res.get(...)` / `app.use(...)` / `cache.get(...)`.
  const re =
    /\b(?:[A-Za-z_$][\w$]*Router|router)\s*\.\s*(?:get|post|put|patch|delete|use|all)\s*\(/g;
  const idxs = [];
  let m;
  while ((m = re.exec(source)) !== null) idxs.push(m.index);
  if (idxs.length === 0) return [source];
  const slices = [];
  if (idxs[0] > 0) slices.push(source.slice(0, idxs[0]));
  for (let i = 0; i < idxs.length; i++) {
    const end = i + 1 < idxs.length ? idxs[i + 1] : source.length;
    slices.push(source.slice(idxs[i], end));
  }
  return slices;
}

// Splice collected SQL fragments into a body in place of their `${var}`
// interpolation, so the per-scope scanner sees `alias."col"` right next
// to the FROM/JOIN that binds `alias` and resolves it in the CORRECT
// scope. Only known fragment vars are substituted; every other
// interpolation is left untouched for the _interp_ placeholder. Reusing
// the scope-correct resolver this way is what makes the fragment check
// false-positive-free (a whole-file alias map cannot tell which scope a
// reused alias like `cat` belongs to).
export function inlineFragments(body, fragMap) {
  if (!fragMap || fragMap.size === 0) return body;
  return body.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (full, name) =>
    fragMap.has(name) ? ` ${fragMap.get(name)} ` : full,
  );
}

// Analyse one rawQuery body end-to-end. Returns tagged findings:
//   { type: "ambiguous", col, kind } | { type: "missing", col, table }
// (index dropped — callers dedupe per (type, col)). `fragMap` (optional)
// inlines interpolated SQL fragments first so fragment-built refs resolve
// in their real scope.
export function analyzeBody(body, tableColumns, fragMap) {
  const found = [];

  // Ambiguous pass — runs on the NON-inlined body. Inlining a bare-column
  // fragment into a multi-join body can manufacture a cross-context
  // ambiguity that doesn't exist at runtime, so this pass keeps the proven
  // template-only behaviour.
  const ambSql = stripCommentsAndStrings(replaceInterpolations(body));
  for (const stmt of splitStatements(ambSql)) {
    for (const scope of extractScopes(stmt)) {
      for (const f of findAmbiguousRefs(scope, tableColumns)) {
        found.push({ type: "ambiguous", col: f.col, kind: f.kind });
      }
    }
  }

  // Missing-column pass — runs on the INLINED body so a qualified ref built
  // in a spliced-in fragment (the `je."postingDate"` 500 class) resolves in
  // its real scope. High-confidence with no false positives: a finding
  // requires the alias to be FROM/JOIN-bound in THIS body AND the column
  // absent on that table — always a guaranteed runtime error.
  const missSql = stripCommentsAndStrings(
    replaceInterpolations(inlineFragments(body, fragMap)),
  );
  for (const stmt of splitStatements(missSql)) {
    for (const scope of extractScopes(stmt)) {
      for (const f of findMissingQualifiedColumns(scope, tableColumns)) {
        found.push({ type: "missing", col: `${f.qual}.${f.col}`, table: f.table });
      }
    }
  }
  return found;
}

// ──────────────────────────────────────────────────────────────────────
// DB + filesystem plumbing (not exported; not exercised by fixtures).
// ──────────────────────────────────────────────────────────────────────

function loadLiveSchema() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "[check:sql-ambiguity] ERROR — DATABASE_URL is not set. " +
        "This check needs a live Postgres connection.",
    );
    process.exit(2);
  }
  const sql = `
    SELECT table_name AS tbl, column_name AS name
      FROM information_schema.columns
     WHERE table_schema = 'public';
  `;
  const res = spawnSync("psql", [url, "-Atqc", sql.replace(/\s+/g, " ").trim()], {
    encoding: "utf8",
  });
  if (res.status !== 0) {
    console.error("[check:sql-ambiguity] ERROR — psql failed:");
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
  if (!existsSync(ALLOWLIST_FILE)) return { files: new Set(), pairs: new Set() };
  const txt = await readFile(ALLOWLIST_FILE, "utf8");
  const files = new Set();
  const pairs = new Set();
  for (const raw of txt.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colonIdx = line.lastIndexOf(":");
    // `routes/foo.ts:status` → pair; `routes/foo.ts` → whole-file.
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
      "[check:sql-ambiguity] ERROR — no columns returned from " +
        "information_schema. Is DATABASE_URL pointing at an empty database?",
    );
    process.exit(2);
  }
  const allow = await loadAllowlist();
  const files = await walk(ROUTES_DIR);

  const findings = [];
  for (const file of files) {
    const relFromSrc = relative(
      join(REPO_ROOT, "artifacts/api-server/src"),
      file,
    );
    if (allow.files.has(relFromSrc)) continue;
    const source = await readFile(file, "utf8");
    const seen = new Set();
    const addFinding = (f) => {
      if (allow.pairs.has(`${relFromSrc}:${f.col}`)) return;
      const sig = `${relFromSrc}:${f.type}:${f.col}`;
      if (seen.has(sig)) return;
      seen.add(sig);
      findings.push({
        file: relFromSrc,
        type: f.type,
        col: f.col,
        kind: f.kind,
        table: f.table,
      });
    };
    // Analyse one handler at a time so SQL fragments spliced in via `${var}`
    // (the `je."postingDate"` 500 class) are inlined ONLY into bodies from
    // the same handler — see splitHandlerSlices for why file-wide inlining
    // false-positives on reused names (`where`, alias `m`/`e`/`f`).
    for (const slice of splitHandlerSlices(source)) {
      const fragMap = collectSqlFragmentVars(slice);
      for (const body of extractRawQueryBodies(slice)) {
        for (const f of analyzeBody(body, tableColumns, fragMap)) addFinding(f);
      }
    }
  }

  console.log(
    `[check:sql-ambiguity] scanned ${files.length} route files · ` +
      `${tableColumns.size} tables · ${allow.files.size} file allowlist · ` +
      `${allow.pairs.size} column allowlist.`,
  );

  if (findings.length === 0) {
    console.log(
      "[check:sql-ambiguity] ✓ no ambiguous / missing qualified column references found.",
    );
    process.exit(0);
  }

  const ambiguous = findings.filter((f) => f.type === "ambiguous");
  const missing = findings.filter((f) => f.type === "missing");

  console.error(
    `\n[check:sql-ambiguity] ✗ ${findings.length} issue(s) in raw SQL ` +
      `(${ambiguous.length} ambiguous, ${missing.length} missing column):\n`,
  );
  if (ambiguous.length > 0) {
    console.error(
      "  Ambiguous column references (column exists on 2+ joined relations, used bare):",
    );
    for (const f of ambiguous) {
      console.error(
        `    ${f.file}: bare ${f.kind} "${f.col}" in a JOIN/EXISTS — ` +
          `qualify it (alias."${f.col}").`,
      );
    }
    console.error("");
  }
  if (missing.length > 0) {
    console.error(
      '  Qualified references to a NON-EXISTENT column (the `column "x.y" does not exist` 500 class):',
    );
    for (const f of missing) {
      console.error(
        `    ${f.file}: "${f.col}" — table "${f.table}" has no such column.`,
      );
    }
    console.error("");
  }
  console.error(
    "  Fix: qualify ambiguous refs with their alias; correct or remove\n" +
      "  references to columns that don't exist. If a hit is a genuine false\n" +
      "  positive, add it to scripts/sql-ambiguity-allowlist.txt as\n" +
      "  `routes/<file>.ts:<col>` (paths relative to artifacts/api-server/src/;\n" +
      "  for a missing-column hit <col> is the full `alias.column`).",
  );
  process.exit(1);
}

// Only run main() when invoked directly (not when imported by the test).
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[check:sql-ambiguity] ERROR —", err);
    process.exit(2);
  });
}
