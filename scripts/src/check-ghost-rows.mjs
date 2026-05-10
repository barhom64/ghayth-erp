#!/usr/bin/env node
//
// scripts/src/check-ghost-rows.mjs
//
// Ghost-row guard. Catches the class of bug Task #161 fixed: a route
// that runs `SELECT … FROM <table>` against a table that has a
// `deletedAt` column but forgets the `"deletedAt" IS NULL` predicate,
// so soft-deleted rows leak back into the API response (the "ghost
// row" regression).
//
// Why this exists: `scripts/src/deepCrudTest.cjs` only exercises 21
// entities and only the user-facing list page. A new route added next
// sprint that hits the same table from a different endpoint can
// silently re-introduce the bug — the harness never sees it. This
// scanner runs against every route file on every commit / PR, so the
// regression is caught at build time instead of by a user noticing a
// deleted vendor in a report three weeks later.
//
// Algorithm:
//
//   1. Load the live schema via $DATABASE_URL and build the set of
//      tables that have a `deletedAt` column ("soft-delete tables").
//   2. Walk every .ts file under artifacts/api-server/src/routes/.
//   3. For each `rawQuery(`…`)` template literal, split the body into
//      individual SQL statements (top-level `;` aware) and, for each
//      statement that contains a SELECT keyword:
//        a. Find every `FROM <tbl> [AS] <alias>` / `JOIN <tbl> [AS]
//           <alias>` reference whose `<tbl>` is a soft-delete table.
//        b. Check that the same statement contains a matching
//           `<alias>."deletedAt"` (or `"<alias>"."deletedAt"`)
//           predicate — or, if the alias equals the table name and
//           is the only soft-delete reference, an unqualified
//           `"deletedAt"`.
//        c. If neither is present, flag it.
//   4. Statements that contain a `${…}` interpolation are skipped
//      because the missing predicate may be injected by a helper
//      such as `buildScopedWhere(…, { softDeleteColumn: '"deletedAt"' })`.
//      Skipping these keeps false positives at zero at the cost of a
//      few false negatives — acceptable for a guard that fails CI.
//   5. Allowlist file at `scripts/ghost-row-allowlist.txt` lets us
//      mark intentional exceptions (audit reports, restore-from-trash
//      flows, count-of-deleted dashboards). Lines are
//      `routes/<file>.ts[:tableName]`; `#` starts a comment.
//
// Exits non-zero with a readable diff so it can gate a build.
//

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { loadDrizzleSchema } from "./lib/drizzle-schema.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");
const ALLOWLIST_FILE = join(REPO_ROOT, "scripts/ghost-row-allowlist.txt");
const DRIZZLE_SCHEMA_FILE = join(REPO_ROOT, "lib/db/src/schema/index.ts");

