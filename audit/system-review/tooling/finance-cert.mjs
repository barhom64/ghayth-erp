#!/usr/bin/env node
// finance-cert.mjs — Static Finance module certification audit.
//
// Phase 1 of the architectural hardening plan: produce a verifiable
// PASS / PARTIAL / FAIL matrix for every Finance route file across the
// dimensions that can be checked WITHOUT a running database. Live
// dimensions (concurrency, large datasets, real GL postings) are
// deliberately out of scope; this audit is the static contract floor.
//
// Dimensions emitted per route file
//   1. RBAC      — every router.{get,post,patch,delete}() handler is
//                  authorize()-guarded as its second middleware arg.
//   2. Scope     — list endpoints use parseScopeFilters +
//                  buildScopedWhere; raw `WHERE "companyId" = $1` only
//                  is a partial fail (no branch-scope cascade).
//   3. Audit     — every write endpoint (POST/PATCH/DELETE) calls
//                  createAuditLog at least once.
//   4. Events    — every write endpoint calls emitEvent /
//                  safeEmitEvent at least once.
//   5. Lifecycle — status-flipping endpoints route through
//                  applyTransition. Pulled from the workflow audit's
//                  direct-UPDATE bypass set (filtered to finance-*.ts).
//   6. GL bridge — endpoints that mutate financial state reference a
//                  journal-posting helper (postJournalEntry, postGl,
//                  finance-gl-helpers, finance-algorithms).
//
// Out of scope
//   - Concurrency / locking correctness     (needs runtime)
//   - Large-dataset performance             (needs runtime)
//   - Real GL posting correctness end-to-end (needs DB + period state)
//   - Multi-tenant isolation runtime check  (needs two tenants)
//   These belong in Phase 5; the matrix here makes the static contract
//   visible so runtime certification has a stable floor to stand on.
//
// Output
//   audit/system-review/tooling/_finance-cert.json   (machine-readable)
//   docs/audit/FINANCE_CERTIFICATION.md              (human-readable)

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const ROUTES_DIR = join(REPO, "artifacts/api-server/src/routes");
const WORKFLOW_AUDIT_JSON = join(__dirname, "_workflow-audit.json");
const OUT_JSON = join(__dirname, "_finance-cert.json");
const OUT_MD = join(REPO, "docs/audit/FINANCE_CERTIFICATION.md");

// ─── Helpers ──────────────────────────────────────────────────────────

function listFinanceFiles() {
  return readdirSync(ROUTES_DIR).filter((f) => /^finance(-|\.ts)/.test(f));
}

