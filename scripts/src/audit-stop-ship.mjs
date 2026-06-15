#!/usr/bin/env node
//
// scripts/src/audit-stop-ship.mjs — Stop-Ship compliance scanner (#1139 §8).
//
// The master execution plan enumerates eight Stop-Ship rules — gaps that
// must NOT exist in a shippable feature:
//
//   1. لا audit          (no audit-log call on a write endpoint)
//   2. لا RBAC           (no authorize() guard on a write endpoint)
//   3. لا lifecycle      (status changes without a lifecycle helper) — out of scope here
//   4. لا events         (no emitEvent() on a write endpoint)
//   5. لا API contracts  (raw req.body usage without zodParse/safeParse) — out of scope
//   6. لا rollback       (migrations missing @rollback) — already enforced by
//                         scripts/src/check-migration-policy.mjs
//   7. لا observability  (raw console.* in lib/routes) — already enforced by
//                         scripts/src/lint-patterns.mjs (no-console rules)
//   8. hardcoded behavior (already covered by hardcoded-data-scan in audit/system-review)
//
// This script focuses on the three rules NOT covered by an existing
// guard: RBAC + audit + events on write endpoints (rules 1, 2, 4).
//
// Algorithm:
//
//   1. Walk every .ts file under artifacts/api-server/src/routes/.
//   2. For each file, find `router.<method>(path, ...)` calls where
//      method ∈ {post, patch, put, delete}.
//   3. For each match, check the route definition line(s) for an
//      `authorize(...)` middleware token.
//   4. Check the file-level for any `createAuditLog(` and `emitEvent(`
//      calls — if a write-method route file has zero of either, it's
//      a Stop-Ship violation.
//   5. Report violations grouped by file + a summary.
//
// Allowlist:
//   Some files legitimately have no events/audit (pure-read shims,
//   webhook receivers that ack and forward). They're listed below
//   with a reason.
//
// Usage:
//   node scripts/src/audit-stop-ship.mjs                 # check only, exit 1 on critical
//   node scripts/src/audit-stop-ship.mjs --report-only   # print, always exit 0
//   node scripts/src/audit-stop-ship.mjs --write-report  # also write md + csv to audit/stop-ship/
//   pnpm audit:stop-ship
//
// The guard mode (the default) intentionally does NOT write files —
// regenerating audit/stop-ship/report.md on every pre-commit hook
// would dirty the working tree on every commit. The --write-report
// flag is for the operator who wants a tracked snapshot.

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");
const REPORT_DIR = join(REPO_ROOT, "audit/stop-ship");

// Per-route exemptions, keyed by "FILE:METHOD PATH" with a reason.
// Use sparingly — every entry is a documented "this looks bad but is
// safe because…". The audit report still surfaces these as "allowlisted".
const ROUTE_ALLOWLIST = new Map([
  ["rbacV2.ts:POST /jit/:id/cancel",
    "Self-cancel only — SQL guard 'WHERE userId = $scope.userId' + mount-level requireMinLevel(90)"],
]);

// Files that are exempt — with a one-line reason. Add new entries
// sparingly; the goal is to keep this list short.
const ALLOWLIST = new Map([
  ["index.ts", "router composition only — no endpoint logic"],
  ["health.ts", "public liveness/readiness probes — read-only"],
  ["publicData.ts", "public anonymous-read surface — no writes"],
  ["printVerify.ts", "anonymous QR verify — read-only by design"],
  ["events.ts", "event subscriber lifecycle — manages its own audit/events internally"],
  ["activityIngest.ts", "fire-and-forget activity ingest — audited at the read side"],
  ["search.ts", "read-only search"],
  ["auth.ts", "anonymous login/register/refresh endpoints — pre-auth by design"],
  ["careersPortal.ts", "uses its own careersPortalJwt middleware, not authorize()"],
  ["clientPortal.ts", "uses its own clientPortalJwt middleware, not authorize()"],
  ["driverPortal.ts", "uses its own driver_portal JWT middleware (#1354), not authorize()"],
  ["fleet-telematics-webhook.ts", "anonymous HMAC-signed CMSV6 push (#1354) — audit + events fire inside the shared persist* helpers in fleet-telematics.ts; webhook itself only orchestrates"],
  ["print.ts", "every print creates a row in print_jobs (its own audit table) with operator + template + payload — emitEvent would be redundant duplication"],
  ["wiring-stubs.ts", "test scaffolding for the wiring audit — no production traffic, no business writes"],
  ["rbacV2.ts", "every role/sod/grant mutation writes a row to rbac_role_history (parallel audit table) via recordHistory() — RBAC has its own first-class audit surface that compliance reads directly"],
  ["numbering.ts", "numbering scheme writes are CAS-style schema state; the numberingService emits its own *.scheme.created/.updated events on every issue() call — see lib/numberingService.ts"],
  ["import.ts", "every confirmed import writes a row to import_batches (its own audit table) with operator + entity + rowCount + fileName — same pattern as print_jobs and rbac_role_history"],
]);

