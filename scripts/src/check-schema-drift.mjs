#!/usr/bin/env node
//
// scripts/src/check-schema-drift.mjs
//
// Live schema drift guard. Same algorithm as `audit-schema-drift.mjs`,
// but reads the column/table set from the LIVE database via
// `information_schema` instead of the cached `db/schema.sql` dump.
//
// Why a second script instead of replacing the dump-based one?
//
//   The dump-based audit is fast and runs offline (useful in pre-commit
//   hooks). The live check is what you actually want in CI / before a
//   release: if a route INSERT references `suppliers.category` but the
//   migration was never applied to the real DB, the dump might still
//   list the column (because someone re-dumped after a local migration)
//   while production crashes with a 500. Hitting the live DB removes
//   that gap entirely.
//
// What it catches (the bugs that motivated this script):
//
//   - suppliers.category               (route INSERT, missing migration)
//   - invoices.costCenter              (route INSERT, missing migration)
//   - umrah_packages.updatedAt         (route UPDATE, missing column)
//   - employees.attachments            (route INSERT, missing column)
//   - financial_posting_failures table (entire table missing)
//
// Algorithm:
//
//   1. Connect via $DATABASE_URL and pull column + table names from
//      information_schema (public schema only). Also keep a per-table
//      column index so Drizzle key lookups can be validated against
//      the right table (a column existing on *some* table isn't
//      enough — it must exist on the table we're inserting into).
//   2. Walk every .ts file under artifacts/api-server/src/routes/.
//   3. For each `rawQuery(`…`)` template literal, strip ${...} blocks
//      and string literals, then collect every quoted "identifier".
//   4. ALSO scan Drizzle calls of the form
//        <something>.insert(<var>).values({ k1: …, k2: … })
//        <something>.update(<var>).set({ k1: …, … })
//      For each top-level key in the literal, look up <var> in the
//      Drizzle schema map (lib/db/src/schema/index.ts) → SQL column
//      name, then assert that column exists on the matching table in
//      information_schema.
//   5. Any identifier not in the live schema is reported as drift.
//
// Why this matters: the rawQuery scanner caught the original wave of
// schema-drift bugs (suppliers.category, invoices.costCenter, etc.),
// but as routes migrate to Drizzle's typed builder the same class of
// bug becomes invisible to a SQL-only scanner — TypeScript happily
// accepts a field on the schema object even if the live DB is missing
// the column (e.g. when a migration was never applied to prod).
//
// Exits non-zero with a readable diff so it can gate a build.
//

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { loadDrizzleSchema } from "./lib/drizzle-schema.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");
const DRIZZLE_SCHEMA_FILE = join(REPO_ROOT, "lib/db/src/schema/index.ts");

// Object keys that legitimately appear inside `.values({…})` /
// `.set({…})` literals but do NOT represent a column write — Drizzle
// allows passing `sql\`…\`` builders, and inside `.onConflictDo*` the
// nested `set:` is itself an object literal with column keys (handled
// when the call is detected directly), so the wrapper keys don't
// need to map to a column.
const DRIZZLE_KEY_ALLOWLIST = new Set([
  // Spread placeholder we emit when we see `...something`.
  "__spread__",
]);

const BUILTIN_IDENTIFIERS = new Set([
  // Common SELECT aggregate aliases.
  "count",
  "total",
  "sum",
  "avg",
  "min",
  "max",
  // Window/CTE helpers.
  "rn",
  "rank",
  "row_number",
]);

function loadLiveSchema() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "[check:schema-drift] ERROR — DATABASE_URL is not set. " +
        "This check needs a live Postgres connection.",
    );
    process.exit(2);
  }

  // We pull `table_name|column_name` for every public column so the
  // Drizzle scanner can ask "does column X exist *on table Y*?". The
  // legacy rawQuery scanner only needs the flat column/table sets,
  // which we derive from the same result.
  const sql = `
    SELECT 'col'::text AS kind, table_name AS tbl, column_name AS name
      FROM information_schema.columns
     WHERE table_schema = 'public'
    UNION
    SELECT 'tbl'::text AS kind, table_name AS tbl, ''::text AS name
      FROM information_schema.tables
     WHERE table_schema = 'public';
  `;

  const res = spawnSync(
    "psql",
    [url, "-Atqc", sql.replace(/\s+/g, " ").trim()],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    console.error("[check:schema-drift] ERROR — psql failed:");
    console.error(res.stderr || res.stdout);
    process.exit(2);
  }

  const columns = new Set();
  const tables = new Set();
  const tableColumns = new Map(); // tableName → Set<columnName>
  for (const line of res.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [kind, tbl, name] = trimmed.split("|");
    if (!tbl) continue;
    if (kind === "col" && name) {
      columns.add(name);
      if (!tableColumns.has(tbl)) tableColumns.set(tbl, new Set());
      tableColumns.get(tbl).add(name);
    } else if (kind === "tbl") {
      tables.add(tbl);
      if (!tableColumns.has(tbl)) tableColumns.set(tbl, new Set());
    }
  }
  return { columns, tables, tableColumns };
}

