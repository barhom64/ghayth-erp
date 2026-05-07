//
// scripts/src/lib/drizzle-schema.mjs
//
// Shared parser for `lib/db/src/schema/index.ts`. Both
// `check-schema-drift.mjs` and `check-ghost-rows.mjs` need to resolve a
// Drizzle table-var (e.g. `employees`) → its SQL table name and column
// map so they can validate Drizzle calls against the live schema. This
// module is the single source of truth for that mapping.
//
// We do NOT use the TS compiler — a small regex + brace walker is
// enough for the well-formed `pgTable("name", { key: type("col", …),
// … })` shape used in lib/db/src/schema. If the file ever shifts to a
// shape this can't parse, callers safely degrade (skip that table —
// references to it just don't get checked).
//

import { readFile } from "node:fs/promises";

// Split a JS source fragment on `sep` at depth 0, respecting parens,
// braces, brackets, and string literals. Used by the Drizzle schema
// parser (top-level column entries) and the call scanners (top-level
// keys inside `.values({…})`).
export function splitTopLevel(input, sep) {
  const out = [];
  let curr = "";
  let depth = 0;
  let inStr = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inStr) {
      curr += ch;
      if (ch === "\\" && i + 1 < input.length) {
        curr += input[i + 1];
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
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    if (ch === sep && depth === 0) {
      out.push(curr);
      curr = "";
      continue;
    }
    curr += ch;
  }
  if (curr.trim() !== "" || out.length > 0) out.push(curr);
  return out;
}

// Parse the Drizzle schema file at `schemaFilePath` and return a map:
//   varName → { tableName, columns: Map<jsKey, sqlColumnName> }
//
// Returns an empty Map if the file is missing or unreadable.
export async function loadDrizzleSchema(schemaFilePath) {
  let src;
  try {
    src = await readFile(schemaFilePath, "utf8");
  } catch {
    return new Map();
  }

  const tables = new Map();
  const headRe =
    /export\s+const\s+([a-zA-Z_$][\w$]*)\s*=\s*pgTable\s*\(\s*"([^"]+)"\s*,\s*\{/g;
  let m;
  while ((m = headRe.exec(src)) !== null) {
    const varName = m[1];
    const tableName = m[2];

    // Walk the column object body, depth-aware, until matching `}`.
    let i = m.index + m[0].length;
    let depth = 1;
    let body = "";
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) break;
      }
      body += ch;
      i++;
    }

    // Split body on top-level commas so multi-line `key: type("col",
    // { precision, scale }).default(…)` entries stay intact.
    const parts = splitTopLevel(body, ",");
    const cols = new Map();
    for (const part of parts) {
      const km = part.match(
        /^\s*([a-zA-Z_$][\w$]*)\s*:\s*[a-zA-Z_$][\w$]*\s*\(\s*"([^"]+)"/,
      );
      if (km) cols.set(km[1], km[2]);
    }
    tables.set(varName, { tableName, columns: cols });
  }
  return tables;
}
