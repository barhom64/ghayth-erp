#!/usr/bin/env node
//
// scripts/src/audit-schema-drift.mjs — Guard #3 (SQL ↔ schema drift).
//
// Catches the class of bug where raw SQL references a column name
// that no longer exists in the Postgres schema. This is the exact
// bug we hit with `cronScheduler.ts` querying `official_letters."branchId"`
// after the column was dropped — silent 500s in production.
//
// Why raw regex instead of a real SQL parser?
//
//   The goal is a *weak but reliable* guard: zero false positives,
//   catch-the-typos. A full SQL parser would introduce dozens of
//   edge cases (CTEs, window functions, JSON accessors…) and drag
//   the build time up. This script uses one pragmatic rule:
//
//     "Any quoted identifier inside a rawQuery template that is not
//      the name of any column or table in db/schema.sql is suspicious."
//
//   By using the global column set (not per-table), we sidestep the
//   JOIN problem entirely. A quoted identifier that is not ANY column
//   in ANY table is almost certainly a typo or a deleted column.
//
// Known weaknesses (accepted trade-off):
//
//   1. A stale reference to a column that still exists in some other
//      table will NOT be flagged. Example: if `branchId` is removed
//      from `official_letters` but still exists on `employees`, this
//      script will say "OK". The class of bug it DOES catch is:
//        - typos that match no column at all
//        - columns that have been dropped from the ENTIRE schema
//        - new identifiers introduced by a refactor that forgot to
//          update db/schema.sql
//   2. SELECT aliases (`AS "foo"`) are skipped by design.
//   3. Computed JSON paths inside SQL (`data->>'field'`) are not
//      inspected — the `'field'` is a string literal, not an
//      identifier, so the schema doesn't constrain it.
//
// Algorithm:
//
//   1. Parse db/schema.sql for `CREATE TABLE public.<table> (...);`
//      blocks and extract quoted column names.
//   2. Walk every .ts file under artifacts/api-server/src.
//   3. For each `rawQuery(\`...\`)` template, strip `${...}` and
//      single-quoted string values, then pull all `"identifier"`
//      tokens out of what remains.
//   4. Any identifier not in the allowed set (columns ∪ tables ∪
//      allowlist) is reported.
//
// Usage:
//
//   node scripts/src/audit-schema-drift.mjs
//   pnpm audit:schema
//

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCHEMA_FILE = join(REPO_ROOT, "db/schema.sql");
const API_SRC = join(REPO_ROOT, "artifacts/api-server/src");

// Postgres built-ins, aliases, and identifiers that appear in raw SQL
// but aren't schema columns. Additions require a one-line reason.
const BUILTIN_IDENTIFIERS = new Set([
  // Common SELECT aliases used across the codebase.
  "count",
  "total",
  "sum",
  "avg",
  "min",
  "max",
  // Generic terms often used as aliases or CTE names.
  "rn",
  "rank",
  "row_number",
]);

async function walk(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, acc);
    } else if (entry.name.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

// Parse db/schema.sql and build the set of all known column + table
// identifiers. The dump wraps camelCase names in double quotes, which
// is exactly the form we're checking against.
async function loadSchemaIdentifiers() {
  const text = await readFile(SCHEMA_FILE, "utf8");
  const columns = new Set();
  const tables = new Set();

  const tableRe = /CREATE TABLE public\.([\w]+)\s*\(([^;]+)\);/g;
  let match;
  while ((match = tableRe.exec(text)) !== null) {
    const tableName = match[1];
    tables.add(tableName);
    const body = match[2];

    // Match quoted column names OR bare unquoted ones at the start of a line.
    const lines = body.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Skip constraint lines.
      if (/^(CONSTRAINT|PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK)\b/i.test(trimmed)) {
        continue;
      }
      // Quoted identifier: "colName"
      const quoted = trimmed.match(/^"([^"]+)"/);
      if (quoted) {
        columns.add(quoted[1]);
        continue;
      }
      // Bare identifier: colname type …
      const bare = trimmed.match(/^([a-z_][a-z0-9_]*)\s/i);
      if (bare) {
        columns.add(bare[1]);
      }
    }
  }

  return { columns, tables };
}

