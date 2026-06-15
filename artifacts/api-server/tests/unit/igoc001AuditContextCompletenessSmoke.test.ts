/**
 * IGOC-001 — Audit Context Completeness smoke test.
 *
 * The migration 284 adds 3 context columns to audit_logs:
 *   - active_department_id   — the dept of the actor's active assignment
 *   - resolved_scope         — the scope authzEngine resolved for THIS call
 *   - impersonation_source_user — real userId when super-admin previews
 *
 * This test pins the WIRING (no DB needed):
 *   - Migration file exists with the 3 columns + indexes + rollback
 *   - createAuditLog accepts the 3 new params
 *   - logAudit listener forwards them into the INSERT
 *   - authMiddleware sets activeDepartmentId + impersonationSourceUser
 *     on req.scope
 *   - authorize() sets resolvedScope on req.scope after grant resolution
 *   - auditMiddleware reads all 3 from req.scope into the emitted event
 *   - RequestScope type carries the 3 new fields
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const MIG_SRC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/migrations/294_audit_context_completeness.sql"), "utf8");
const HELPERS_SRC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/businessHelpers.ts"), "utf8");
const LISTENERS_SRC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/eventListeners.ts"), "utf8");
const AUTHMW_SRC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/middlewares/authMiddleware.ts"), "utf8");
const AUDITMW_SRC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/middlewares/auditMiddleware.ts"), "utf8");
const AUTHORIZE_SRC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/rbac/authorize.ts"), "utf8");

describe("IGOC-001 — migration 284 schema additions", () => {
  it("adds active_department_id + resolved_scope + impersonation_source_user", () => {
    expect(MIG_SRC).toMatch(/ADD COLUMN IF NOT EXISTS active_department_id INTEGER/);
    expect(MIG_SRC).toMatch(/ADD COLUMN IF NOT EXISTS resolved_scope VARCHAR\(40\)/);
    expect(MIG_SRC).toMatch(/ADD COLUMN IF NOT EXISTS impersonation_source_user INTEGER/);
  });

  it("mirrors the 3 columns into audit_logs_archive when it exists", () => {
    expect(MIG_SRC).toMatch(/audit_logs_archive[\s\S]*?ADD COLUMN IF NOT EXISTS active_department_id INTEGER[\s\S]*?resolved_scope[\s\S]*?impersonation_source_user/);
  });

  it("adds partial indexes for the two common audit query patterns", () => {
    expect(MIG_SRC).toMatch(/CREATE INDEX IF NOT EXISTS idx_audit_logs_active_dept[\s\S]*?WHERE active_department_id IS NOT NULL/);
    expect(MIG_SRC).toMatch(/CREATE INDEX IF NOT EXISTS idx_audit_logs_impersonation[\s\S]*?WHERE impersonation_source_user IS NOT NULL/);
  });

  it("has @rollback annotation", () => {
    expect(MIG_SRC).toMatch(/@rollback:/);
  });

  it("documents WHY each column exists (auditor-facing comments)", () => {
    expect(MIG_SRC).toMatch(/Which department was the user operating in\?/);
    expect(MIG_SRC).toMatch(/What scope did the request resolve to\?/);
    expect(MIG_SRC).toMatch(/Was this an impersonation\?/);
  });
});

describe("IGOC-001 — createAuditLog accepts the 3 new params", () => {
  it("function signature documents the 3 optional fields", () => {
    expect(HELPERS_SRC).toMatch(/activeDepartmentId\?\: number \| null/);
    expect(HELPERS_SRC).toMatch(/resolvedScope\?\: string \| null/);
    expect(HELPERS_SRC).toMatch(/impersonationSourceUser\?\: number \| null/);
  });

  it("INSERT statement includes the 3 new columns", () => {
    expect(HELPERS_SRC).toMatch(/active_department_id[\s\S]*?resolved_scope[\s\S]*?impersonation_source_user/);
  });

  it("params array passes them through with ?? null fallback (back-compat)", () => {
    expect(HELPERS_SRC).toMatch(/params\.activeDepartmentId \?\? null/);
    expect(HELPERS_SRC).toMatch(/params\.resolvedScope \?\? null/);
    expect(HELPERS_SRC).toMatch(/params\.impersonationSourceUser \?\? null/);
  });
});

describe("IGOC-001 — logAudit listener forwards the 3 fields", () => {
  it("INSERT uses all 15 placeholders ($1..$15)", () => {
    expect(LISTENERS_SRC).toMatch(/VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9,\$10,\$11,\$12,\$13,\$14,\$15\)/);
  });

  it("INSERT column list includes the 3 new columns", () => {
    expect(LISTENERS_SRC).toMatch(/"active_role_key","active_department_id","resolved_scope","impersonation_source_user"/);
  });

  it("reads activeDepartmentId/resolvedScope/impersonationSourceUser from payload", () => {
    expect(LISTENERS_SRC).toMatch(/activeDepartmentId = \(payload\.activeDepartmentId as number\) \?\? null/);
    expect(LISTENERS_SRC).toMatch(/resolvedScope = \(payload\.resolvedScope as string\) \?\? null/);
    expect(LISTENERS_SRC).toMatch(/impersonationSourceUser = \(payload\.impersonationSourceUser as number\) \?\? null/);
  });
});

describe("IGOC-001 — RequestScope type extended", () => {
  it("interface RequestScope has activeDepartmentId field", () => {
    expect(AUTHMW_SRC).toMatch(/activeDepartmentId: number \| null/);
  });

  it("interface RequestScope has impersonationSourceUser field", () => {
    expect(AUTHMW_SRC).toMatch(/impersonationSourceUser: number \| null/);
  });

  it("interface RequestScope has optional resolvedScope (set late)", () => {
    expect(AUTHMW_SRC).toMatch(/resolvedScope\?\: string \| null/);
  });

  it("each field carries a JSDoc explaining audit role", () => {
    expect(AUTHMW_SRC).toMatch(/IGOC-001 \(migration 284\): the department/);
    expect(AUTHMW_SRC).toMatch(/IGOC-001 \(migration 284\): when a Super Admin/);
    expect(AUTHMW_SRC).toMatch(/IGOC-001 \(migration 284\): the scope value/);
  });
});

describe("IGOC-001 — authMiddleware populates new scope fields", () => {
  it("SELECT includes ea.\"departmentId\" for active assignment", () => {
    expect(AUTHMW_SRC).toMatch(/ea\."departmentId"/);
  });

  it("return value includes activeDepartmentId", () => {
    expect(AUTHMW_SRC).toMatch(/activeDepartmentId: assignment\.departmentId \?\? null/);
  });

  it("impersonationSourceUser is set when a Super Admin downgrades role", () => {
    expect(AUTHMW_SRC).toMatch(/let impersonationSourceUser: number \| null = null/);
    expect(AUTHMW_SRC).toMatch(/if \(assignment\.role === "owner"\) \{[\s\S]*?impersonationSourceUser = payload\.userId/);
  });

  it("return value includes impersonationSourceUser", () => {
    // buildScope now builds the object into `const scope: RequestScope = {…}`
    // (so HR-REV-1 #1 can attach scope.fineGrants before returning) — the
    // field is still part of the returned scope literal.
    expect(AUTHMW_SRC).toMatch(/const scope: RequestScope = \{[\s\S]*?impersonationSourceUser,/);
  });
});

describe("IGOC-001 — authorize() publishes resolvedScope", () => {
  it("after successful checkAccess, writes grantedScope onto req.scope", () => {
    expect(AUTHORIZE_SRC).toMatch(/result\.diagnostics\?\.grantedScope/);
    expect(AUTHORIZE_SRC).toMatch(/scope\.resolvedScope = result\.diagnostics\.grantedScope/);
  });

  it("publication is gated on diagnostics existing (no NPE)", () => {
    expect(AUTHORIZE_SRC).toMatch(/if \(result\.diagnostics\?\.grantedScope\)/);
  });
});

describe("IGOC-001 — auditMiddleware emits the 3 new fields", () => {
  it("event payload includes activeDepartmentId from scope", () => {
    expect(AUDITMW_SRC).toMatch(/activeDepartmentId: \(scope as any\)\.activeDepartmentId \?\? null/);
  });

  it("event payload includes resolvedScope from scope", () => {
    expect(AUDITMW_SRC).toMatch(/resolvedScope: \(scope as any\)\.resolvedScope \?\? null/);
  });

  it("event payload includes impersonationSourceUser from scope", () => {
    expect(AUDITMW_SRC).toMatch(/impersonationSourceUser: \(scope as any\)\.impersonationSourceUser \?\? null/);
  });
});