// Accepted RBAC patterns. The newer RBAC-v2 layer uses authorize();
// some older or specialised routers still use the legacy
// requirePermission()/requireMinLevel() guards or webhook-style
// HMAC/signature verification. All count as "RBAC present" — a
// signed webhook is auth even though no user identity exists.
const RBAC_PATTERNS = [
  /\bauthorize\s*\(/,
  /\bauthorizeAny\s*\(/,
  /\brequirePermission\s*\(/,
  /\brequireAnyPermission\s*\(/,
  /\brequireMinLevel\s*\(/,
  /\brequireRole\s*\(/,
  // verify*(Signature|Hmac|Webhook|Token) — matches verifyPbxSignature,
  // verifyHmac, verifyWebhookSignature, etc.
  /\bverify[A-Za-z]*(?:Signature|Hmac|Webhook|Token)\s*\(/,
];

// Accepted audit-write patterns. `createAuditLog` is the generic helper
// most routes use; subsystem-specific orchestrators count too when their
// public contract guarantees an audit row. For the print platform,
// `renderPrint()` is documented (printService.ts header, step 8) to call
// `writePrintJob()` internally — so any route calling renderPrint IS
// auditing, just through one level of indirection. `auditMutation` is a
// thin wrapper around createAuditLog in businessHelpers.ts that pulls
// scope from `req` and forwards — counts identically. `auditFromRequest`
// is the CANONICAL route-level audit writer (businessHelpers.ts:422) —
// it forwards to createAuditLog with the full IGOC context columns and
// is the helper routes are told to use "instead of calling createAuditLog
// directly", so it must count too (org.ts/inboxConversations.ts/
// myFieldTracking.ts/fleet-optimizer.ts audit exclusively through it).
// Add new entries as new audit pipelines land.
const AUDIT_PATTERNS = [
  /\bcreateAuditLog\s*\(/,
  /\bauditMutation\s*\(/,
  /\bauditFromRequest\s*\(/,
  /\brenderPrint\s*\(/,
  /\bwritePrintJob\s*\(/,
];

const WRITE_METHODS = ["post", "patch", "put", "delete"];

const isReportOnly = process.argv.includes("--report-only");
const shouldWriteReport = process.argv.includes("--write-report");

// ─────────────────────── helpers ──────────────────────────────────────────

function stripComments(src) {
  // Drop // line comments and /* … */ block comments so they don't
  // mask or fake-match the patterns we're looking for. Leaves string
  // literals alone (good enough — we're not looking for SQL keywords).
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function findRouterCalls(src) {
  // Match `xRouter.post("/path", …` or `router.post("/path", …` etc.
  // We capture the method and the start position so we can slice out
  // the call's arguments and check for authorize() in them.
  const re = /\b([a-zA-Z_$][\w$]*)\.(post|patch|put|delete|get)\s*\(\s*(?:"([^"]+)"|`([^`]+)`)/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({
      varName: m[1],
      method: m[2],
      path: m[3] ?? m[4] ?? "",
      index: m.index,
    });
  }
  return out;
}

function sliceCallArgs(src, startIndex) {
  // Starting at the `(` that opens the call, walk forward balancing
  // parens to find the matching `)`. Returns the substring between
  // them. Templates/strings braces are skipped naively but well
  // enough for the typescript router DSL we're scanning.
  const open = src.indexOf("(", startIndex);
  if (open < 0) return "";
  let depth = 0;
  let inStr = null;
  let inTpl = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (inTpl > 0) {
      if (ch === "`") inTpl--;
      else if (ch === "$" && src[i + 1] === "{") {
        // template substitution — descend into it as code
        inTpl++; i++;
      }
      continue;
    }
    if (ch === "'" || ch === '"') { inStr = ch; continue; }
    if (ch === "`") { inTpl = 1; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1);
}

// ─────────────────────── scan one file ────────────────────────────────────

async function scanFile(absPath) {
  const src = await readFile(absPath, "utf8");
  const clean = stripComments(src);
  const rel = relative(REPO_ROOT, absPath);
  const base = absPath.split("/").pop();

  // File-level signals — set once per file rather than per route.
  // A route file is "audited" if it imports createAuditLog OR a
  // subsystem-specific audit writer (see AUDIT_PATTERNS). Same logic
  // for events.
  const fileHasCreateAuditLog = AUDIT_PATTERNS.some((re) => re.test(clean));
  const fileHasEmitEvent = /\bemitEvent\s*\(/.test(clean);
  // RBAC: routes can either call authorize() per-route or be mounted
  // behind requireMinLevel/requireModule at the router level — we
  // detect the former here, and accept the latter as a separate
  // file-level guarantee (the index.ts mount is the source of truth).
  const fileMountsAuthorize = RBAC_PATTERNS.some((re) => re.test(clean));

  const calls = findRouterCalls(clean);
  const writeCalls = calls.filter((c) => WRITE_METHODS.includes(c.method));

  const violations = [];

  // Per-route RBAC check: every write route should have one of the
  // accepted guards in its middleware chain (authorize / requirePermission
  // / requireMinLevel / requireRole / verify*).
  for (const c of writeCalls) {
    const args = sliceCallArgs(clean, c.index);
    const hasGuard = RBAC_PATTERNS.some((re) => re.test(args));
    if (!hasGuard) {
      const allowKey = `${base}:${c.method.toUpperCase()} ${c.path}`;
      if (ROUTE_ALLOWLIST.has(allowKey)) continue;
      violations.push({
        rule: "rbac.missing",
        severity: "critical",
        file: rel,
        endpoint: `${c.method.toUpperCase()} ${c.path}`,
        message: "Write endpoint without an RBAC guard (authorize / requirePermission / requireMinLevel / verify*).",
      });
    }
  }

  // File-level audit/events check: if a file defines write routes but
  // never calls createAuditLog / emitEvent, it's a likely gap.
  // Downgraded from critical to warning because the global
  // auditMiddleware (mounted in app.ts) provides baseline audit
  // coverage for any URL prefix in its ENTITY_MAP — the explicit
  // createAuditLog() is for business-level audit on top of that.
  if (writeCalls.length > 0 && !fileHasCreateAuditLog) {
    violations.push({
      rule: "audit.missing",
      severity: "warning",
      file: rel,
      endpoint: `(file-level — ${writeCalls.length} write endpoint(s))`,
      message: "Route file has write endpoints but no createAuditLog() call. Verify the path is covered by auditMiddleware ENTITY_MAP, or add explicit audit calls for business-level events.",
    });
  }
  if (writeCalls.length > 0 && !fileHasEmitEvent) {
    violations.push({
      rule: "events.missing",
      severity: "warning",
      file: rel,
      endpoint: `(file-level — ${writeCalls.length} write endpoint(s))`,
      message: "Route file has write endpoints but no emitEvent() call anywhere.",
    });
  }

  return {
    file: rel,
    base,
    writes: writeCalls.length,
    reads: calls.length - writeCalls.length,
    fileHasCreateAuditLog,
    fileHasEmitEvent,
    fileMountsAuthorize,
    violations,
  };
}

// ─────────────────────── main ─────────────────────────────────────────────

async function main() {
  const files = (await readdir(ROUTES_DIR))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort();

  const reports = [];
  for (const f of files) {
    const r = await scanFile(join(ROUTES_DIR, f));
    reports.push(r);
  }

  // Apply allowlist — drop violations from files explicitly exempted.
  const filtered = reports.map((r) => {
    if (ALLOWLIST.has(r.base)) {
      return { ...r, violations: [], allowlistReason: ALLOWLIST.get(r.base) };
    }
    return r;
  });

  const allViolations = filtered.flatMap((r) => r.violations);
  const criticals = allViolations.filter((v) => v.severity === "critical");
  const warnings  = allViolations.filter((v) => v.severity === "warning");

  // ─── Stdout summary ───
  console.log("");
  console.log("Stop-Ship Compliance Scan — #1139 §8");
  console.log("─────────────────────────────────────");
  console.log(`Files scanned:           ${filtered.length}`);
  console.log(`Allowlisted files:       ${filtered.filter((r) => r.allowlistReason).length}`);
  console.log(`Total write endpoints:   ${filtered.reduce((s, r) => s + r.writes, 0)}`);
  console.log(`Total read endpoints:    ${filtered.reduce((s, r) => s + r.reads, 0)}`);
  console.log(`Critical violations:     ${criticals.length}`);
  console.log(`Warnings:                ${warnings.length}`);
  console.log("");

  if (criticals.length > 0) {
    console.log("─── Critical (Stop-Ship) ──────────────");
    for (const v of criticals) {
      console.log(`✗ [${v.rule}] ${v.file}`);
      console.log(`    ${v.endpoint}`);
      console.log(`    ${v.message}`);
    }
    console.log("");
  }

  if (warnings.length > 0) {
    console.log("─── Warnings ──────────────────────────");
    for (const v of warnings.slice(0, 20)) {
      console.log(`⚠ [${v.rule}] ${v.file}`);
      console.log(`    ${v.endpoint}`);
      console.log(`    ${v.message}`);
    }
    if (warnings.length > 20) {
      console.log(`  … and ${warnings.length - 20} more (see audit/stop-ship/report.md).`);
    }
    console.log("");
  }

  // ─── Optional persisted reports (--write-report) ───
  if (shouldWriteReport) {
    await mkdir(REPORT_DIR, { recursive: true });
    const md = renderMarkdownReport(filtered, criticals, warnings);
    await writeFile(join(REPORT_DIR, "report.md"), md, "utf8");

    const csvLines = ["severity,rule,file,endpoint,message"];
    for (const v of allViolations) {
      csvLines.push([
        v.severity, v.rule, v.file,
        `"${v.endpoint.replace(/"/g, '""')}"`,
        `"${v.message.replace(/"/g, '""')}"`,
      ].join(","));
    }
    await writeFile(join(REPORT_DIR, "violations.csv"), csvLines.join("\n") + "\n", "utf8");

    console.log(`Report written to ${relative(REPO_ROOT, REPORT_DIR)}/report.md`);
    console.log(`CSV     written to ${relative(REPO_ROOT, REPORT_DIR)}/violations.csv`);
  }

  if (criticals.length > 0 && !isReportOnly) {
    process.exit(1);
  }
}

function renderMarkdownReport(reports, criticals, warnings) {
  const ts = new Date().toISOString();
  const lines = [];
  lines.push(`# Stop-Ship Compliance Report — #1139 §8`);
  lines.push("");
  lines.push(`> Generated: ${ts}`);
  lines.push(`> Scope: every \`.ts\` file under \`artifacts/api-server/src/routes/\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Files scanned | ${reports.length} |`);
  lines.push(`| Allowlisted | ${reports.filter((r) => r.allowlistReason).length} |`);
  lines.push(`| Write endpoints | ${reports.reduce((s, r) => s + r.writes, 0)} |`);
  lines.push(`| Read endpoints | ${reports.reduce((s, r) => s + r.reads, 0)} |`);
  lines.push(`| Critical violations | **${criticals.length}** |`);
  lines.push(`| Warnings | ${warnings.length} |`);
  lines.push("");

  lines.push("## Rules");
  lines.push("");
  lines.push("- **rbac.missing** (critical) — a write endpoint (POST/PATCH/PUT/DELETE) without `authorize()` in its middleware chain.");
  lines.push("- **audit.missing** (critical) — a route file with write endpoints but no `createAuditLog()` call anywhere.");
  lines.push("- **events.missing** (warning) — a route file with write endpoints but no `emitEvent()` call anywhere.");
  lines.push("");

  if (criticals.length > 0) {
    lines.push("## Critical Violations");
    lines.push("");
    lines.push("| Rule | File | Endpoint | Message |");
    lines.push("|---|---|---|---|");
    for (const v of criticals) {
      lines.push(`| \`${v.rule}\` | \`${v.file}\` | \`${v.endpoint}\` | ${v.message} |`);
    }
    lines.push("");
  }

  if (warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    lines.push("| Rule | File | Endpoint | Message |");
    lines.push("|---|---|---|---|");
    for (const v of warnings) {
      lines.push(`| \`${v.rule}\` | \`${v.file}\` | \`${v.endpoint}\` | ${v.message} |`);
    }
    lines.push("");
  }

  lines.push("## Per-file Inventory");
  lines.push("");
  lines.push("| File | Writes | Reads | audit | events | authorize | Allowlist |");
  lines.push("|---|---:|---:|:---:|:---:|:---:|---|");
  for (const r of reports) {
    lines.push(`| \`${r.base}\` | ${r.writes} | ${r.reads} | ${r.fileHasCreateAuditLog ? "✓" : "—"} | ${r.fileHasEmitEvent ? "✓" : "—"} | ${r.fileMountsAuthorize ? "✓" : "—"} | ${r.allowlistReason ?? ""} |`);
  }
  lines.push("");

  return lines.join("\n");
}

await main();
