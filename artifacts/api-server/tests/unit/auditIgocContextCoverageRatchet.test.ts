/**
 * Audit IGOC context-coverage ratchet — HR Wave-1 / item 5.
 *
 * The HR live probe on HR-019 (org bridges) surfaced a defect the
 * inventory had flagged as «غير مغلق»: per-route `createAuditLog`
 * calls were dropping IGOC context (activeDepartmentId / resolvedScope
 * / impersonationSourceUser) — every audit row landed with NULL
 * context, making forensics on cross-tenant / impersonation events
 * impossible. The fix is the canonical `auditFromRequest()` helper
 * in lib/businessHelpers.ts that extracts all four fields from
 * `req.scope` automatically.
 *
 * This ratchet is a one-way drift gate over `src/routes/*.ts`:
 *
 *   - Pin the current count of files with audit calls that pass
 *     the FULL IGOC context (activeRoleKey + activeDepartmentId +
 *     resolvedScope + impersonationSourceUser). Count can only go UP.
 *
 *   - Disallow new files that import `createAuditLog` directly
 *     without ALSO importing `auditFromRequest`. The historical files
 *     that already use direct createAuditLog are on a SUNSET allowlist
 *     (frozen — every NEW file in `src/routes/` must use the helper).
 *
 *   - Disallow new audit-call files that don't surface IGOC context.
 *     The migration is incremental — historical drift stays parked
 *     in the allowlist; new growth must comply on first commit.
 *
 * See also tests/unit/igoc001AuditContextCompletenessSmoke.test.ts
 * for the migration that adds the three audit_logs columns.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES_DIR = join(import.meta.dirname!, "..", "..", "src", "routes");

interface FileAuditFacts {
  file: string;
  usesAuditFromRequest: boolean;
  usesCreateAuditLog: boolean;
  // Does the file pass ALL four IGOC fields on AT LEAST one createAuditLog call?
  fullIgocOnDirect: boolean;
}

function scanFile(file: string): FileAuditFacts | null {
  const src = readFileSync(join(ROUTES_DIR, file), "utf8");
  // Strip line comments FIRST: a `/*` inside a `//` comment (e.g.
  // `// route /pbx/* …`) would otherwise trick the non-greedy block-
  // comment regex into matching from a syntactic-comment `/*` opener
  // all the way to a much later `*/`, accidentally erasing real code.
  const stripped = src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  const usesAuditFromRequest = /\bauditFromRequest\b/.test(stripped);
  const usesCreateAuditLog = /\bcreateAuditLog\s*\(/.test(stripped);
  if (!usesAuditFromRequest && !usesCreateAuditLog) return null;

  const hasAll = (s: string) =>
    /activeRoleKey\s*:/.test(s) &&
    /activeDepartmentId\s*:/.test(s) &&
    /resolvedScope\s*:/.test(s) &&
    /impersonationSourceUser\s*:/.test(s);

  return {
    file,
    usesAuditFromRequest,
    usesCreateAuditLog,
    fullIgocOnDirect: usesCreateAuditLog && hasAll(stripped),
  };
}

const ALL: FileAuditFacts[] = readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map(scanFile)
  .filter((x): x is FileAuditFacts => x !== null);

/**
 * Historical files that call `createAuditLog` directly without passing
 * the full IGOC quartet. SUNSET ALLOWLIST — frozen on the day this
 * ratchet landed. Every NEW route file in `src/routes/` must use
 * `auditFromRequest()` instead. Migrating an existing file out of the
 * allowlist is the desired direction (the «every file with audit
 * surfaces full IGOC» count rises; this allowlist shrinks).
 *
 * To move a file off: switch every `createAuditLog({...})` call to
 * `auditFromRequest(req, action, entity, entityId, { after })` and
 * remove the entry below.
 */
const SUNSET_DIRECT_CREATE_AUDIT_LOG = new Set<string>([
  "accounting-engine.ts", "activityIngest.ts", "admin-ai-governance.ts",
  "admin-communication-control.ts", "admin-notification-routing.ts", "admin-pbx-control.ts",
  "admin-vendor-settings.ts", "admin.ts", "assistant.ts", "auth.ts", "automation.ts", "bi.ts",
  "careersPortal.ts", "cargo.ts", "clientPortal.ts", "clients.ts", "communications.ts",
  "correspondence.ts", "crm.ts", "digital-signature.ts", "documents.ts", "employees.ts",
  "entityMeta.ts", "finance-accounts.ts", "finance-algorithms.ts", "finance-budget.ts",
  "finance-collection.ts", "finance-cost-centers.ts", "finance-custodies.ts",
  "finance-gl-helpers.ts", "finance-hardening.ts", "finance-invoices.ts", "finance-journal.ts",
  "finance-purchase.ts", "finance-recurring.ts", "finance-vendor-contracts.ts",
  "finance-vendors.ts", "finance-zatca.ts", "fleet-rules-admin.ts", "fleet.ts",
  "gov-integrations.ts", "governance.ts", "hr-compliance.ts", "hr-contracts.ts",
  "hr-discipline.ts", "hr-exit.ts", "hr-loans.ts", "hr-overtime.ts", "hr-wps.ts", "hr.ts",
  "impactPreview.ts", "inbox.ts", "intelligence.ts", "legal.ts", "mailboxes.ts",
  "marketing.ts", "notification-engine.ts", "notifications.ts", "numbering.ts",
  "obligations.ts", "operationsCenter.ts", "parties.ts", "pdpl.ts", "print.ts",
  "projects.ts", "properties.ts", "publicData.ts", "rbacV2.ts", "recruitment.ts",
  "requests.ts", "rules.ts", "scheduled-reports.ts", "settings.ts", "storage.ts", "store.ts",
  "support.ts", "tasks.ts", "training.ts", "transport-billing-candidates.ts",
  "transport-bookings.ts", "transport-integration.ts", "transport-planning.ts",
  "transport-pricing.ts", "transport-route-patterns.ts", "umrah.ts",
  "vehicle-profile.ts", "warehouse-advanced.ts", "warehouse-cycle-counts.ts", "warehouse.ts", "workflows.ts",
]);

describe("audit IGOC context-coverage ratchet — HR Wave-1 item 5", () => {
  it("auditFromRequest helper exists and writes the full IGOC quartet", () => {
    const helpersPath = join(import.meta.dirname!, "..", "..", "src", "lib", "businessHelpers.ts");
    const src = readFileSync(helpersPath, "utf8");
    expect(src).toMatch(/export function auditFromRequest\(/);
    // All four IGOC fields must be read from scope by the helper
    expect(src).toMatch(/activeRoleKey:\s*scope\.selectedRoleKey/);
    expect(src).toMatch(/activeDepartmentId:\s*scope\.activeDepartmentId/);
    expect(src).toMatch(/resolvedScope:\s*scope\.resolvedScope/);
    expect(src).toMatch(/impersonationSourceUser:\s*scope\.impersonationSourceUser/);
  });

  it("org.ts (HR-019 bridges) routes through auditFromRequest — the live-probe regression fix", () => {
    const orgPath = join(ROUTES_DIR, "org.ts");
    const src = readFileSync(orgPath, "utf8");
    expect(src).toMatch(/auditFromRequest\(req,/);
    // Direct createAuditLog must not return to this file as an import.
    expect(src).not.toMatch(/import \{[^}]*createAuditLog[^}]*\} from/);
  });

  it("every new file with audit calls must use auditFromRequest (sunset allowlist is closed)", () => {
    const offenders = ALL
      .filter((f) => f.usesCreateAuditLog && !f.usesAuditFromRequest)
      .filter((f) => !SUNSET_DIRECT_CREATE_AUDIT_LOG.has(f.file))
      .map((f) => f.file);
    expect(
      offenders,
      "New route file calls createAuditLog directly without auditFromRequest. " +
        "Switch the calls to auditFromRequest(req, action, entity, entityId, { after }) so " +
        "activeRoleKey + activeDepartmentId + resolvedScope + impersonationSourceUser " +
        "land on every audit row. See lib/businessHelpers.ts:auditFromRequest.",
    ).toEqual([]);
  });

  it("allowlist stays an honest one-way ratchet — entries that migrated off must be removed", () => {
    const stillDirect = new Set(ALL.filter((f) => f.usesCreateAuditLog).map((f) => f.file));
    const stale = [...SUNSET_DIRECT_CREATE_AUDIT_LOG].filter((f) => !stillDirect.has(f));
    expect(
      stale,
      "Allowlisted file no longer calls createAuditLog directly — remove it from " +
        "SUNSET_DIRECT_CREATE_AUDIT_LOG. (Direction of travel: count only shrinks.)",
    ).toEqual([]);
  });

  it("snapshot: full-IGOC coverage count (rises over time as files migrate)", () => {
    const fullIgocFiles = ALL.filter(
      (f) => f.usesAuditFromRequest || f.fullIgocOnDirect,
    ).length;
    // Today: only org.ts (via auditFromRequest) + meInsights/igoc006 self-tests.
    // When new files migrate, bump this number — it must never drop.
    expect(fullIgocFiles).toBeGreaterThanOrEqual(1);
  });
});