// `loadDrizzleSchema` and `splitTopLevel` live in
// `./lib/drizzle-schema.mjs` so this script and `check-ghost-rows.mjs`
// resolve Drizzle table-vars through the same parser (Task #168).

// Walk a `{ … }` literal starting at source[startIdx] (which must be
// `{`) and return { keys: [...], endIdx } — keys are the top-level
// property names. Handles shorthand (`{ id, name }`), string keys
// (`{ "col": v }`), computed keys (skipped — emit "__computed__"),
// spreads (skipped — emit "__spread__"), nested objects/arrays/calls,
// template literals, and line/block comments.
function parseObjectLiteralKeys(source, startIdx) {
  if (source[startIdx] !== "{") return { keys: [], endIdx: startIdx };
  const keys = [];
  let i = startIdx + 1;
  let depth = 1;
  let entryStart = true;

  while (i < source.length && depth > 0) {
    const ch = source[i];

    // Comments.
    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (
        i < source.length - 1 &&
        !(source[i] === "*" && source[i + 1] === "/")
      )
        i++;
      i += 2;
      continue;
    }

    // Whitespace between entries.
    if (entryStart && /\s/.test(ch)) {
      i++;
      continue;
    }

    // Closing the literal.
    if (ch === "}") {
      depth--;
      if (depth === 0) break;
      i++;
      continue;
    }

    // Comma → next entry.
    if (ch === "," && depth === 1) {
      entryStart = true;
      i++;
      continue;
    }

    if (entryStart) {
      // Spread: `...something`.
      if (ch === "." && source[i + 1] === "." && source[i + 2] === ".") {
        keys.push("__spread__");
        i += 3;
        // Skip until top-level comma or closing brace.
        while (i < source.length && depth > 0) {
          const c = source[i];
          if (c === "{" || c === "(" || c === "[") depth++;
          else if (c === "}" || c === ")" || c === "]") {
            if (c === "}" && depth === 1) break;
            depth--;
            if (depth < 1) break;
          } else if (c === "," && depth === 1) break;
          i++;
        }
        entryStart = false;
        continue;
      }

      // Computed key `[expr]: …` — we can't statically resolve, so
      // record a sentinel and let the validator skip it.
      if (ch === "[") {
        keys.push("__computed__");
        let dd = 1;
        i++;
        while (i < source.length && dd > 0) {
          if (source[i] === "[") dd++;
          else if (source[i] === "]") dd--;
          i++;
        }
        // Consume the rest of the entry value.
        consumeEntryValue();
        continue;
      }

      // String key.
      if (ch === '"' || ch === "'" || ch === "`") {
        const q = ch;
        i++;
        let s = "";
        while (i < source.length && source[i] !== q) {
          if (source[i] === "\\" && i + 1 < source.length) {
            s += source[i + 1];
            i += 2;
            continue;
          }
          s += source[i];
          i++;
        }
        i++; // past closing quote
        keys.push(s);
        consumeEntryValue();
        continue;
      }

      // Identifier key (named or shorthand).
      if (/[a-zA-Z_$]/.test(ch)) {
        let n = "";
        while (i < source.length && /[\w$]/.test(source[i])) {
          n += source[i];
          i++;
        }
        // Look ahead to see if this is a key or shorthand.
        let j = i;
        while (j < source.length && /\s/.test(source[j])) j++;
        if (source[j] === ":" || source[j] === "," || source[j] === "}") {
          keys.push(n);
        }
        consumeEntryValue();
        continue;
      }

      // Anything else at entry start — skip to the next comma/brace.
      consumeEntryValue();
      continue;
    }

    // Should not hit here; defensive.
    i++;
  }

  return { keys, endIdx: i };

  // Local helper: consume the value portion of the current entry,
  // stopping at the top-level comma or the closing `}`.
  function consumeEntryValue() {
    let inS = null;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (inS) {
        if (c === "\\" && i + 1 < source.length) {
          i += 2;
          continue;
        }
        if (c === inS) inS = null;
        i++;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inS = c;
        i++;
        continue;
      }
      if (c === "/" && source[i + 1] === "/") {
        while (i < source.length && source[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && source[i + 1] === "*") {
        i += 2;
        while (
          i < source.length - 1 &&
          !(source[i] === "*" && source[i + 1] === "/")
        )
          i++;
        i += 2;
        continue;
      }
      if (c === "{" || c === "(" || c === "[") {
        depth++;
        i++;
        continue;
      }
      if (c === "}" || c === ")" || c === "]") {
        if (c === "}" && depth === 1) {
          // Don't consume; outer loop handles closing brace.
          entryStart = false;
          return;
        }
        depth--;
        i++;
        continue;
      }
      if (c === "," && depth === 1) {
        entryStart = true;
        i++;
        return;
      }
      i++;
    }
    entryStart = false;
  }
}

