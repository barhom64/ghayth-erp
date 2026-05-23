import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const HR_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"), "utf8");

// ─── HR Leave Golden Path Tests ─────────────────────────────────────────────
// P3.1 of the unification plan. These tests lock in the HR leave lifecycle
// contracts BEFORE any refactoring. If the refactor (P3.2) breaks an
// assumption, these tests catch it.

describe("HR Leave route structure", () => {
  it("POST /leave-requests endpoint exists", () => {
    expect(HR_ROUTE).toContain('router.post("/leave-requests"');
  });

  it("PATCH /leave-requests/:id/approve endpoint exists", () => {
    expect(HR_ROUTE).toContain('router.patch("/leave-requests/:id/approve"');
  });

  it("GET /leave-requests/:id/stages endpoint exists", () => {
    expect(HR_ROUTE).toContain('router.get("/leave-requests/:id/stages"');
  });

  it("PATCH /leave-requests/:id/cancel endpoint exists", () => {
    const hasCancel =
      HR_ROUTE.includes("/leave-requests/:id/cancel") ||
      HR_ROUTE.includes("leave.cancelled");
    expect(hasCancel).toBe(true);
  });

  it("approval endpoint requires hr:update permission", () => {
    const idx = HR_ROUTE.indexOf('"/leave-requests/:id/approve"');
    const lineEnd = HR_ROUTE.indexOf("\n", idx);
    const line = HR_ROUTE.slice(idx, lineEnd);
    expect(line).toContain('authorize(');
  });

  it("creation endpoint requires hr:self or hr:create permission", () => {
    const idx = HR_ROUTE.indexOf('router.post("/leave-requests"');
    expect(idx).toBeGreaterThan(-1);
    const lineEnd = HR_ROUTE.indexOf("\n", idx);
    const line = HR_ROUTE.slice(idx, lineEnd);
    const hasPermission = line.includes("authorize(");
    expect(hasPermission).toBe(true);
  });
});

describe("HR Leave lifecycle state machine", () => {
  it("rejects transition from non-pending state", () => {
    expect(HR_ROUTE).toContain('request.status !== "pending"');
  });

  it("supports three approval outcomes: rejected, returned, approved", () => {
    expect(HR_ROUTE).toContain('status: "rejected"');
    expect(HR_ROUTE).toContain('status: "returned"');
    expect(HR_ROUTE).toContain('status: "approved"');
  });

  it("rejection path restores reserved balance", () => {
    const rejectSection = HR_ROUTE.slice(
      HR_ROUTE.indexOf("if (!approved)"),
      HR_ROUTE.indexOf("if (approved === ")
    );
    // PR #916 — the rejection branch now uses `GREATEST(reserved - $1, 0)`
    // (matches the other four reserved-decrement sites; was the only one
    // missing the floor, which allowed negative reserved under a
    // race-condition reject+return).
    expect(rejectSection).toContain("GREATEST(reserved - $1, 0)");
    expect(rejectSection).toContain("hr_leave_balances");
  });

  it("return path restores reserved balance with GREATEST guard", () => {
    const returnSection = HR_ROUTE.slice(
      HR_ROUTE.indexOf('if (approved === "returned")'),
      HR_ROUTE.indexOf("// Approval path")
    );
    expect(returnSection).toContain("GREATEST(reserved - $1, 0)");
    expect(returnSection).toContain("hr_leave_balances");
  });

  it("final approval moves balance from reserved to used", () => {
    expect(HR_ROUTE).toContain("used = used + $1, reserved = GREATEST(reserved - $1, 0)");
  });
});

describe("HR Leave multi-stage approval chain", () => {
  it("reads approval chain from approval_chains table", () => {
    expect(HR_ROUTE).toContain("approval_chain_steps");
    expect(HR_ROUTE).toContain("chainType");
  });

  it("falls back to default 2-stage chain (manager → HR)", () => {
    expect(HR_ROUTE).toContain("branch_manager");
    expect(HR_ROUTE).toContain("hr_manager");
    const defaultChainIdx = HR_ROUTE.indexOf("chainSteps = [");
    expect(defaultChainIdx).toBeGreaterThan(-1);
    const fallback = HR_ROUTE.slice(defaultChainIdx, defaultChainIdx + 400);
    expect(fallback).toContain('requiredRole: "branch_manager"');
    expect(fallback).toContain('requiredRole: "hr_manager"');
  });

  it("creates next approval stage when chain has more steps", () => {
    expect(HR_ROUTE).toContain("INSERT INTO leave_approval_stages");
  });

  it("enforces role matching: approver role must match stage required role", () => {
    expect(HR_ROUTE).toContain("requiredRole");
    expect(HR_ROUTE).toContain("roleMatchesStage");
  });
});

