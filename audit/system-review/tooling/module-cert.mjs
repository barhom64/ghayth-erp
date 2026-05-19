#!/usr/bin/env node
// module-cert.mjs — Generic static module certification audit.
//
// Generalizes `finance-cert.mjs` to any module (HR, Properties, Umrah,
// …). Produces the same PASS / PARTIAL / FAIL matrix across the six
// statically-checkable dimensions, customised per module via
// MODULE_CONFIGS below.
//
// Usage
//   MODULE=hr        node audit/system-review/tooling/module-cert.mjs
//   MODULE=properties node audit/system-review/tooling/module-cert.mjs
//   MODULE=umrah     node audit/system-review/tooling/module-cert.mjs
//
// Why a separate tool from finance-cert.mjs
//   finance-cert.mjs is already merged + referenced by issue #670 and
//   its three closing PRs. Refactoring it carries unnecessary risk for
//   a tool the team already trusts. This file is the next-generation
//   generic surface; finance-cert.mjs stays as the proven, frozen
//   reference baseline. Future module audits go through here.
//
// Dimensions evaluated (same as finance-cert.mjs)
//   1. RBAC      — every router.{get,post,patch,delete}() handler is
//                  authorize()-guarded.
//   2. Scope     — list endpoints use parseScopeFilters +
//                  buildScopedWhere; detail/write reference
//                  scope.companyId. Manual companyId-only = PARTIAL.
//   3. Audit     — every write endpoint calls createAuditLog (or via
//                  applyTransition / recordSideEffects wrapper).
//   4. Events    — every write endpoint emits via emitEvent /
//                  safeEmitEvent / wrapper.
//   5. Lifecycle — status-flipping endpoints use applyTransition.
//   6. GL bridge — module-specific: GL-relevant files reference a
//                  journal posting helper.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const ROUTES_DIR = join(REPO, "artifacts/api-server/src/routes");
const WORKFLOW_AUDIT_JSON = join(__dirname, "_workflow-audit.json");

// ─── Module configs ───────────────────────────────────────────────────

const MODULE_CONFIGS = {
  hr: {
    title: "HR",
    // Matches hr.ts AND hr-*.ts
    filePattern: /^hr(-|\.ts)/,
    glRelevantFiles: new Set([
      "hr.ts",          // payroll runs touch GL
      "hr-loans.ts",    // loan disbursements / repayments touch GL
      "hr-contracts.ts", // salary contract changes propagate to payroll → GL
    ]),
    outMd: "docs/audit/HR_CERTIFICATION.md",
    outJson: "audit/system-review/tooling/_hr-cert.json",
  },
  properties: {
    title: "Properties",
    filePattern: /^properties(-|\.ts)/,
    glRelevantFiles: new Set([
      "properties.ts",  // rental contracts emit invoices → GL
    ]),
    outMd: "docs/audit/PROPERTIES_CERTIFICATION.md",
    outJson: "audit/system-review/tooling/_properties-cert.json",
  },
  umrah: {
    title: "Umrah",
    filePattern: /^umrah(-|\.ts)/,
    glRelevantFiles: new Set([
      "umrah.ts",          // sales invoices + agent invoices → GL
      "umrah-entities.ts", // less GL-likely but flagged for completeness
    ]),
    outMd: "docs/audit/UMRAH_CERTIFICATION.md",
    outJson: "audit/system-review/tooling/_umrah-cert.json",
  },
};

const MODULE = process.env.MODULE || "";
if (!MODULE_CONFIGS[MODULE]) {
  console.error(`module-cert: set MODULE to one of: ${Object.keys(MODULE_CONFIGS).join(", ")}`);
  process.exit(1);
}
const CFG = MODULE_CONFIGS[MODULE];
const OUT_JSON = join(REPO, CFG.outJson);
const OUT_MD = join(REPO, CFG.outMd);

// ─── Helpers (same shape as finance-cert.mjs) ─────────────────────────

function listModuleFiles() {
  return readdirSync(ROUTES_DIR).filter((f) => CFG.filePattern.test(f));
}