// Find every router.METHOD("path", ...) call. We need the method, path,
// and the surrounding body (up to the next `router.METHOD(` or EOF) so
// we can scan it for authorize/createAuditLog/emitEvent/applyTransition.
function extractEndpoints(src) {
  const endpoints = [];
  // Capture every router/<varname>Router.METHOD(...) handler.
  const re = /(\w+Router|router)\.(get|post|patch|put|delete)\(\s*([`"'])([^`"']+)\3/g;
  let m;
  const positions = [];
  while ((m = re.exec(src)) !== null) {
    positions.push({ idx: m.index, method: m[2].toUpperCase(), path: m[4] });
  }
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].idx;
    const end = positions[i + 1] ? positions[i + 1].idx : src.length;
    const body = src.slice(start, end);
    const line = src.slice(0, start).split(/\r?\n/).length;
    endpoints.push({
      method: positions[i].method,
      path: positions[i].path,
      line,
      body,
    });
  }
  return endpoints;
}

function classify(endpoint, file) {
  const w = endpoint.method !== "GET";
  const body = endpoint.body;
  const checks = {
    rbac: /authorize\(\{[^)]*feature\s*:/.test(body),
    scopeParseFilters: /parseScopeFilters\(req\)/.test(body),
    scopeBuildWhere: /buildScopedWhere\(/.test(body),
    scopeManualCompany: /"companyId"\s*=\s*\$\d/.test(body) || /scope\.companyId/.test(body),
    // `recordSideEffects(...)` is the gl-helpers internal wrapper that
    // calls createAuditLog + emitEvent in a single line — count it as
    // evidence of audit/event coverage so we don't false-positive every
    // endpoint that uses it. Mirrors how `applyTransition` is treated.
    audit: /createAuditLog\(/.test(body) || /recordSideEffects\(/.test(body),
    event: /(emitEvent|safeEmitEvent)\(/.test(body) || /recordSideEffects\(/.test(body),
    applyTransition: /applyTransition\(\{/.test(body),
    directStatusUpdate: /UPDATE\s+\w+[\s\S]{0,160}\bSET\b[\s\S]{0,160}(?:"?status"?|"?approvalStatus"?)\s*=/i.test(body)
      && !/applyTransition/.test(body),
    glPosting: /(postInventoryMovementGl|postJournalEntry|finance-gl-helpers|finance-algorithms|postExpenseGl|postPaymentGl|postInvoiceGl|postPurchaseGl|gl_lines|journal_entries)/i.test(body),
  };
  const isList = endpoint.method === "GET" && !/\/:\w+$/.test(endpoint.path);
  const isDetail = endpoint.method === "GET" && /\/:\w+$/.test(endpoint.path);
  const isWrite = endpoint.method !== "GET";
  // RBAC: PASS if authorize present.
  let rbac = checks.rbac ? "PASS" : "FAIL";
  // Scope: PASS for list endpoints if buildScopedWhere; PARTIAL if only
  // manual companyId scoping; FAIL otherwise. Detail/write endpoints
  // are OK as long as they reference scope.companyId in the WHERE.
  let scope;
  if (isList) {
    scope = checks.scopeParseFilters && checks.scopeBuildWhere ? "PASS"
      : checks.scopeManualCompany ? "PARTIAL"
      : "FAIL";
  } else {
    scope = checks.scopeManualCompany ? "PASS" : "FAIL";
  }
  // Audit: PASS if write endpoint calls createAuditLog (or routes through
  // applyTransition which emits audit internally). SKIP for read.
  let audit;
  if (isWrite) {
    audit = checks.audit || checks.applyTransition ? "PASS" : "FAIL";
  } else {
    audit = "SKIP";
  }
  // Events: same logic.
  let event;
  if (isWrite) {
    event = checks.event || checks.applyTransition ? "PASS" : "FAIL";
  } else {
    event = "SKIP";
  }
  // Lifecycle: only meaningful when the endpoint flips a status. If it
  // does and applyTransition is present → PASS. If it flips status with
  // a direct UPDATE → FAIL. Otherwise SKIP.
  let lifecycle;
  if (checks.applyTransition) lifecycle = "PASS";
  else if (checks.directStatusUpdate) lifecycle = "FAIL";
  else lifecycle = "SKIP";
  // GL bridge: emit PASS if the write endpoint references journal /
  // posting helpers; SKIP for read; PARTIAL for write endpoints whose
  // domain is GL-relevant but no posting is referenced.
  // We heuristically tag GL-relevant write endpoints by file:
  //   finance-invoices, finance-journal, finance-purchase,
  //   finance-custodies, finance-zatca, finance-collection
  const glRelevantFiles = new Set([
    "finance-invoices.ts",
    "finance-journal.ts",
    "finance-purchase.ts",
    "finance-custodies.ts",
    "finance-collection.ts",
  ]);
  let glBridge;
  if (!isWrite) glBridge = "SKIP";
  else if (checks.glPosting) glBridge = "PASS";
  else if (glRelevantFiles.has(file)) glBridge = "PARTIAL";
  else glBridge = "SKIP";

  return { checks, dims: { rbac, scope, audit, event, lifecycle, glBridge } };
}

// ─── Main ─────────────────────────────────────────────────────────────

function main() {
  const files = listFinanceFiles();
  const workflowAudit = existsSync(WORKFLOW_AUDIT_JSON)
    ? JSON.parse(readFileSync(WORKFLOW_AUDIT_JSON, "utf8"))
    : null;

  const results = [];
  for (const f of files) {
    const full = join(ROUTES_DIR, f);
    const src = readFileSync(full, "utf8");
    const endpoints = extractEndpoints(src);
    const classified = endpoints.map((e) => ({
      ...e,
      ...classify(e, f),
    }));
    // Strip the per-endpoint body from the JSON to keep it readable.
    const slim = classified.map((c) => ({
      method: c.method,
      path: c.path,
      line: c.line,
      checks: c.checks,
      dims: c.dims,
    }));
    // Per-file aggregate: a dim is PASS only if every endpoint with a
    // non-SKIP verdict for that dim is PASS. Otherwise PARTIAL if any
    // PASS exists, FAIL if all relevant are FAIL.
    const dimAgg = {};
    for (const dimName of ["rbac", "scope", "audit", "event", "lifecycle", "glBridge"]) {
      const verdicts = slim.map((s) => s.dims[dimName]).filter((v) => v !== "SKIP");
      if (verdicts.length === 0) dimAgg[dimName] = "SKIP";
      else if (verdicts.every((v) => v === "PASS")) dimAgg[dimName] = "PASS";
      else if (verdicts.every((v) => v === "FAIL")) dimAgg[dimName] = "FAIL";
      else dimAgg[dimName] = "PARTIAL";
    }
    results.push({
      file: `artifacts/api-server/src/routes/${f}`,
      endpointCount: endpoints.length,
      writeEndpoints: classified.filter((c) => c.method !== "GET").length,
      dimAgg,
      endpoints: slim,
    });
  }

  // Cross-reference workflow audit for finance files
  const wfFindings = workflowAudit
    ? {
        directStatusUpdate: workflowAudit.findings.directStatusUpdate.filter(
          (h) => /\/finance-/.test(h.file)
        ),
        fromStateMismatch: workflowAudit.findings.fromStateGraphMismatch.filter(
          (h) => /\/finance-/.test(h.file)
        ),
      }
    : null;

  // ─── Render markdown ────────────────────────────────────────────────

  const today = new Date().toISOString().slice(0, 10);
  const md = [];
  md.push(`# Finance Module Static Certification`);
  md.push("");
  md.push(`Generated: ${today}`);
  md.push("");
  md.push(`> **Read-only.** Regenerate with`);
  md.push(`> \`node audit/system-review/tooling/finance-cert.mjs\`. Each cell`);
  md.push(`> here is one of \`PASS\` / \`PARTIAL\` / \`FAIL\` / \`SKIP\`;`);
  md.push(`> non-PASS cells should turn into an issue or a small PR.`);
  md.push("");
  md.push(`## Scope`);
  md.push("");
  md.push(`Files audited: **${files.length}** under \`artifacts/api-server/src/routes/finance-*.ts\`.`);
  md.push(`Endpoints: **${results.reduce((s, r) => s + r.endpointCount, 0)}** total, **${results.reduce((s, r) => s + r.writeEndpoints, 0)}** writes.`);
  md.push("");
  md.push(`## Dimensions evaluated`);
  md.push("");
  md.push(`| # | Dimension | Static check |`);
  md.push(`|---|---|---|`);
  md.push(`| 1 | RBAC          | every handler is wrapped by \`authorize({ feature, action })\` |`);
  md.push(`| 2 | Scope         | list endpoints use \`parseScopeFilters\` + \`buildScopedWhere\` ; detail/write reference \`scope.companyId\` |`);
  md.push(`| 3 | Audit         | every write endpoint calls \`createAuditLog\` (or routes via \`applyTransition\` which emits audit internally) |`);
  md.push(`| 4 | Events        | every write endpoint calls \`emitEvent\` / \`safeEmitEvent\` (or via \`applyTransition\`) |`);
  md.push(`| 5 | Lifecycle     | status-flipping endpoints route through \`applyTransition\` rather than raw \`UPDATE … SET status = …\` |`);
  md.push(`| 6 | GL bridge     | financial write endpoints in GL-relevant files reference a journal posting helper (\`postJournalEntry\`, \`finance-gl-helpers\`, \`finance-algorithms\`) |`);
  md.push("");
  md.push(`Out of scope (Phase 5): concurrency / locking correctness, large-dataset performance, real GL posting end-to-end, multi-tenant runtime isolation.`);
  md.push("");

  // Headline matrix
  md.push(`## Per-file matrix`);
  md.push("");
  md.push(`| File | Endpoints | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |`);
  md.push(`|---|---:|---|---|---|---|---|---|`);
  for (const r of results) {
    const cells = [
      r.dimAgg.rbac, r.dimAgg.scope, r.dimAgg.audit,
      r.dimAgg.event, r.dimAgg.lifecycle, r.dimAgg.glBridge,
    ].map(badge);
    md.push(`| \`${r.file.replace(/^artifacts\/api-server\/src\/routes\//, "")}\` | ${r.endpointCount} (${r.writeEndpoints}w) | ${cells.join(" | ")} |`);
  }
  md.push("");

  // Headline totals
  const totals = { rbac: {}, scope: {}, audit: {}, event: {}, lifecycle: {}, glBridge: {} };
  for (const r of results) {
    for (const dimName of Object.keys(totals)) {
      const v = r.dimAgg[dimName];
      totals[dimName][v] = (totals[dimName][v] || 0) + 1;
    }
  }
  md.push(`## Module-level totals (files)`);
  md.push("");
  md.push(`| Dimension | PASS | PARTIAL | FAIL | SKIP |`);
  md.push(`|---|---:|---:|---:|---:|`);
  for (const dimName of Object.keys(totals)) {
    const t = totals[dimName];
    md.push(`| ${dimLabel(dimName)} | ${t.PASS || 0} | ${t.PARTIAL || 0} | ${t.FAIL || 0} | ${t.SKIP || 0} |`);
  }
  md.push("");

  // Cross-ref workflow audit
  if (wfFindings) {
    md.push(`## Cross-reference: workflow-audit findings on Finance files`);
    md.push("");
    md.push(`From \`audit/system-review/tooling/_workflow-audit.json\`:`);
    md.push("");
    md.push(`- **Direct \`UPDATE … SET "status" = …\` bypassing \`applyTransition\`**: **${wfFindings.directStatusUpdate.length}** hits across Finance files (see #664). Breakdown:`);
    const byFile = {};
    for (const h of wfFindings.directStatusUpdate) {
      const f = h.file.replace(/^artifacts\/api-server\/src\/routes\//, "");
      byFile[f] = (byFile[f] || 0) + 1;
    }
    for (const [f, c] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
      md.push(`  - \`${f}\` — ${c}`);
    }
    md.push("");
    md.push(`- **fromState graph mismatches** on Finance files: **${wfFindings.fromStateMismatch.length}** hits (after PR #667 closes 1).`);
    for (const h of wfFindings.fromStateMismatch) {
      md.push(`  - \`${h.file.replace(/^artifacts\/api-server\/src\/routes\//, "")}:${h.line}\` — ${h.entity} ${h.attempted}`);
    }
    md.push("");
  }

  // Per-endpoint failures detail
  md.push(`## Endpoint-level non-PASS detail`);
  md.push("");
  for (const r of results) {
    const fails = r.endpoints.filter((e) =>
      Object.values(e.dims).some((v) => v === "FAIL" || v === "PARTIAL")
    );
    if (fails.length === 0) continue;
    md.push(`### \`${r.file.replace(/^artifacts\/api-server\/src\/routes\//, "")}\``);
    md.push("");
    md.push(`| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |`);
    md.push(`|---:|---|---|---|---|---|---|---|`);
    for (const e of fails) {
      const cells = [
        e.dims.rbac, e.dims.scope, e.dims.audit,
        e.dims.event, e.dims.lifecycle, e.dims.glBridge,
      ].map(badge);
      md.push(`| ${e.line} | \`${e.method} ${e.path}\` | ${cells.join(" | ")} |`);
    }
    md.push("");
  }

  md.push(`## Reproducing this audit`);
  md.push("");
  md.push(`\`\`\`bash`);
  md.push(`node audit/system-review/tooling/finance-cert.mjs`);
  md.push(`\`\`\``);
  md.push("");
  md.push(`Re-running regenerates both this file and`);
  md.push(`\`audit/system-review/tooling/_finance-cert.json\`. The script is`);
  md.push(`read-only — it touches no application code.`);
  md.push("");

  if (!existsSync(dirname(OUT_MD))) mkdirSync(dirname(OUT_MD), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify({ results, wfFindings }, null, 2));
  writeFileSync(OUT_MD, md.join("\n"));

  // Stdout summary
  console.log("finance-cert:");
  console.log(`  ${files.length} files audited`);
  console.log(`  ${results.reduce((s, r) => s + r.endpointCount, 0)} endpoints (${results.reduce((s, r) => s + r.writeEndpoints, 0)} writes)`);
  for (const dimName of Object.keys(totals)) {
    const t = totals[dimName];
    const parts = ["PASS", "PARTIAL", "FAIL", "SKIP"]
      .map((k) => `${k}:${t[k] || 0}`)
      .join(" ");
    console.log(`  ${dimLabel(dimName).padEnd(10)} ${parts}`);
  }
  console.log(`→ ${OUT_JSON}`);
  console.log(`→ ${OUT_MD}`);
}

function badge(v) {
  if (v === "PASS") return "✅ PASS";
  if (v === "PARTIAL") return "🟡 PARTIAL";
  if (v === "FAIL") return "❌ FAIL";
  return "— SKIP";
}

function dimLabel(d) {
  return { rbac: "RBAC", scope: "Scope", audit: "Audit", event: "Events", lifecycle: "Lifecycle", glBridge: "GL bridge" }[d] || d;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();

export { listFinanceFiles, extractEndpoints, classify };
