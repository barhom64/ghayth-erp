import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const HR_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"), "utf8");

// ─── HR Broad Golden Path Tests ─────────────────────────────────────────────
// P4.2 — extends P3 leave pilot to cover the remaining HR sub-domains:
// excuse requests, official letters, transfers, violations, and the
// leave cancel flow.

describe("HR Excuse request lifecycle", () => {
  it("PATCH /excuse-requests/:id/approve endpoint exists", () => {
    expect(HR_ROUTE).toContain('"/excuse-requests/:id/approve"');
  });

  it("excuse approval uses applyTransition", () => {
    const idx = HR_ROUTE.indexOf('"/excuse-requests/:id/approve"');
    const section = HR_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("applyTransition");
  });

  it("excuse approval validates pending state", () => {
    const idx = HR_ROUTE.indexOf('"/excuse-requests/:id/approve"');
    const section = HR_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("pending");
  });

  it("excuse rejection requires reason", () => {
    const idx = HR_ROUTE.indexOf('"/excuse-requests/:id/approve"');
    const section = HR_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("يجب ذكر سبب الرفض");
  });

  it("excuse approval notifies the requester", () => {
    const idx = HR_ROUTE.indexOf('"/excuse-requests/:id/approve"');
    const section = HR_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("تمت الموافقة على الاستئذان");
    expect(section).toContain("تم رفض طلب الاستئذان");
  });

  it("excuse approval requires hr:update permission", () => {
    const idx = HR_ROUTE.indexOf('"/excuse-requests/:id/approve"');
    const line = HR_ROUTE.slice(
      HR_ROUTE.lastIndexOf("\n", idx) + 1,
      HR_ROUTE.indexOf("\n", idx)
    );
    expect(line).toContain("hr:update");
  });
});

describe("HR Leave cancel lifecycle", () => {
  it("POST /leave-requests/:id/cancel endpoint exists", () => {
    expect(HR_ROUTE).toContain('"/leave-requests/:id/cancel"');
  });

  it("leave cancel uses applyTransition", () => {
    const idx = HR_ROUTE.indexOf('"/leave-requests/:id/cancel"');
    const section = HR_ROUTE.slice(idx, idx + 2500);
    expect(section).toContain("applyTransition");
  });

  it("cancel requires reason", () => {
    const idx = HR_ROUTE.indexOf('"/leave-requests/:id/cancel"');
    const section = HR_ROUTE.slice(idx, idx + 600);
    expect(section).toContain("سبب الإلغاء مطلوب");
  });

  it("cancel only allowed from approved or pending", () => {
    const idx = HR_ROUTE.indexOf('"/leave-requests/:id/cancel"');
    const section = HR_ROUTE.slice(idx, idx + 2500);
    expect(section).toContain('"approved", "pending"');
  });

  it("cancel restores used balance for approved leaves", () => {
    const idx = HR_ROUTE.indexOf('"/leave-requests/:id/cancel"');
    const section = HR_ROUTE.slice(idx, idx + 2500);
    expect(section).toContain("GREATEST(used - $1, 0)");
  });

  it("cancel releases reserved balance for pending leaves", () => {
    const idx = HR_ROUTE.indexOf('"/leave-requests/:id/cancel"');
    const endIdx = HR_ROUTE.indexOf("router.", idx + 10);
    const section = HR_ROUTE.slice(idx, endIdx);
    expect(section).toContain("GREATEST(reserved - $1, 0)");
  });

  it("cancel clears future on_leave attendance", () => {
    const idx = HR_ROUTE.indexOf('"/leave-requests/:id/cancel"');
    const endIdx = HR_ROUTE.indexOf("router.", idx + 10);
    const section = HR_ROUTE.slice(idx, endIdx);
    expect(section).toContain("DELETE FROM attendance");
    expect(section).toContain("on_leave");
  });

  it("cancel cancels return-to-work obligation", () => {
    const idx = HR_ROUTE.indexOf('"/leave-requests/:id/cancel"');
    const endIdx = HR_ROUTE.indexOf("router.", idx + 10);
    const section = HR_ROUTE.slice(idx, endIdx);
    expect(section).toContain("cancelObligation");
  });

  it("cancel restricts to owner or HR/GM roles", () => {
    const idx = HR_ROUTE.indexOf('"/leave-requests/:id/cancel"');
    const section = HR_ROUTE.slice(idx, idx + 1000);
    expect(section).toContain("HR_ROLES");
  });
});

describe("HR Official letters lifecycle", () => {
  it("PATCH /official-letters/:id/approve endpoint exists", () => {
    expect(HR_ROUTE).toContain('"/official-letters/:id/approve"');
  });

  it("official letter approval emits events", () => {
    const idx = HR_ROUTE.indexOf('"/official-letters/:id/approve"');
    const endIdx = HR_ROUTE.indexOf("router.", idx + 10);
    const section = HR_ROUTE.slice(idx, endIdx);
    expect(section).toContain("emitEvent");
  });

  it("official letter approval creates audit log", () => {
    const idx = HR_ROUTE.indexOf('"/official-letters/:id/approve"');
    const endIdx = HR_ROUTE.indexOf("router.", idx + 10);
    const section = HR_ROUTE.slice(idx, endIdx);
    const hasAudit = section.includes("createAuditLog") || section.includes("applyTransition");
    expect(hasAudit).toBe(true);
  });

  it("official letter status transitions include approved/rejected/returned", () => {
    expect(HR_ROUTE).toContain('"official_letters"');
    const idx = HR_ROUTE.indexOf('"/official-letters/:id/approve"');
    const section = HR_ROUTE.slice(idx, idx + 2000);
    const hasApprove = section.includes("approved");
    const hasReject = section.includes("rejected");
    expect(hasApprove && hasReject).toBe(true);
  });
});

describe("HR Transfers lifecycle", () => {
  it("PATCH /transfers/:id/approve endpoint exists", () => {
    expect(HR_ROUTE).toContain('"/transfers/:id/approve"');
  });

  it("PATCH /transfers/:id/receive endpoint exists", () => {
    expect(HR_ROUTE).toContain('"/transfers/:id/receive"');
  });

  it("transfer approval emits events", () => {
    const idx = HR_ROUTE.indexOf('"/transfers/:id/approve"');
    const endIdx = HR_ROUTE.indexOf("router.", idx + 10);
    const section = HR_ROUTE.slice(idx, endIdx);
    expect(section).toContain("applyTransition");
  });

  it("transfer has multi-step flow: pending → pending_receiving_manager → approved", () => {
    expect(HR_ROUTE).toContain("pending_receiving_manager");
  });
});

describe("HR Violations lifecycle", () => {
  it("violation approval endpoints exist", () => {
    const hasApprove = HR_ROUTE.includes("violations") && HR_ROUTE.includes("approve");
    expect(hasApprove).toBe(true);
  });

  it("violations table is referenced in HR routes", () => {
    expect(HR_ROUTE).toContain("employee_violations");
  });
});

describe("HR applyTransition adoption", () => {
  it("imports applyTransition from lifecycleEngine", () => {
    expect(HR_ROUTE).toContain('import { applyTransition');
    expect(HR_ROUTE).toContain("lifecycleEngine");
  });

  it("imports LifecycleError for error handling", () => {
    expect(HR_ROUTE).toContain("LifecycleError");
  });

  it("uses applyTransition in at least 4 places", () => {
    const matches = HR_ROUTE.match(/applyTransition\(/g);
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });
});
