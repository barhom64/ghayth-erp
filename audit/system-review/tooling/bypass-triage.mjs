#!/usr/bin/env node
// bypass-triage.mjs — Issue #664 triage tool. Read-only.
//
// Classifies the 111 direct `UPDATE … SET status = …` bypasses found
// by workflow-audit.mjs into the three buckets the owner specified:
//
//   intentional  — bulk system operations whose semantics genuinely
//                  don't fit applyTransition's per-row contract (period
//                  close, batch reconciliation, idempotent sweeps).
//                  Fix path: keep the SQL, add an inline `// bypass-ok`
//                  comment explaining why, or wrap in a per-row loop +
//                  applyTransition if the operator wants symmetry.
//
//   legacy       — older code that flips status outside the engine but
//                  doesn't break invariants. Skips audit / event /
//                  lifecycle hooks but the data model is consistent.
//                  Fix path: migrate to applyTransition at convenience
//                  (e.g. when touching the file for another reason).
//
//   dangerous    — entity IS in STATE_MACHINES, the flip changes a
//                  workflow status, and audit/event are also skipped.
//                  These are exactly the "spaghetti drift" instances
//                  the hardening plan targets. Each one a candidate
//                  for a future cluster-by-cluster PR.
//
// Signals used to classify (regex over the snippet + cross-reference):
//   - Table name (extracted from `UPDATE <table>`)
//   - Is the table in STATE_MACHINES?  (lifecycleEngine.ts grep)
//   - Bulk markers: `WHERE … IN (…)`, `WHERE … BETWEEN`, multi-row
//     conditions without `id = $`
//   - Status column: `status` vs `approvalStatus` vs cache-like
//     (`pbx_calls.status`, derived booleans)
//   - File hints: routes that handle CRON / batch processes
//
// Output: docs/audit/BYPASS_TRIAGE.md (per-hit table) + summary
// histogram printed to stdout.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const WORKFLOW_JSON = join(__dirname, "_workflow-audit.json");
const LIFECYCLE_FILE = join(REPO, "artifacts/api-server/src/lib/lifecycleEngine.ts");
const OUT_MD = join(REPO, "docs/audit/BYPASS_TRIAGE.md");
const OUT_JSON = join(__dirname, "_bypass-triage.json");

const wf = JSON.parse(readFileSync(WORKFLOW_JSON, "utf8"));
const lifecycleSrc = readFileSync(LIFECYCLE_FILE, "utf8");
const stateMachineEntities = new Set();
{
  const re = /entity:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(lifecycleSrc)) !== null) {
    // Filter to actual STATE_MACHINES entries (those that have a
    // transitions: { … } block nearby). This matches workflow-audit's
    // own parser.
    const window = lifecycleSrc.slice(m.index, m.index + 600);
    if (/transitions:\s*\{/.test(window)) stateMachineEntities.add(m[1]);
  }
}

// Files we KNOW are cron/batch/sweep operations (legitimate bulk).
// Treated as a strong "intentional" signal.
const CRON_OR_BULK_FILES = new Set([
  "finance-zatca.ts",          // ZATCA batch submission
  "finance-algorithms.ts",     // batch reconciliation + depreciation
  "communications.ts",         // pbx_calls status = system signal
  "gov-integrations.ts",       // external-system sync
  "obligations.ts",            // recurring obligations engine
]);

// Tables that are NOT lifecycle entities. Their `status` is a flag
// (delivered/sent/active/seen), not a workflow state.
const NON_LIFECYCLE_TABLES = new Set([
  "pbx_calls",                 // call state — system signal
  "bank_statements",           // reconciliation tracking
  "settings",                  // toggle flags
  "audit_violations",          // sub-status closure
  "documents",                 // active/archived
  "correspondence",            // delivery status
  "gov_integration_links",     // sync state
  "session",                   // session tracking
]);

function extractTable(snippet) {
  const m = snippet.match(/UPDATE\s+(\w+)/i);
  return m ? m[1] : null;
}