// Find every Drizzle insert/update call in `source` and return a list
// of { verb, tableVar, keys, callIdx } records. We only resolve table
// vars that are bare identifiers (or `schema.tableVar` member access);
// anything more complex (function call, conditional, etc.) is skipped
// — there's no safe way to statically know which table it points at.
function findDrizzleCalls(source) {
  const out = [];
  // <obj>.insert(<table>).values( …  OR  <obj>.update(<table>).set( …
  // Optional `schema.` prefix on the table arg.
  const callRe =
    /\b[a-zA-Z_$][\w$]*\s*\.\s*(insert|update)\s*\(\s*(?:[a-zA-Z_$][\w$]*\s*\.\s*)?([a-zA-Z_$][\w$]*)\s*\)\s*\.\s*(values|set)\s*\(/g;
  let m;
  while ((m = callRe.exec(source)) !== null) {
    const verb = m[1];
    const tableVar = m[2];
    const tail = m[3];
    if (verb === "insert" && tail !== "values") continue;
    if (verb === "update" && tail !== "set") continue;

    // Position pointer at the first non-whitespace char after `(`.
    let i = callRe.lastIndex;
    while (i < source.length && /\s/.test(source[i])) i++;

    // `.values()` accepts an array of objects too. If we see `[`,
    // walk every top-level object literal inside it and inspect the
    // keys of each — a typo in row #2 of a bulk insert is just as
    // bad as a typo in row #1.
    const objectPositions = [];
    if (source[i] === "[") {
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
        if (ch === "[" || ch === "(") {
          depth++;
          j++;
          continue;
        }
        if (ch === "]" || ch === ")") {
          depth--;
          j++;
          continue;
        }
        if (ch === "{" && depth === 1) {
          objectPositions.push(j);
          // Skip over the object body to avoid re-entering it.
          let bd = 1;
          j++;
          let bs = null;
          while (j < source.length && bd > 0) {
            const c = source[j];
            if (bs) {
              if (c === "\\" && j + 1 < source.length) {
                j += 2;
                continue;
              }
              if (c === bs) bs = null;
              j++;
              continue;
            }
            if (c === '"' || c === "'" || c === "`") {
              bs = c;
              j++;
              continue;
            }
            if (c === "{") bd++;
            else if (c === "}") bd--;
            j++;
          }
          continue;
        }
        j++;
      }
    } else if (source[i] === "{") {
      objectPositions.push(i);
    } else {
      // Variables / spreads / SQL builders — not statically
      // inspectable. Skip safely.
      continue;
    }

    for (const pos of objectPositions) {
      const { keys } = parseObjectLiteralKeys(source, pos);
      out.push({ verb, tableVar, keys, callIdx: m.index });
    }
  }
  return out;
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

function sanitiseTemplate(body) {
  let out = body.replace(/\$\{[^}]*\}/g, " ? ");
  out = out.replace(/'(?:[^'\\]|\\.)*'/g, " ");
  out = out.replace(/--[^\n]*\n/g, "\n");
  out = out.replace(/\/\*[\s\S]*?\*\//g, " ");
  return out;
}