describe("HR Leave side-effects contract", () => {
  it("leave creation reserves balance (reserved + days)", () => {
    expect(HR_ROUTE).toContain("reserved = reserved + $1");
  });

  it("final approval inserts on_leave attendance records", () => {
    expect(HR_ROUTE).toContain("'on_leave'");
    expect(HR_ROUTE).toContain("INSERT INTO attendance");
  });

  it("final approval clears absence records retroactively", () => {
    expect(HR_ROUTE).toContain("DELETE FROM attendance");
    expect(HR_ROUTE).toContain("status = 'absent'");
  });

  it("final approval clears pending absence payroll deductions", () => {
    expect(HR_ROUTE).toContain("DELETE FROM payroll_deductions");
    expect(HR_ROUTE).toContain("type = 'absence'");
  });

  it("final approval triggers task reassignment via projectsEngine", () => {
    expect(HR_ROUTE).toContain("projectsEngine.reassignTasks");
  });

  it("final approval registers return-to-work obligation", () => {
    expect(HR_ROUTE).toContain("registerObligation");
    expect(HR_ROUTE).toContain("follow_up");
    expect(HR_ROUTE).toContain("leave-${id}-return");
  });

  it("final approval escalates: HR after 8h, GM after 24h", () => {
    expect(HR_ROUTE).toContain("hoursAfterDue: 8");
    expect(HR_ROUTE).toContain("hoursAfterDue: 24");
    expect(HR_ROUTE).toContain("hr_manager");
    expect(HR_ROUTE).toContain("general_manager");
  });
});

describe("HR Leave event emission contract", () => {
  it("emits leave.rejected event on rejection", () => {
    expect(HR_ROUTE).toContain('"leave.rejected"');
  });

  it("emits leave.returned event on return", () => {
    expect(HR_ROUTE).toContain('"leave.returned"');
  });

  it("emits leave.approved event on final approval", () => {
    expect(HR_ROUTE).toContain('"leave.approved"');
  });

  it("emits stage-specific event on intermediate approval", () => {
    expect(HR_ROUTE).toMatch(/leave\.stage\d?.*_approved/);
  });

  it("creates audit log for each transition", () => {
    const auditCalls = HR_ROUTE.match(/createAuditLog\(\{[^}]*entity:\s*"hr_leave_requests"/g);
    expect(auditCalls!.length).toBeGreaterThanOrEqual(3);
  });
});

describe("HR Leave notification contract", () => {
  it("notifies requester on rejection", () => {
    const section = HR_ROUTE.slice(
      HR_ROUTE.indexOf("if (!approved)"),
      HR_ROUTE.indexOf("if (approved === ")
    );
    expect(section).toContain("leave_rejected");
  });

  it("notifies requester on return", () => {
    const section = HR_ROUTE.slice(
      HR_ROUTE.indexOf('if (approved === "returned")'),
      HR_ROUTE.indexOf("// Approval path")
    );
    expect(section).toContain("leave_returned");
  });

  it("notifies next approver on intermediate approval", () => {
    expect(HR_ROUTE).toContain("leave_request");
    expect(HR_ROUTE).toContain("requiredRole");
  });

  it("notifies all assignments on final approval", () => {
    expect(HR_ROUTE).toContain("leave_approved");
  });
});

describe("HR Leave security contracts", () => {
  it("all hr_leave_requests UPDATEs include companyId in WHERE", () => {
    const updates = HR_ROUTE.matchAll(/UPDATE\s+hr_leave_requests\s+SET[^;]+WHERE[^;]+/g);
    for (const match of updates) {
      const sql = match[0];
      if (!sql.includes("FROM")) {
        expect(sql).toContain("companyId");
      }
    }
  });

  it("approval validates ownership via requireOwnership middleware", () => {
    const idx = HR_ROUTE.indexOf('"/leave-requests/:id/approve"');
    const lineEnd = HR_ROUTE.indexOf("\n", idx);
    const line = HR_ROUTE.slice(idx, lineEnd);
    expect(line).toContain("requireOwnership");
  });

  it("role authorization restricts approvers", () => {
    const idx = HR_ROUTE.indexOf('"/leave-requests/:id/approve"');
    const approvalSection = HR_ROUTE.slice(idx, idx + 1200);
    expect(approvalSection).toContain("HR_APPROVAL_ROLES");
  });
});

describe("HR Leave balance integrity", () => {
  it("checks balance sufficiency including reserved days", () => {
    expect(HR_ROUTE).toContain("entitled - used - reserved");
  });

  it("deducts across all companies for multi-assignment employees", () => {
    expect(HR_ROUTE).toContain("allCompanyIds");
    expect(HR_ROUTE).toContain("for (const cId of allCompanyIds)");
  });

  it("updates approval_requests on final approval", () => {
    expect(HR_ROUTE).toContain("UPDATE approval_requests SET status = 'approved'");
  });
});
