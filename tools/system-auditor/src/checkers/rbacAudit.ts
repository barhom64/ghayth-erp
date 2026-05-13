import type { Finding, Recommendation } from "../types.ts";
import type { ModuleAnalysis } from "./boundaries.ts";

const RBAC_IN_BODY =
  /(requirePermission|requireAnyPermission|authorize|requireOwnership|requireRole)\s*\(/;
// Direct audit/event APIs *and* wrapper helpers that themselves call
// createAuditLog/eventBus.emit internally (verified in
// artifacts/api-server/src/lib/{lifecycleEngine,workflowEngine}.ts).
// Treating these as audit-emitting eliminates false positives where
// the handler delegates audit to a transition / workflow helper.
const AUDIT_IN_BODY =
  /(createAuditLog|auditLog\.(?:create|insert)|recordAudit|emitEvent|applyTransition|submitWorkflow|approveWorkflow|rejectWorkflow|referWorkflow|escalateWorkflow|returnWorkflow)\s*(?:<[^()]*>\s*)?\(/;
const IDEMPOTENCY_RE = /idempotency[_-]?key/i;
const FINANCIAL_HINT_RE =
  /(invoice|payment|penalty|payroll|posting|journal|gl|transfer|withdraw|deposit)/i;

const PUBLIC_FILES = new Set(["auth.ts", "health.ts", "publicData.ts", "careersPortal.ts", "clientPortal.ts"]);

export function checkRbacAudit(
  modules: ModuleAnalysis[],
): { findings: Finding[]; recommendation: Recommendation } {
  const findings: Finding[] = [];
  for (const mod of modules) {
    const fname = mod.routeFile.split("/").pop() ?? "";
    if (PUBLIC_FILES.has(fname)) continue;

    for (const h of mod.writeHandlers) {
      if (!RBAC_IN_BODY.test(h.body)) {
        findings.push({
          module: mod.module,
          axis: "rbacAudit",
          severity: "critical",
          message: `${h.method} ${h.path} بدون صلاحية واضحة (requirePermission/authorize)`,
          file: `${mod.routeFile}:${h.line}`,
        });
      }
      if (!AUDIT_IN_BODY.test(h.body)) {
        findings.push({
          module: mod.module,
          axis: "rbacAudit",
          severity: "critical",
          message: `${h.method} ${h.path} بدون Audit log أو emitEvent`,
          file: `${mod.routeFile}:${h.line}`,
        });
      }
      if (FINANCIAL_HINT_RE.test(h.path) && !IDEMPOTENCY_RE.test(h.body)) {
        findings.push({
          module: mod.module,
          axis: "rbacAudit",
          severity: "medium",
          message: `${h.method} ${h.path} (عملية مالية) بدون idempotency key`,
          file: `${mod.routeFile}:${h.line}`,
        });
      }
    }
  }
  const critical = findings.filter((f) => f.severity === "critical").length;
  const rec: Recommendation = critical > 0 ? "Stop Ship" : "Pass";
  return { findings, recommendation: rec };
}
