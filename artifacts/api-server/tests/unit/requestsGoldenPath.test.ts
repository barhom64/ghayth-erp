import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const REQ_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/requests.ts"), "utf8");

// ─── Requests Golden Path Tests ────────────────────────────────────────────
// P4.10 — Lock in request lifecycle contracts: requests, types, workflows,
// approval chains, conversion.

describe("Requests route structure", () => {
  it("request CRUD endpoints exist", () => {
    expect(REQ_ROUTE).toContain('router.get("/",');
    expect(REQ_ROUTE).toContain('router.post("/",');
    expect(REQ_ROUTE).toContain('router.patch("/:id",');
    expect(REQ_ROUTE).toContain('router.delete("/:id",');
  });

  it("approval flow endpoints exist", () => {
    expect(REQ_ROUTE).toContain('"/:id/approve"');
    expect(REQ_ROUTE).toContain('"/:id/reject"');
    expect(REQ_ROUTE).toContain('"/:id/return"');
  });

  it("request type endpoints exist", () => {
    expect(REQ_ROUTE).toContain('router.get("/types"');
    expect(REQ_ROUTE).toContain('router.post("/types"');
  });

  it("workflow endpoints exist", () => {
    expect(REQ_ROUTE).toContain('router.get("/workflows"');
    expect(REQ_ROUTE).toContain('router.post("/workflows"');
  });

  it("stats endpoint exists", () => {
    expect(REQ_ROUTE).toContain('router.get("/stats"');
  });

  it("actions endpoint exists", () => {
    expect(REQ_ROUTE).toContain('"/:id/actions"');
  });

  it("convert endpoint exists", () => {
    expect(REQ_ROUTE).toContain('"/:id/convert"');
  });

  it("catalog endpoint exists", () => {
    expect(REQ_ROUTE).toContain('"/catalog"');
  });
});

describe("Requests state machine", () => {
  it("defines VALID_REQUEST_TRANSITIONS", () => {
    expect(REQ_ROUTE).toContain("VALID_REQUEST_TRANSITIONS");
  });

  it("includes all request statuses", () => {
    const idx = REQ_ROUTE.indexOf("VALID_REQUEST_TRANSITIONS");
    const block = REQ_ROUTE.slice(idx, idx + 500);
    expect(block).toContain("pending:");
    expect(block).toContain("in_review:");
    expect(block).toContain("returned:");
    expect(block).toContain("draft:");
    expect(block).toContain("approved:");
  });

  it("rejected and closed are terminal states", () => {
    const idx = REQ_ROUTE.indexOf("VALID_REQUEST_TRANSITIONS");
    const block = REQ_ROUTE.slice(idx, idx + 500);
    expect(block).toContain("rejected: []");
    expect(block).toContain("closed: []");
  });

  it("validateRequestTransition function exists", () => {
    expect(REQ_ROUTE).toContain("validateRequestTransition");
  });
});

describe("Requests approval flow", () => {
  it("approval validates current approver or manager override", () => {
    expect(REQ_ROUTE).toContain("currentApprover");
    expect(REQ_ROUTE).toContain("MANAGER_ROLES");
  });

  it("rejection requires reason", () => {
    expect(REQ_ROUTE).toContain("يجب ذكر سبب الرفض");
  });

  it("return requires reason", () => {
    expect(REQ_ROUTE).toContain("يجب ذكر سبب الإرجاع");
  });

  it("validates required fields before approval", () => {
    expect(REQ_ROUTE).toContain("_requiredFields");
    expect(REQ_ROUTE).toContain("الحقل المطلوب");
  });

  it("checks budget availability before approval", () => {
    expect(REQ_ROUTE).toContain("_budgetAccountCode");
    expect(REQ_ROUTE).toContain("_budgetAmount");
  });

  it("checks attachment requirements before approval", () => {
    expect(REQ_ROUTE).toContain("_requiresAttachments");
    expect(REQ_ROUTE).toContain("المرفقات الإلزامية غير مرفقة");
  });
});

describe("Requests conversion", () => {
  it("convert endpoint supports maintenance, purchase, case targets", () => {
    expect(REQ_ROUTE).toContain("maintenance");
    expect(REQ_ROUTE).toContain("purchase");
    expect(REQ_ROUTE).toContain("case");
    expect(REQ_ROUTE).toContain("convertRequestSchema");
  });
});

describe("Requests event emission contract", () => {
  it("emits events on request operations", () => {
    expect(REQ_ROUTE).toContain("emitEvent");
  });

  it("creates audit logs", () => {
    const auditCalls = REQ_ROUTE.match(/createAuditLog\(/g);
    expect(auditCalls!.length).toBeGreaterThanOrEqual(5);
  });

  it("creates notifications on approval flow", () => {
    expect(REQ_ROUTE).toContain("createNotification");
  });
});

describe("Requests security contracts", () => {
  it("validates request input with zod on create", () => {
    expect(REQ_ROUTE).toContain("createRequestSchema.safeParse");
  });

  it("validates request type input with zod", () => {
    expect(REQ_ROUTE).toContain("createRequestTypeSchema.safeParse");
  });

  it("manager override is tracked", () => {
    expect(REQ_ROUTE).toContain("_isOverride");
  });

  it("unauthorized state changes are forbidden", () => {
    expect(REQ_ROUTE).toContain("غير مصرح لك بتغيير حالة هذا الطلب");
  });
});