function extractRawQueryBodies(source) {
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

// Find quoted identifiers in a sanitised SQL fragment. Skip `AS "foo"`
// aliases — those are locally defined and unrelated to schema columns.
function findQuotedIdentifiers(sql) {
  const ids = [];
  const re = /"([a-zA-Z_][a-zA-Z0-9_]*)"/g;
  let match;
  while ((match = re.exec(sql)) !== null) {
    const tail = sql.slice(Math.max(0, match.index - 4), match.index);
    if (/\bas\s*$/i.test(tail)) continue;
    ids.push({ name: match[1], offset: match.index });
  }
  return ids;
}

// Find bare (unquoted) identifiers used in the column-list of an
// INSERT statement and in `SET col = …` of an UPDATE statement. These
// are the spots that produced the runtime 500s referenced in the task
// (e.g. `INSERT INTO suppliers (..., category)`), and quoted-only
// detection misses them because lower-case identifiers don't need
// quoting in Postgres.
function findBareInsertUpdateColumns(sql) {
  const found = [];

  // INSERT INTO <table> ( col1, "Col2", col3, ... )
  const insertRe =
    /\bINSERT\s+INTO\s+(?:"?[a-zA-Z_][a-zA-Z0-9_]*"?\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(([^)]*)\)/gi;
  let m;
  while ((m = insertRe.exec(sql)) !== null) {
    const table = m[1];
    const colList = m[2];
    for (const raw of colList.split(",")) {
      const t = raw.trim();
      if (!t) continue;
      // Strip surrounding quotes if any; we only want the bare name.
      const bare = t.match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?$/);
      if (bare) found.push({ name: bare[1], table, kind: "INSERT column" });
    }
  }

  // UPDATE <table> SET col = …, "Other" = …, …
  // Stop at WHERE / RETURNING / end.
  const updateRe =
    /\bUPDATE\s+(?:"?[a-zA-Z_][a-zA-Z0-9_]*"?\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+SET\s+([\s\S]*?)(?=\bWHERE\b|\bRETURNING\b|$)/gi;
  while ((m = updateRe.exec(sql)) !== null) {
    const table = m[1];
    const setBody = m[2];
    // Split assignments on top-level commas. Good-enough heuristic:
    // values were already replaced with " ? " by sanitiseTemplate.
    for (const raw of setBody.split(",")) {
      const t = raw.trim();
      if (!t) continue;
      const eq = t.match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*=/);
      if (eq) found.push({ name: eq[1], table, kind: "UPDATE column" });
    }
  }

  return found;
}

// Find every table identifier referenced by a DML statement —
// `INSERT INTO t`, `UPDATE t`, `DELETE FROM t`, `FROM t`, `JOIN t` —
// in both quoted and unquoted form. This is what catches the
// "table never created" class of bug (e.g. financial_posting_failures
// before migration 119 landed): the table name is bare and lowercase,
// so the quoted-identifier and INSERT-column scanners both miss it.
function findTableReferences(sql) {
  const refs = [];
  // Common Postgres reserved words that can follow FROM/JOIN but are
  // not real tables (subquery starts, lateral derived tables, etc.).
  const NOT_A_TABLE = new Set([
    "select", "lateral", "only", "rows", "values", "unnest",
    "generate_series", "jsonb_array_elements", "jsonb_to_recordset",
    "json_array_elements", "json_to_recordset",
  ]);
  const re =
    /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|FROM|JOIN)\s+(?:ONLY\s+)?(?:"?([a-zA-Z_][a-zA-Z0-9_]*)"?\.)?("?)([a-zA-Z_][a-zA-Z0-9_]*)\3/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const verb = m[1].replace(/\s+/g, " ").toUpperCase();
    const schema = m[2]?.toLowerCase();
    const name = m[4];
    // Skip non-public catalog references (information_schema.*, pg_*).
    if (schema && schema !== "public") continue;
    if (NOT_A_TABLE.has(name.toLowerCase())) continue;
    refs.push({ name, verb });
  }
  return refs;
}