function extractEndpoints(src) {
  const endpoints = [];
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
  const body = endpoint.body;
  const checks = {
    rbac: /authorize\(\{[^)]*feature\s*:/.test(body),
    scopeParseFilters: /parseScopeFilters\(req\)/.test(body),
    scopeBuildWhere: /buildScopedWhere\(/.test(body),
    scopeManualCompany: /"companyId"\s*=\s*\$\d/.test(body) || /scope\.companyId/.test(body),
    audit: /createAuditLog\(/.test(body) || /recordSideEffects\(/.test(body),
    event: /(emitEvent|safeEmitEvent)\(/.test(body) || /recordSideEffects\(/.test(body),
    applyTransition: /applyTransition\(\{/.test(body),
    directStatusUpdate: /UPDATE\s+\w+[\s\S]{0,160}\bSET\b[\s\S]{0,160}(?:"?status"?|"?approvalStatus"?)\s*=/i.test(body)
      && !/applyTransition/.test(body),
    glPosting: /(postInventoryMovementGl|postJournalEntry|finance-gl-helpers|finance-algorithms|postExpenseGl|postPaymentGl|postInvoiceGl|postPurchaseGl|gl_lines|journal_entries|financialEngine)/i.test(body),
  };
  const isList = endpoint.method === "GET" && !/\/:\w+$/.test(endpoint.path);
  const isWrite = endpoint.method !== "GET";

  let rbac = checks.rbac ? "PASS" : "FAIL";
  let scope;
  if (isList) {
    scope = checks.scopeParseFilters && checks.scopeBuildWhere ? "PASS"
      : checks.scopeManualCompany ? "PARTIAL"
      : "FAIL";
  } else {
    scope = checks.scopeManualCompany ? "PASS" : "FAIL";
  }
  let audit;
  if (isWrite) audit = checks.audit || checks.applyTransition ? "PASS" : "FAIL";
  else audit = "SKIP";
  let event;
  if (isWrite) event = checks.event || checks.applyTransition ? "PASS" : "FAIL";
  else event = "SKIP";
  let lifecycle;
  if (checks.applyTransition) lifecycle = "PASS";
  else if (checks.directStatusUpdate) lifecycle = "FAIL";
  else lifecycle = "SKIP";
  let glBridge;
  if (!isWrite) glBridge = "SKIP";
  else if (checks.glPosting) glBridge = "PASS";
  else if (CFG.glRelevantFiles.has(file)) glBridge = "PARTIAL";
  else glBridge = "SKIP";

  return { checks, dims: { rbac, scope, audit, event, lifecycle, glBridge } };
}

// ─── Main ─────────────────────────────────────────────────────────────

function main() {
  const files = listModuleFiles();
  if (files.length === 0) {
    console.error(`module-cert(${MODULE}): no route files match ${CFG.filePattern}`);
    process.exit(1);
  }
  const workflowAudit = existsSync(WORKFLOW_AUDIT_JSON)
    ? JSON.parse(readFileSync(WORKFLOW_AUDIT_JSON, "utf8"))
    : null;

  const results = [];
  for (const f of files) {
    const full = join(ROUTES_DIR, f);
    const src = readFileSync(full, "utf8");
    const endpoints = extractEndpoints(src);
    const classified = endpoints.map((e) => ({ ...e, ...classify(e, f) }));
    const slim = classified.map((c) => ({
      method: c.method,
      path: c.path,
      line: c.line,
      checks: c.checks,
      dims: c.dims,
    }));
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

  const filePrefixRe = new RegExp(`^${MODULE}(-|\\.)`);
  const wfFindings = workflowAudit
    ? {
        directStatusUpdate: workflowAudit.findings.directStatusUpdate.filter(
          (h) => filePrefixRe.test(h.file.split("/").pop() || "")
        ),
        fromStateMismatch: workflowAudit.findings.fromStateGraphMismatch.filter(
          (h) => filePrefixRe.test(h.file.split("/").pop() || "")
        ),
      }
    : null;

  // ─── Render markdown ────────────────────────────────────────────────

  const today = new Date().toISOString().slice(0, 10);
  const md = [];
  md.push(`# ${CFG.title} Module Static Certification`);
  md.push("");
  md.push(`Generated: ${today}`);
  md.push("");
  md.push(`> **Read-only.** Regenerate with`);
  md.push(`> \`MODULE=${MODULE} node audit/system-review/tooling/module-cert.mjs\`.`);
  md.push(`> Each cell here is one of \`PASS\` / \`PARTIAL\` / \`FAIL\` / \`SKIP\`;`);
  md.push(`> non-PASS cells should turn into an issue or a small PR.`);
  md.push("");
  md.push(`## Scope`);
  md.push("");
  md.push(`Files audited: **${files.length}** under \`artifacts/api-server/src/routes/${MODULE}*.ts\`.`);
  md.push(`Endpoints: **${results.reduce((s, r) => s + r.endpointCount, 0)}** total, **${results.reduce((s, r) => s + r.writeEndpoints, 0)}** writes.`);
  md.push("");
  md.push(`## Dimensions evaluated`);
  md.push("");
  md.push(`| # | Dimension | Static check |`);
  md.push(`|---|---|---|`);
  md.push(`| 1 | RBAC          | every handler is wrapped by \`authorize({ feature, action })\` |`);
  md.push(`| 2 | Scope         | list endpoints use \`parseScopeFilters\` + \`buildScopedWhere\`; detail/write reference \`scope.companyId\` |`);
  md.push(`| 3 | Audit         | every write endpoint calls \`createAuditLog\` (or routes via \`applyTransition\` / \`recordSideEffects\`) |`);
  md.push(`| 4 | Events        | every write endpoint calls \`emitEvent\` / \`safeEmitEvent\` (or via the wrappers above) |`);
  md.push(`| 5 | Lifecycle     | status-flipping endpoints route through \`applyTransition\` rather than raw \`UPDATE … SET status = …\` |`);
  md.push(`| 6 | GL bridge     | GL-relevant ${CFG.title} write endpoints reference a journal posting helper (\`postJournalEntry\`, \`financialEngine\`, \`finance-gl-helpers\`) |`);
  md.push("");
  md.push(`Out of scope (Phase 5): concurrency / locking correctness, large-dataset performance, real GL posting end-to-end, multi-tenant runtime isolation.`);
  md.push("");

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

  if (wfFindings) {
    md.push(`## Cross-reference: workflow-audit findings on ${CFG.title} files`);
    md.push("");
    md.push(`- **Direct \`UPDATE … SET "status" = …\` bypassing \`applyTransition\`**: **${wfFindings.directStatusUpdate.length}** hits across ${CFG.title} files (see #664). Breakdown:`);
    if (wfFindings.directStatusUpdate.length === 0) {
      md.push(`  - _None._`);
    } else {
      const byFile = {};
      for (const h of wfFindings.directStatusUpdate) {
        const f = h.file.replace(/^artifacts\/api-server\/src\/routes\//, "");
        byFile[f] = (byFile[f] || 0) + 1;
      }
      for (const [f, c] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
        md.push(`  - \`${f}\` — ${c}`);
      }
    }
    md.push("");
    md.push(`- **fromState graph mismatches** on ${CFG.title} files: **${wfFindings.fromStateMismatch.length}** hits.`);
    if (wfFindings.fromStateMismatch.length === 0) {
      md.push(`  - _None._`);
    } else {
      for (const h of wfFindings.fromStateMismatch) {
        md.push(`  - \`${h.file.replace(/^artifacts\/api-server\/src\/routes\//, "")}:${h.line}\` — ${h.entity} ${h.attempted}`);
      }
    }
    md.push("");
  }

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
  md.push(`MODULE=${MODULE} node audit/system-review/tooling/module-cert.mjs`);
  md.push(`\`\`\``);
  md.push("");

  if (!existsSync(dirname(OUT_MD))) mkdirSync(dirname(OUT_MD), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify({ module: MODULE, results, wfFindings }, null, 2));
  writeFileSync(OUT_MD, md.join("\n"));

  console.log(`module-cert(${MODULE}):`);
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

export { MODULE_CONFIGS, classify, extractEndpoints };
