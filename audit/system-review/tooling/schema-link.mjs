#!/usr/bin/env node
// schema-link.mjs — Read-only.
// Scans lib/db/src/schema/index.ts to enumerate every pgTable and report:
//   - tenantId/companyId/assignmentId
//   - createdBy / updatedBy / createdAt / updatedAt
//   - deletedAt (soft delete)
//   - FK references
//   - lifecycle column (status / state)
//
// Output: tooling/_schema-by-entity.json

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const SCHEMA = join(REPO, "lib/db/src/schema/index.ts");

const src = readFileSync(SCHEMA, "utf8");

// Manual brace-aware extraction. The previous non-greedy regex stopped at the
// first inner `}` it saw (e.g. inside `numeric("x", { precision: 14 })`),
// truncating the body and losing columns like createdAt that came after.
//
// Algorithm: locate `pgTable("name", {`, then walk forward counting `{`/`}`
// (with string/comment awareness) until depth returns to zero.
const headerRe = /export\s+const\s+(\w+)\s*=\s*pgTable\(\s*["']([^"']+)["']\s*,\s*\{/g;
function extractBody(start) {
  let depth = 1;
  let i = start;
  let inStr = null;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    const prev = src[i - 1];
    if (inStr) {
      if (ch === inStr && prev !== "\\") inStr = null;
    } else {
      if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    i++;
  }
  return src.slice(start, i - 1);
}

const out = {};
let m;
while ((m = headerRe.exec(src))) {
  const exportName = m[1];
  const tableName = m[2];
  const body = extractBody(headerRe.lastIndex);

  const cols = [];
  for (const cm of body.matchAll(/(\w+):\s*([\w]+)\(["']?([^"',\)]*)["']?/g)) {
    cols.push({ name: cm[1], type: cm[2] });
  }

  const has = (name) => cols.some((c) => c.name === name);

  out[tableName] = {
    exportName,
    tableName,
    columnCount: cols.length,
    columns: cols.map((c) => c.name),
    audit: {
      tenant: has("tenantId") || has("companyId") || has("assignmentId"),
      createdBy: has("createdBy"),
      updatedBy: has("updatedBy"),
      createdAt: has("createdAt"),
      updatedAt: has("updatedAt"),
      softDelete: has("deletedAt"),
      lifecycle: has("status") || has("state") || has("phase"),
    },
    // FK refs (rough): look for `references(()=> X.id)`
    fks: [...body.matchAll(/references\(\s*\(\)\s*=>\s*(\w+)\.(\w+)\s*\)/g)].map(
      (r) => ({ to: r[1], col: r[2] })
    ),
  };
}

writeFileSync(join(__dirname, "_schema-by-entity.json"), JSON.stringify(out, null, 2));

const tables = Object.values(out);
console.log(`schema-link: ${tables.length} tables in lib/db/src/schema/index.ts`);
const stat = (k) => tables.filter((t) => t.audit[k]).length;
console.log(`  with tenant col      : ${stat("tenant")}/${tables.length}`);
console.log(`  with createdBy       : ${stat("createdBy")}/${tables.length}`);
console.log(`  with createdAt       : ${stat("createdAt")}/${tables.length}`);
console.log(`  with updatedAt       : ${stat("updatedAt")}/${tables.length}`);
console.log(`  with softDelete      : ${stat("softDelete")}/${tables.length}`);
console.log(`  with lifecycle col   : ${stat("lifecycle")}/${tables.length}`);

const missingAudit = tables.filter(
  (t) => !t.audit.createdAt || !t.audit.tenant
);
if (missingAudit.length) {
  console.log(`\n⚠ ${missingAudit.length} tables missing tenant or createdAt:`);
  for (const t of missingAudit.slice(0, 20)) {
    console.log(`  ${t.tableName}: tenant=${t.audit.tenant} createdAt=${t.audit.createdAt}`);
  }
}