// Some routes create their own auxiliary tables on first use via
// `CREATE TABLE IF NOT EXISTS …` inside a rawQuery template. Any
// identifier defined that way is locally valid even if the table
// hasn't been materialised in the live DB yet, so we treat columns
// (and table names) declared inside such statements as allowed.
function collectLocallyDefinedIdentifiers(bodies) {
  const local = new Set();
  for (const raw of bodies) {
    const cleaned = sanitiseTemplate(raw);

    // CREATE TABLE [IF NOT EXISTS] tbl (col, ...) — adds tbl + cols.
    const createRe =
      /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?[a-zA-Z_][a-zA-Z0-9_]*"?\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(([\s\S]*?)\)\s*(?:;|$)/gi;
    let m;
    while ((m = createRe.exec(cleaned)) !== null) {
      local.add(m[1]);
      const body = m[2];
      for (const line of body.split(",")) {
        const t = line.trim();
        if (!t) continue;
        if (/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i.test(t)) continue;
        const col = t.match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?\b/);
        if (col) local.add(col[1]);
      }
    }

    // Common-Table-Expression names: WITH a AS (...), b AS (...) ...
    // Also handles `WITH RECURSIVE`. Each CTE name is locally defined
    // and must NOT be treated as a missing physical table.
    const cteHeadRe = /\bWITH\s+(?:RECURSIVE\s+)?/gi;
    let head;
    while ((head = cteHeadRe.exec(cleaned)) !== null) {
      // Walk forward, capturing `<name> AS (...)` repeatedly, separated
      // by commas, until we hit a top-level keyword that ends the WITH.
      let i = head.index + head[0].length;
      while (i < cleaned.length) {
        const tail = cleaned.slice(i);
        const nameMatch = tail.match(/^\s*"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*(?:\([^)]*\))?\s*AS\s*(?:NOT\s+MATERIALIZED\s+|MATERIALIZED\s+)?\(/i);
        if (!nameMatch) break;
        local.add(nameMatch[1]);
        // Skip past the matching closing paren (depth-aware).
        let j = i + nameMatch[0].length;
        let depth = 1;
        while (j < cleaned.length && depth > 0) {
          const ch = cleaned[j];
          if (ch === "(") depth++;
          else if (ch === ")") depth--;
          j++;
        }
        // Eat trailing whitespace + optional comma; continue if comma.
        const rest = cleaned.slice(j).match(/^\s*,/);
        if (!rest) break;
        i = j + rest[0].length;
      }
    }

    // Subquery aliases: `FROM (...) AS alias` / `JOIN (...) alias`.
    const subqAliasRe =
      /\)\s+(?:AS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?(?=\s|,|$)/gi;
    while ((m = subqAliasRe.exec(cleaned)) !== null) {
      // Heuristic: only treat as alias if a `(` precedes within the
      // same statement scope. We don't track that strictly; the cost of
      // over-allowing a name is just "skip drift check for it", which
      // is the safe direction for this guard.
      local.add(m[1]);
    }
  }
  return local;
}