function classify(hit) {
  const file = hit.file.replace(/^artifacts\/api-server\/src\/routes\//, "");
  const table = extractTable(hit.snippet);
  const isLifecycleEntity = table && stateMachineEntities.has(table);
  const isCronOrBulkFile = CRON_OR_BULK_FILES.has(file);
  const isNonLifecycleTable = table && NON_LIFECYCLE_TABLES.has(table);

  // Bulk markers in the snippet
  const looksBulk = /WHERE[^=]+IN\s*\(|WHERE[^=]+BETWEEN|WHERE\s+\w+\s*=\s*[^$]/i.test(hit.snippet);
  // Mass updates without an `id = $N` predicate are almost always bulk.
  const hasIdPredicate = /\bid\s*=\s*\$/i.test(hit.snippet);

  let bucket, rationale;
  if (isNonLifecycleTable) {
    bucket = "intentional";
    rationale = `${table} is a system-signal table (not a workflow entity); status is a flag, not a state`;
  } else if (isCronOrBulkFile && (looksBulk || !hasIdPredicate)) {
    bucket = "intentional";
    rationale = `bulk operation in ${file} (cron/batch context); per-row applyTransition would be slower with no semantic benefit`;
  } else if (isLifecycleEntity) {
    bucket = "dangerous";
    rationale = `${table} IS in STATE_MACHINES — direct UPDATE skips engine validation, audit log, AND event emission`;
  } else if (looksBulk || !hasIdPredicate) {
    bucket = "intentional";
    rationale = `bulk update without single-row predicate; treat as documented batch operation`;
  } else {
    bucket = "legacy";
    rationale = `single-row status flip outside the engine; doesn't break invariants but skips audit/event`;
  }

  return { ...hit, file, table, isLifecycleEntity, bucket, rationale };
}

const classified = wf.findings.directStatusUpdate.map(classify);

// Summary
const buckets = { intentional: 0, legacy: 0, dangerous: 0 };
const byFile = {};
const byTable = {};
for (const c of classified) {
  buckets[c.bucket]++;
  byFile[c.file] = byFile[c.file] || { intentional: 0, legacy: 0, dangerous: 0, total: 0 };
  byFile[c.file][c.bucket]++;
  byFile[c.file].total++;
  if (c.table) {
    byTable[c.table] = byTable[c.table] || { intentional: 0, legacy: 0, dangerous: 0, total: 0 };
    byTable[c.table][c.bucket]++;
    byTable[c.table].total++;
  }
}

// ─── Render MD ────────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);
const md = [];
md.push(`# Issue #664 Triage — Direct UPDATE Bypass Classification`);
md.push("");
md.push(`Generated: ${today}`);
md.push("");
md.push(`> **Read-only.** Regenerate with`);
md.push(`> \`node audit/system-review/tooling/bypass-triage.mjs\`. Classifies`);
md.push(`> the **${classified.length} direct UPDATE bypasses** found by`);
md.push(`> workflow-audit into the three buckets the owner specified.`);
md.push("");
md.push(`## Classification rules`);
md.push("");
md.push(`| Bucket | Signal | Fix path |`);
md.push(`|---|---|---|`);
md.push(`| **intentional** | bulk operation OR system-signal table (\`pbx_calls\`, \`bank_statements\`, etc.) | keep SQL + add \`// bypass-ok\` comment with rationale |`);
md.push(`| **legacy** | single-row status flip on a non-lifecycle entity | migrate to applyTransition when touching the file for another reason |`);
md.push(`| **dangerous** | entity IS in \`STATE_MACHINES\` AND the flip skips engine/audit/event | candidate for cluster-by-cluster fix PR |`);
md.push("");
md.push(`## Headline`);
md.push("");
md.push(`| Bucket | Count | % |`);
md.push(`|---|---:|---:|`);
for (const k of ["intentional", "legacy", "dangerous"]) {
  const pct = ((buckets[k] / classified.length) * 100).toFixed(0);
  md.push(`| ${k} | **${buckets[k]}** | ${pct}% |`);
}
md.push(`| TOTAL | ${classified.length} | 100% |`);
md.push("");

md.push(`## Per-file breakdown`);
md.push("");
md.push(`| File | Total | 🔴 dangerous | 🟡 legacy | 🟢 intentional |`);
md.push(`|---|---:|---:|---:|---:|`);
for (const [f, b] of Object.entries(byFile).sort((a, b) => b[1].dangerous - a[1].dangerous || b[1].total - a[1].total)) {
  md.push(`| \`${f}\` | ${b.total} | **${b.dangerous}** | ${b.legacy} | ${b.intentional} |`);
}
md.push("");

md.push(`## Per-table breakdown (status column)`);
md.push("");
md.push(`| Table | In \`STATE_MACHINES\`? | Total | dangerous | legacy | intentional |`);
md.push(`|---|---|---:|---:|---:|---:|`);
for (const [t, b] of Object.entries(byTable).sort((a, b) => b[1].dangerous - a[1].dangerous || b[1].total - a[1].total)) {
  const reg = stateMachineEntities.has(t) ? "✅ YES" : "—";
  md.push(`| \`${t}\` | ${reg} | ${b.total} | **${b.dangerous}** | ${b.legacy} | ${b.intentional} |`);
}
md.push("");

md.push(`## Dangerous hits (priority queue for cluster-by-cluster fixes)`);
md.push("");
const dangerous = classified.filter((c) => c.bucket === "dangerous");
if (dangerous.length === 0) {
  md.push(`_None — every direct UPDATE bypasses a non-lifecycle entity or runs in a cron/bulk context._`);
} else {
  md.push(`Each one is a candidate fix: migrate to \`applyTransition\` (same pattern as #672 / #677 / #679). Cluster suggestion: group by file.`);
  md.push("");
  md.push(`| File | Line | Table | Snippet (truncated) |`);
  md.push(`|---|---:|---|---|`);
  for (const c of dangerous) {
    const snip = c.snippet.length > 100 ? c.snippet.slice(0, 100) + "…" : c.snippet;
    md.push(`| \`${c.file}\` | ${c.line} | \`${c.table}\` | \`${snip}\` |`);
  }
}
md.push("");

md.push(`## Intentional hits (require a \`// bypass-ok\` comment per the engineering rule)`);
md.push("");
const intentional = classified.filter((c) => c.bucket === "intentional");
md.push(`**${intentional.length}** intentional bypasses. Recommended action: in a low-priority PR, prepend each with a one-line comment so future audits skip it without re-classifying.`);
md.push("");
md.push(`Sample (top 10):`);
md.push("");
md.push(`| File | Line | Table | Rationale |`);
md.push(`|---|---:|---|---|`);
for (const c of intentional.slice(0, 10)) {
  md.push(`| \`${c.file}\` | ${c.line} | \`${c.table || "?"}\` | ${c.rationale} |`);
}
md.push(`| _…${intentional.length - 10} more in JSON sidecar_ |  |  |  |`);
md.push("");

md.push(`## Legacy hits (migrate at convenience)`);
md.push("");
const legacy = classified.filter((c) => c.bucket === "legacy");
md.push(`**${legacy.length}** legacy bypasses. These work today; migrate to \`applyTransition\` only when you're already editing the file for another reason — don't open dedicated PRs.`);
md.push("");
if (legacy.length > 0) {
  md.push(`| File | Line | Table |`);
  md.push(`|---|---:|---|`);
  for (const c of legacy) {
    md.push(`| \`${c.file}\` | ${c.line} | \`${c.table || "?"}\` |`);
  }
  md.push("");
}

md.push(`## Reproducing this triage`);
md.push("");
md.push(`\`\`\`bash`);
md.push(`node audit/system-review/tooling/workflow-audit.mjs  # refresh the source data`);
md.push(`node audit/system-review/tooling/bypass-triage.mjs   # classify`);
md.push(`\`\`\``);
md.push("");
md.push(`Heuristic limitations: this is **best-effort static classification**. The `);
md.push(`per-table and per-file lists are deterministic; the per-hit bucket may`);
md.push(`be wrong for edge cases (e.g. a bulk operation in a non-cron file).`);
md.push(`Each "dangerous" hit should still be reviewed before opening a fix PR.`);
md.push("");

if (!existsSync(dirname(OUT_MD))) mkdirSync(dirname(OUT_MD), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify({
  totalHits: classified.length,
  buckets,
  byFile,
  byTable,
  classified,
}, null, 2));
writeFileSync(OUT_MD, md.join("\n"));

console.log(`bypass-triage:`);
console.log(`  total hits         : ${classified.length}`);
console.log(`  intentional        : ${buckets.intentional}  (${((buckets.intentional / classified.length) * 100).toFixed(0)}%)`);
console.log(`  legacy             : ${buckets.legacy}  (${((buckets.legacy / classified.length) * 100).toFixed(0)}%)`);
console.log(`  dangerous          : ${buckets.dangerous}  (${((buckets.dangerous / classified.length) * 100).toFixed(0)}%)`);
console.log(`  files affected     : ${Object.keys(byFile).length}`);
console.log(`  tables affected    : ${Object.keys(byTable).length}`);
console.log(`→ ${OUT_JSON}`);
console.log(`→ ${OUT_MD}`);