// Strip ${…} interpolations and single-quoted string values from a
// template literal body so we only see SQL structure.
function sanitiseTemplate(body) {
  // Replace ${…} (non-greedy, balanced-ish) with a neutral placeholder.
  let out = body.replace(/\$\{[^}]*\}/g, " ? ");
  // Remove single-quoted string literals (values, not identifiers).
  out = out.replace(/'(?:[^'\\]|\\.)*'/g, " ");
  // Remove SQL line comments.
  out = out.replace(/--[^\n]*\n/g, "\n");
  // Remove /* … */ block comments.
  out = out.replace(/\/\*[\s\S]*?\*\//g, " ");
  return out;
}

// Pull every `rawQuery(`…`)` template literal body out of a source
// file, including multi-line ones and ones with embedded ${} expressions.
function extractRawQueryBodies(source) {
  const bodies = [];
  const re = /rawQuery\s*\(\s*`/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    // Walk forward from match end, handling nested ${...} blocks.
    let i = match.index + match[0].length;
    let depth = 0; // depth of ${...} interpolations
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
      if (ch === "`" && depth === 0) {
        break;
      }
      body += ch;
      i++;
    }
    bodies.push(body);
  }
  return bodies;
}

// Find every Postgres-style quoted identifier "foo" inside a sanitised
// SQL fragment. Skips identifiers that are column ALIASES introduced
// with `AS "foo"` — those are defined locally and have no relation to
// the schema. Also skips positional CTE / subquery names defined with
// `WITH "x" AS (...)` or `SELECT ... FROM (...) AS "x"`.
function findQuotedIdentifiers(sql) {
  const ids = [];
  const re = /"([a-zA-Z_][a-zA-Z0-9_]*)"/g;
  let match;
  while ((match = re.exec(sql)) !== null) {
    // Look 4 chars back for `AS ` (case-insensitive). That's the alias
    // form; skip it.
    const tail = sql.slice(Math.max(0, match.index - 4), match.index);
    if (/\bas\s*$/i.test(tail)) continue;
    ids.push(match[1]);
  }
  return ids;
}

async function main() {
  const { columns, tables } = await loadSchemaIdentifiers();
  if (columns.size === 0) {
    console.error(
      `[audit-schema-drift] ERROR — no columns parsed from ${SCHEMA_FILE}. ` +
        `Is the schema dump missing or in an unexpected format?`,
    );
    process.exit(2);
  }

  const allowed = new Set([...columns, ...tables, ...BUILTIN_IDENTIFIERS]);

  const srcFiles = await walk(API_SRC);
  const findings = [];

  for (const file of srcFiles) {
    const source = await readFile(file, "utf8");
    if (!source.includes("rawQuery")) continue;
    const bodies = extractRawQueryBodies(source);
    if (bodies.length === 0) continue;

    const rel = relative(REPO_ROOT, file);
    for (const raw of bodies) {
      const cleaned = sanitiseTemplate(raw);
      const ids = findQuotedIdentifiers(cleaned);
      for (const id of ids) {
        if (!allowed.has(id)) {
          findings.push({ file: rel, id, snippet: cleaned.slice(0, 120).replace(/\s+/g, " ").trim() });
        }
      }
    }
  }

  console.log(
    `[audit-schema-drift] scanned ${srcFiles.length} files · ` +
      `schema has ${columns.size} columns across ${tables.size} tables.`,
  );

  if (findings.length === 0) {
    console.log(`[audit-schema-drift] OK — no unknown quoted identifiers in rawQuery templates.`);
    process.exit(0);
  }

  // Collapse duplicates per (file, id).
  const seen = new Set();
  const unique = [];
  for (const f of findings) {
    const key = f.file + "::" + f.id;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(f);
  }

  console.error(
    `[audit-schema-drift] FAIL — ${unique.length} unknown quoted identifier(s) in raw SQL:\n`,
  );
  for (const f of unique) {
    console.error(`  ${f.file}  →  "${f.id}"`);
  }
  console.error(
    `\nEach identifier above is quoted inside a rawQuery template but is not\n` +
      `a column or table in db/schema.sql. Options:\n` +
      `  1. Fix the typo / deleted column (this is the common case).\n` +
      `  2. Refresh db/schema.sql via \`pnpm db:dump-schema\` if the column really exists.\n` +
      `  3. If it's a computed alias (e.g. COUNT(*) AS "x"), add "x" to BUILTIN_IDENTIFIERS with a reason.\n`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[audit-schema-drift] crashed:", err);
  process.exit(2);
});