async function main() {
  const { columns, tables, tableColumns } = loadLiveSchema();
  const drizzleSchema = await loadDrizzleSchema(DRIZZLE_SCHEMA_FILE);
  if (columns.size === 0) {
    console.error(
      "[check:schema-drift] ERROR — no columns returned from information_schema. " +
        "Is DATABASE_URL pointing at an empty database?",
    );
    process.exit(2);
  }

  // SQL keywords that legitimately appear where bare identifiers might
  // be parsed (DEFAULT in INSERT lists, etc.).
  const SQL_KEYWORDS = new Set([
    "default", "null", "true", "false", "current_timestamp", "now",
  ]);

  const allowed = new Set([...columns, ...tables, ...BUILTIN_IDENTIFIERS]);

  const srcFiles = await walk(ROUTES_DIR);
  const findings = [];
  let drizzleCallCount = 0;

  for (const file of srcFiles) {
    const source = await readFile(file, "utf8");
    const rel = relative(REPO_ROOT, file);

    // ── Drizzle .insert(...).values({...}) / .update(...).set({...}) ──
    // Run on every file (not gated on `rawQuery`) so once routes start
    // adopting the typed builder we catch drift immediately.
    const drizzleCalls = findDrizzleCalls(source);
    for (const { verb, tableVar, keys } of drizzleCalls) {
      drizzleCallCount++;
      const tbl = drizzleSchema.get(tableVar);
      if (!tbl) {
        // Unknown alias (could be from a different schema file or a
        // local var). Skip — over-allowing is the safe direction.
        continue;
      }
      const liveCols = tableColumns.get(tbl.tableName);
      for (const key of keys) {
        if (DRIZZLE_KEY_ALLOWLIST.has(key)) continue;
        if (key === "__computed__") continue; // can't statically resolve
        // 1. Key must exist in the Drizzle schema for this table.
        const sqlCol = tbl.columns.get(key);
        if (!sqlCol) {
          findings.push({
            file: rel,
            id: key,
            table: tbl.tableName,
            kind: `Drizzle ${verb} key (not in lib/db schema)`,
            snippet: `${verb}(${tableVar}).${verb === "insert" ? "values" : "set"}({ … ${key}: … })`,
          });
          continue;
        }
        // 2. The Drizzle-declared SQL column must exist in live DB.
        if (!liveCols || !liveCols.has(sqlCol)) {
          findings.push({
            file: rel,
            id: sqlCol,
            table: tbl.tableName,
            kind: `Drizzle ${verb} column (missing from live DB)`,
            snippet: `${verb}(${tableVar}).${verb === "insert" ? "values" : "set"}({ … ${key}: … })  →  "${sqlCol}"`,
          });
        }
      }
    }

    if (!source.includes("rawQuery")) continue;
    const bodies = extractRawQueryBodies(source);
    if (bodies.length === 0) continue;

    const local = collectLocallyDefinedIdentifiers(bodies);
    for (const raw of bodies) {
      const cleaned = sanitiseTemplate(raw);

      // 1. Quoted "Identifier" tokens (camelCase columns, table names).
      for (const { name } of findQuotedIdentifiers(cleaned)) {
        if (allowed.has(name) || local.has(name)) continue;
        findings.push({
          file: rel,
          id: name,
          kind: "quoted identifier",
          snippet: cleaned.slice(0, 140).replace(/\s+/g, " ").trim(),
        });
      }

      // 2. Bare INSERT/UPDATE column lists (lower_snake or simple names).
      for (const { name, table, kind } of findBareInsertUpdateColumns(cleaned)) {
        const lc = name.toLowerCase();
        if (SQL_KEYWORDS.has(lc)) continue;
        if (allowed.has(name) || local.has(name)) continue;
        // The identifier may already be allowlisted only as its quoted
        // camelCase form; bare lookup is exact-case in our set.
        findings.push({
          file: rel,
          id: name,
          table,
          kind,
          snippet: cleaned.slice(0, 140).replace(/\s+/g, " ").trim(),
        });
      }

      // 3. Table identifiers in INSERT INTO / UPDATE / DELETE FROM /
      //    FROM / JOIN. This is the bug class that motivated the task
      //    when the table itself is missing from the live DB
      //    (e.g. financial_posting_failures before migration 119).
      for (const { name, verb } of findTableReferences(cleaned)) {
        if (tables.has(name) || local.has(name)) continue;
        // Tables are also added to `allowed`, but check explicitly so
        // a column named `users` doesn't accidentally satisfy a
        // table reference. (Both sets overlap heavily, so this is
        // belt-and-braces.)
        findings.push({
          file: rel,
          id: name,
          kind: `${verb} table`,
          snippet: cleaned.slice(0, 140).replace(/\s+/g, " ").trim(),
        });
      }
    }
  }

  console.log(
    `[check:schema-drift] scanned ${srcFiles.length} route file(s) · ` +
      `live schema has ${columns.size} columns across ${tables.size} tables · ` +
      `Drizzle schema knows ${drizzleSchema.size} table(s) · ` +
      `${drizzleCallCount} Drizzle insert/update call(s) inspected.`,
  );

  if (findings.length === 0) {
    console.log(
      "[check:schema-drift] OK — every identifier in raw SQL and every Drizzle " +
        ".values()/.set() key exists in the live database.",
    );
    process.exit(0);
  }

  // Collapse duplicates per (file, id, table?).
  const seen = new Set();
  const unique = [];
  for (const f of findings) {
    const key = `${f.file}::${f.id}::${f.table ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(f);
  }

  console.error(
    `[check:schema-drift] FAIL — ${unique.length} identifier(s) referenced in route ` +
      "code (raw SQL or Drizzle .values()/.set()) but missing from the live database:\n",
  );
  for (const f of unique) {
    const where = f.table ? ` (${f.kind} on "${f.table}")` : ` (${f.kind})`;
    console.error(`  ${f.file}  →  ${f.id}${where}`);
  }
  console.error(
    "\nEach identifier above is referenced in route code but does not exist in\n" +
      "information_schema (or, for Drizzle keys, is not declared on that table\n" +
      "in lib/db/src/schema/index.ts). Options:\n" +
      "  1. Add a migration in artifacts/api-server/src/migrations/ to create the\n" +
      "     missing column or table, then restart the api-server (it auto-applies\n" +
      "     migrations on boot).\n" +
      "  2. For Drizzle drift, also add the column to lib/db/src/schema/index.ts\n" +
      "     so the typed builder agrees with the live DB.\n" +
      "  3. Refresh db/schema.sql via `pnpm db:dump-schema` after the migration runs.\n" +
      "  4. If it is a typo, fix the route code.\n",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[check:schema-drift] crashed:", err);
  process.exit(2);
});