function loadSoftDeleteTables() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "[check:ghost-rows] ERROR — DATABASE_URL is not set. " +
        "This check needs a live Postgres connection.",
    );
    process.exit(2);
  }
  const sql = `
    SELECT table_name
      FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'deletedAt';
  `;
  const res = spawnSync(
    "psql",
    [url, "-Atqc", sql.replace(/\s+/g, " ").trim()],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    console.error("[check:ghost-rows] ERROR — psql failed:");
    console.error(res.stderr || res.stdout);
    process.exit(2);
  }
  const tables = new Set();
  for (const line of res.stdout.split("\n")) {
    const t = line.trim();
    if (t) tables.add(t);
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
    if (line.includes(":")) {
      pairs.add(line);
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

// Pull every rawQuery(`…`) body, preserving ${…} interpolations as
// literal text so the per-statement scanner can detect them.
export function extractRawQueryBodies(source) {
  const bodies = [];
  const re = /rawQuery\s*\(\s*`/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    let i = match.index + match[0].length;
    let depth = 0;
    let body = "";
    while (i < source.length) {
      const ch = source[i];
      if (ch === "\\" && i + 1 < source.length) {
        body += source[i] + source[i + 1];
        i += 2;
        continue;
      }
      if (ch === "$" && source[i + 1] === "{") {
        depth++;
        body += "${";
        i += 2;
        continue;
      }
      if (ch === "}" && depth > 0) {
        depth--;
        body += "}";
        i++;
        continue;
      }
      if (ch === "`" && depth === 0) break;
      body += ch;
      i++;
    }
    bodies.push(body);
  }
  return bodies;
}

// Strip line/block SQL comments and quoted string literals so they
// don't trip the FROM/JOIN/WHERE scanners. ${…} interpolations are
// kept verbatim (we want to see them when deciding whether to skip a
// statement).
export function stripCommentsAndStrings(sql) {
  let out = sql.replace(/--[^\n]*\n/g, "\n");
  out = out.replace(/\/\*[\s\S]*?\*\//g, " ");
  out = out.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  return out;
}

// Split a SQL body into top-level statements at `;`. Respects parens
// (so a `;` inside a CASE/CTE doesn't break a statement) and string
// literals (already collapsed by stripCommentsAndStrings, but defensive).
export function splitStatements(sql) {
  const stmts = [];
  let curr = "";
  let depth = 0;
  let inStr = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inStr) {
      curr += ch;
      if (ch === "\\" && i + 1 < sql.length) {
        curr += sql[i + 1];
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      // Quoted "identifier" / 'literal' — track but keep contents.
      inStr = ch;
      curr += ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === ";" && depth === 0) {
      if (curr.trim()) stmts.push(curr);
      curr = "";
      continue;
    }
    curr += ch;
  }
  if (curr.trim()) stmts.push(curr);
  return stmts;
}

// Find every FROM/JOIN <table> [AS] <alias> in a statement. Returns
// an array of { table, alias }. Bare and quoted forms both match.
// Subquery starts (`FROM (`), LATERAL, set-returning functions, and
// non-public schema refs are ignored.
export function findFromJoinReferences(stmt) {
  const NOT_A_TABLE = new Set([
    "select", "lateral", "only", "rows", "values", "unnest",
    "generate_series", "jsonb_array_elements", "jsonb_to_recordset",
    "json_array_elements", "json_to_recordset",
  ]);
  const refs = [];
  // FROM/JOIN  [ONLY]  [schema.]"?tbl"?  [ [AS] "?alias"? ]
  const re =
    /\b(?:FROM|JOIN)\s+(?:ONLY\s+)?(?:"?([a-zA-Z_][a-zA-Z0-9_]*)"?\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?(?:\s+(?:AS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?)?/gi;
  let m;
  while ((m = re.exec(stmt)) !== null) {
    const schema = m[1]?.toLowerCase();
    const table = m[2];
    let alias = m[3];
    if (schema && schema !== "public") continue;
    if (NOT_A_TABLE.has(table.toLowerCase())) continue;
    // Reject "alias" candidates that are actually SQL keywords
    // (WHERE, ON, USING, LEFT/RIGHT/INNER/OUTER, GROUP, ORDER, …).
    if (alias && SQL_CLAUSE_KW.has(alias.toLowerCase())) alias = undefined;
    refs.push({ table, alias: alias ?? table });
  }
  return refs;
}

const SQL_CLAUSE_KW = new Set([
  "where", "on", "using", "left", "right", "inner", "outer", "full",
  "cross", "natural", "join", "group", "order", "limit", "offset",
  "having", "union", "intersect", "except", "returning", "for",
  "lateral", "and", "or", "not", "set",
]);

// Does the statement contain a `<alias>."deletedAt" IS NULL` predicate?
// Crucially we require the `IS NULL` tail — a bare `<alias>."deletedAt"`
// reference (e.g. `SELECT alias."deletedAt"` or `WHERE alias."deletedAt"
// IS NOT NULL`) does NOT keep ghost rows out of the result set, and
// must still be flagged.
export function statementHasAliasedDeletedAtIsNull(stmt, alias) {
  const a = alias.toLowerCase();
  // Match  alias."deletedAt" IS NULL   or   "alias"."deletedAt" IS NULL
  // (whitespace-tolerant, but `IS NOT NULL` must NOT match — note the
  // negative lookahead for the optional NOT keyword).
  const re = new RegExp(
    `(?:^|[^a-zA-Z0-9_"])"?${escapeRe(a)}"?\\s*\\.\\s*"deletedAt"\\s+IS\\s+(?!NOT\\b)NULL\\b`,
    "i",
  );
  return re.test(stmt);
}

export function statementHasUnqualifiedDeletedAtIsNull(stmt) {
  // Unqualified `"deletedAt" IS NULL` (not preceded by `alias.`).
  // Same negative lookahead guards against matching `IS NOT NULL`.
  const re = /(?:^|[^.\w])"deletedAt"\s+IS\s+(?!NOT\b)NULL\b/i;
  return re.test(stmt);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Drizzle typed-builder scanner ──────────────────────────────────
//
// Catches the same ghost-row class of bug, but for the typed builder:
//   db.select().from(employees).where(eq(employees.id, 1))
// TypeScript happily accepts that even though `employees` has a
// `deletedAt` column — the query then leaks soft-deleted rows.
//
// Required predicate forms (any one is enough):
//   isNull(<tableVar>.deletedAt)
//   eq(<tableVar>.deletedAt, null)
//
// We also accept either form appearing inside a join's ON arg, so
// that `.leftJoin(child, and(eq(child.parentId, parent.id),
//                              isNull(child.deletedAt)))` keeps the
// soft-delete filter on the right side of an outer join — which is
// the only correct place for it.

const JOIN_METHODS = new Set([
  "leftJoin", "rightJoin", "innerJoin", "fullJoin", "join",
  "leftOuterJoin", "rightOuterJoin", "fullOuterJoin",
]);

// Walk forward from `i`, skipping a balanced `(...)` group; returns
// the index just past the closing `)`. Respects string literals,
// template literals, and nested parens. Returns -1 if unbalanced.
function skipBalancedParen(source, i) {
  if (source[i] !== "(") return -1;
  let depth = 1;
  let j = i + 1;
  let inStr = null;
  while (j < source.length && depth > 0) {
    const ch = source[j];
    if (inStr) {
      if (ch === "\\" && j + 1 < source.length) {
        j += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      j++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      j++;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return j + 1;
    }
    j++;
  }
  return -1;
}

// Pull every `<obj>.select(...)` chain out of `source`. Each chain
// records the contiguous `.from / .leftJoin / … / .where / .having`
// calls so the predicate scanner can see every table referenced and
// every place a `deletedAt` predicate might have been added.
//
// A chain ends as soon as the dot-method run breaks (assignment,
// `;`, end of statement, or non-method continuation like `await` /
// `const x = `). Chains assigned to a variable
// (`const q = db.select().from(t)`) are then **stitched** with any
// later `q.where(…)` / `q.leftJoin(…)` / `q.having(…)` calls that
// happen before the variable is reassigned — closing the
// "split-across-statements" false negative left over from Task #168
// (Task #173). Reassignment uses the **latest** chain only: a later
// `q = db.select()...` truncates the followup-scan window for the
// previous chain.
export function findDrizzleSelectChains(source) {
  const chains = [];
  const re = /\.\s*select\s*\(/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    // Position pointer at the `(` of `.select(`.
    const openParen = m.index + m[0].length - 1;
    const afterSelect = skipBalancedParen(source, openParen);
    if (afterSelect < 0) continue;

    const links = [];
    let i = afterSelect;
    while (true) {
      while (i < source.length && /\s/.test(source[i])) i++;
      if (source[i] !== ".") break;
      let j = i + 1;
      while (j < source.length && /\s/.test(source[j])) j++;
      const nameStart = j;
      while (j < source.length && /[\w$]/.test(source[j])) j++;
      const method = source.slice(nameStart, j);
      if (!method) break;
      while (j < source.length && /\s/.test(source[j])) j++;
      if (source[j] !== "(") break;
      const after = skipBalancedParen(source, j);
      if (after < 0) break;
      const args = source.slice(j + 1, after - 1);
      links.push({ method, args });
      i = after;
    }
    const assignVar = detectAssignmentTarget(source, m.index);
    chains.push({ selectIdx: m.index, endIdx: i, links, assignVar });
  }

  // ── Stitch split builders ────────────────────────────────────────
  // Group chains by the variable they were assigned to, then for each
  // chain look forward (up to the next assignment to that same var)
  // for `<var>.method(...)` continuations and merge their links into
  // the chain.
  const byVar = new Map();
  for (const c of chains) {
    if (!c.assignVar) continue;
    if (!byVar.has(c.assignVar)) byVar.set(c.assignVar, []);
    byVar.get(c.assignVar).push(c);
  }
  for (const [varName, list] of byVar) {
    list.sort((a, b) => a.selectIdx - b.selectIdx);
    for (let idx = 0; idx < list.length; idx++) {
      const chain = list[idx];
      const scanEnd =
        idx + 1 < list.length ? list[idx + 1].selectIdx : source.length;
      mergeFollowupCallsForVar(source, chain, varName, scanEnd);
    }
  }
  return chains;
}

// Look backward from the `.select(` at `selectIdx` for an assignment
// target. Recognises `const|let|var <name> = …` as well as bare
// reassignments `<name> = …`. Returns the identifier or null. Bounded
// to ~300 chars and stops at `;` / unbalanced brackets so we don't
// cross statement boundaries.
export function detectAssignmentTarget(source, selectIdx) {
  const minIdx = Math.max(0, selectIdx - 300);
  let depth = 0;
  for (let i = selectIdx - 1; i >= minIdx; i--) {
    const ch = source[i];
    if (ch === ")" || ch === "]" || ch === "}") {
      depth++;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth--;
      if (depth < 0) return null;
      continue;
    }
    if (depth !== 0) continue;
    if (ch === ";" || ch === "\n" && looksLikeStatementBoundary(source, i)) {
      // Cheap statement-boundary heuristic: a bare `;` always ends
      // the search; a newline only ends it if the previous non-space
      // char isn't an operator that could continue an expression.
      if (ch === ";") return null;
    }
    if (ch === "=") {
      const prev = source[i - 1];
      const next = source[i + 1];
      // Reject `==`, `===`, `!=`, `<=`, `>=`, `=>`.
      if (prev === "=" || prev === "!" || prev === "<" || prev === ">") continue;
      if (next === "=" || next === ">") continue;
      // Found a real `=`. Walk back over whitespace, then over an
      // identifier.
      let j = i - 1;
      while (j >= 0 && /\s/.test(source[j])) j--;
      const identEnd = j + 1;
      while (j >= 0 && /[\w$]/.test(source[j])) j--;
      const ident = source.slice(j + 1, identEnd);
      if (!ident || /^\d/.test(ident)) return null;
      // Reject member-access targets (`obj.q = …`) — we can't track
      // those reliably.
      let k = j;
      while (k >= 0 && /\s/.test(source[k])) k--;
      if (source[k] === ".") return null;
      return ident;
    }
  }
  return null;
}

// Tiny helper kept inline for clarity; no real heuristic needed today
// because the only newline-vs-`;` case we care about is the bare `;`
// guard above.
function looksLikeStatementBoundary() {
  return false;
}

// Walk `source` from `chain.endIdx` up to `scanEnd` and merge any
// `<varName>.method(...)` continuations into `chain.links`. Stops if
// the variable is reassigned to a non-chain expression (e.g.
// `q = somethingElse`) before `scanEnd`.
function mergeFollowupCallsForVar(source, chain, varName, scanEnd) {
  const re = new RegExp(`\\b${escapeRe(varName)}\\b`, "g");
  re.lastIndex = chain.endIdx;
  let mm;
  while ((mm = re.exec(source)) !== null) {
    if (mm.index >= scanEnd) break;
    // Skip qualified accesses like `obj.q.…` — `\b` matches the
    // boundary between `.` and the identifier.
    if (mm.index > 0 && source[mm.index - 1] === ".") continue;
    let i = mm.index + varName.length;
    while (i < source.length && /\s/.test(source[i])) i++;
    // Reassignment to a non-chain expression — stop scanning.
    if (source[i] === "=") {
      const next = source[i + 1];
      if (next !== "=" && next !== ">") break;
    }
    if (source[i] !== ".") continue;
    // Parse the dot-method run starting at `i` exactly the same way
    // the main chain extractor does.
    while (true) {
      while (i < source.length && /\s/.test(source[i])) i++;
      if (source[i] !== ".") break;
      let j = i + 1;
      while (j < source.length && /\s/.test(source[j])) j++;
      const nameStart = j;
      while (j < source.length && /[\w$]/.test(source[j])) j++;
      const method = source.slice(nameStart, j);
      if (!method) break;
      while (j < source.length && /\s/.test(source[j])) j++;
      if (source[j] !== "(") break;
      const after = skipBalancedParen(source, j);
      if (after < 0) break;
      const args = source.slice(j + 1, after - 1);
      chain.links.push({ method, args });
      i = after;
    }
  }
}

// Pull the first identifier out of an args string. Used to resolve
// the table arg of `.from(<id>)` and the first arg of `.<x>Join(<id>,
// <on>)`. Strips an optional `schema.` prefix so
// `.from(schema.employees)` resolves to `employees`. Returns null if
// the arg is anything more complex (object, function call, etc.) —
// over-allowing is the safe direction for this guard.
export function extractTableVarFromArgs(args) {
  const trimmed = args.trim();
  const m = trimmed.match(
    /^(?:[a-zA-Z_$][\w$]*\s*\.\s*)?([a-zA-Z_$][\w$]*)\s*(?:,|$)/,
  );
  return m ? m[1] : null;
}

// Pull the second arg (the ON expression) out of a `.<x>Join(table,
// onExpr)` call. We split on the first top-level `,` and return the
// tail verbatim. Returns "" if the call has no second arg.
export function extractJoinOnArg(args) {
  let depth = 0;
  let inStr = null;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (inStr) {
      if (ch === "\\" && i + 1 < args.length) {
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
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) return args.slice(i + 1);
  }
  return "";
}

// Does `predicateText` contain a `deletedAt IS NULL` filter for the
// given Drizzle tableVar? Accepts the two idiomatic forms:
//   isNull(<tableVar>.deletedAt)
//   eq(<tableVar>.deletedAt, null)
export function predicateFiltersDeletedAt(predicateText, tableVar) {
  const v = escapeRe(tableVar);
  const isNullRe = new RegExp(
    `\\bisNull\\s*\\(\\s*${v}\\s*\\.\\s*deletedAt\\s*\\)`,
  );
  const eqNullRe = new RegExp(
    `\\beq\\s*\\(\\s*${v}\\s*\\.\\s*deletedAt\\s*,\\s*null\\s*\\)`,
    "i",
  );
  return isNullRe.test(predicateText) || eqNullRe.test(predicateText);
}

async function main() {
  const softDelete = loadSoftDeleteTables();
  if (softDelete.size === 0) {
    console.error(
      "[check:ghost-rows] ERROR — no `deletedAt` columns found in live schema. " +
        "Is DATABASE_URL pointing at an empty database?",
    );
    process.exit(2);
  }
  const allow = await loadAllowlist();
  const drizzleSchema = await loadDrizzleSchema(DRIZZLE_SCHEMA_FILE);
  const files = await walk(ROUTES_DIR);

  const findings = [];
  let stmtCount = 0;
  let skippedInterp = 0;
  let drizzleChainCount = 0;
  let drizzleRefCount = 0;

  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    const relFromRoutes = relative(join(REPO_ROOT, "artifacts/api-server/src"), file);
    if (allow.files.has(relFromRoutes)) continue;

    const source = await readFile(file, "utf8");

    // ── Drizzle .select(...).from(table) chains ─────────────────────
    // Run on every file (not gated on `rawQuery`) so once routes start
    // adopting the typed builder we catch ghost-row leaks immediately.
    if (/\.\s*select\s*\(/.test(source)) {
      const chains = findDrizzleSelectChains(source);
      for (const { links } of chains) {
        drizzleChainCount++;
        // Collect every (tableVar, sqlTableName) referenced via .from
        // and any join. Also collect every snippet that could carry
        // the IS-NULL predicate: each join's ON arg + every .where /
        // .having arg in the chain.
        const refs = [];
        const predicateChunks = [];
        for (const { method, args } of links) {
          if (method === "from") {
            const v = extractTableVarFromArgs(args);
            if (v) refs.push({ tableVar: v });
          } else if (JOIN_METHODS.has(method)) {
            const v = extractTableVarFromArgs(args);
            if (v) refs.push({ tableVar: v });
            predicateChunks.push(extractJoinOnArg(args));
          } else if (method === "where" || method === "having") {
            predicateChunks.push(args);
          }
        }
        if (refs.length === 0) continue;

        const predicateText = predicateChunks.join("\n");
        for (const { tableVar } of refs) {
          const tbl = drizzleSchema.get(tableVar);
          if (!tbl) continue; // unresolvable — skip (over-allow)
          if (!softDelete.has(tbl.tableName)) continue;
          drizzleRefCount++;
          if (allow.pairs.has(`${relFromRoutes}:${tbl.tableName}`)) continue;
          if (predicateFiltersDeletedAt(predicateText, tableVar)) continue;

          findings.push({
            file: rel,
            table: tbl.tableName,
            alias: tableVar,
            kind: "Drizzle .select().from()",
            snippet:
              `db.select(...).from(${tableVar})` +
              (predicateText.trim()
                ? `.where(${predicateText.replace(/\s+/g, " ").trim().slice(0, 120)})`
                : "  ← no .where(...) predicate"),
          });
        }
      }
    }

    if (!source.includes("rawQuery")) continue;

    const bodies = extractRawQueryBodies(source);
    for (const body of bodies) {
      const cleaned = stripCommentsAndStrings(body);
      for (const stmt of splitStatements(cleaned)) {
        if (!/\bSELECT\b/i.test(stmt)) continue;
        stmtCount++;

        // Skip statements with template interpolation — a helper
        // (buildScopedWhere, dynamic where clause, etc.) may inject
        // the predicate. False negatives are acceptable here.
        if (stmt.includes("${")) {
          skippedInterp++;
          continue;
        }

        const refs = findFromJoinReferences(stmt).filter((r) =>
          softDelete.has(r.table),
        );
        if (refs.length === 0) continue;

        const allowOnlyOneRef = refs.length === 1;
        for (const { table, alias } of refs) {
          if (allow.pairs.has(`${relFromRoutes}:${table}`)) continue;
          if (statementHasAliasedDeletedAtIsNull(stmt, alias)) continue;
          if (
            allowOnlyOneRef &&
            alias === table &&
            statementHasUnqualifiedDeletedAtIsNull(stmt)
          )
            continue;

          findings.push({
            file: rel,
            table,
            alias,
            snippet: stmt.replace(/\s+/g, " ").trim().slice(0, 180),
          });
        }
      }
    }
  }

  console.log(
    `[check:ghost-rows] scanned ${files.length} route file(s) · ` +
      `${softDelete.size} soft-delete table(s) in live schema · ` +
      `${stmtCount} rawQuery SELECT statement(s) inspected · ` +
      `${skippedInterp} skipped due to \${…} interpolation · ` +
      `${drizzleChainCount} Drizzle .select() chain(s) inspected · ` +
      `${drizzleRefCount} Drizzle reference(s) to a soft-delete table · ` +
      `${drizzleSchema.size} table(s) known in lib/db schema · ` +
      `${allow.files.size} file allowlist · ${allow.pairs.size} table allowlist.`,
  );

  if (findings.length === 0) {
    console.log(
      "[check:ghost-rows] OK — every SELECT against a soft-delete table " +
        "filters with `\"deletedAt\" IS NULL` (or `isNull(t.deletedAt)` in Drizzle).",
    );
    process.exit(0);
  }

  // Collapse duplicates per (file, table, alias, kind).
  const seen = new Set();
  const unique = [];
  for (const f of findings) {
    const key = `${f.file}::${f.table}::${f.alias}::${f.kind ?? "raw"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(f);
  }

  console.error(
    `[check:ghost-rows] FAIL — ${unique.length} SELECT(s) read from a ` +
      "soft-delete table without filtering `\"deletedAt\" IS NULL`. Soft-deleted " +
      "rows will leak into the API response (the bug Task #161 fixed):\n",
  );
  for (const f of unique) {
    const flavor = f.kind === "Drizzle .select().from()" ? "[drizzle] " : "";
    console.error(
      `  ${flavor}${f.file}  →  FROM ${f.table}` +
        (f.alias !== f.table ? ` AS ${f.alias}` : "") +
        `\n    ${f.snippet}`,
    );
  }
  console.error(
    "\nFix options:\n" +
      "  1. For raw SQL: add `<alias>.\"deletedAt\" IS NULL` to the WHERE clause\n" +
      "     (or to the JOIN ... ON clause for outer joins).\n" +
      "  2. For Drizzle: add `isNull(<table>.deletedAt)` (or\n" +
      "     `eq(<table>.deletedAt, null)`) to the chained `.where(...)` —\n" +
      "     or to the join's ON expression for the right side of an outer join.\n" +
      "  3. If the SELECT is intentional (audit report, restore-from-trash,\n" +
      "     deleted-count dashboard), add an exception to\n" +
      "     `scripts/ghost-row-allowlist.txt` — one entry per line, either\n" +
      "     `routes/<file>.ts` (whole-file) or `routes/<file>.ts:<tableName>`\n" +
      "     (just that one table). Comments start with `#`.\n",
  );
  process.exit(1);
}

// Only run the full CLI when invoked directly. Importing this module
// (e.g. from check-ghost-rows.test.mjs to reach the pure helpers) must
// NOT trigger the DB-scanning entrypoint.
const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/^.*\//, "") ?? "");
if (isDirectRun) {
  main().catch((err) => {
    console.error("[check:ghost-rows] crashed:", err);
    process.exit(2);
  });
}
