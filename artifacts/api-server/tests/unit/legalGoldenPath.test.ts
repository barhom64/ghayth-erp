import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const LEGAL_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/legal.ts"), "utf8");

// ─── Legal Golden Path Tests ───────────────────────────────────────────────
// P4.7 — Lock in legal domain lifecycle contracts: contracts, cases,
// sessions, correspondence, judgments.

describe("Legal route structure", () => {
  it("contract CRUD endpoints exist", () => {
    expect(LEGAL_ROUTE).toContain('router.get("/contracts"');
    expect(LEGAL_ROUTE).toContain('router.post("/contracts"');
    expect(LEGAL_ROUTE).toContain('router.patch("/contracts/:id"');
    expect(LEGAL_ROUTE).toContain('router.delete("/contracts/:id"');
  });

  it("contract lifecycle endpoints exist", () => {
    expect(LEGAL_ROUTE).toContain('"/contracts/:id/renew"');
    expect(LEGAL_ROUTE).toContain('"/contracts/:id/terminate"');
  });

  it("contract renewal alerts endpoint exists", () => {
    expect(LEGAL_ROUTE).toContain('"/contracts/renewal-alerts"');
  });

  it("case CRUD endpoints exist", () => {
    expect(LEGAL_ROUTE).toContain('router.get("/cases"');
    expect(LEGAL_ROUTE).toContain('router.post("/cases"');
    expect(LEGAL_ROUTE).toContain('router.patch("/cases/:id"');
    expect(LEGAL_ROUTE).toContain('router.delete("/cases/:id"');
  });

  it("case close endpoint exists", () => {
    expect(LEGAL_ROUTE).toContain('"/cases/:id/close"');
  });

  it("session endpoints exist", () => {
    expect(LEGAL_ROUTE).toContain('"/cases/:caseId/sessions"');
  });

  it("correspondence endpoints exist", () => {
    expect(LEGAL_ROUTE).toContain('"/cases/:caseId/correspondence"');
  });

  it("judgment endpoints exist", () => {
    expect(LEGAL_ROUTE).toContain('"/cases/:caseId/judgments"');
  });

  it("stats endpoint exists", () => {
    expect(LEGAL_ROUTE).toContain('router.get("/stats"');
  });

  it("financial report endpoint exists", () => {
    expect(LEGAL_ROUTE).toContain('"/financial-report"');
  });
});

describe("Legal contract state machine", () => {
  it("defines CONTRACT_STATUSES", () => {
    expect(LEGAL_ROUTE).toContain("CONTRACT_STATUSES");
    expect(LEGAL_ROUTE).toContain('"draft"');
    expect(LEGAL_ROUTE).toContain('"active"');
    expect(LEGAL_ROUTE).toContain('"expired"');
    expect(LEGAL_ROUTE).toContain('"terminated"');
    expect(LEGAL_ROUTE).toContain('"renewed"');
  });

  it("defines LEGAL_CONTRACT_TRANSITIONS", () => {
    expect(LEGAL_ROUTE).toContain("LEGAL_CONTRACT_TRANSITIONS");
    const idx = LEGAL_ROUTE.indexOf("LEGAL_CONTRACT_TRANSITIONS");
    const block = LEGAL_ROUTE.slice(idx, idx + 400);
    expect(block).toContain("draft:");
    expect(block).toContain("active:");
  });

  it("expired, terminated, renewed are terminal contract states", () => {
    const idx = LEGAL_ROUTE.indexOf("LEGAL_CONTRACT_TRANSITIONS");
    const block = LEGAL_ROUTE.slice(idx, idx + 600);
    expect(block).toContain("expired:    []");
    expect(block).toContain("terminated: []");
    expect(block).toContain("renewed:    []");
  });

  it("PATCH refuses lifecycle transitions (use /renew, /terminate)", () => {
    const idx = LEGAL_ROUTE.indexOf('router.patch("/contracts/:id"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("terminated");
    expect(section).toContain("renewed");
    expect(section).toContain("expired");
    expect(section).toContain("/contracts/:id/renew");
  });
});

describe("Legal case state machine", () => {
  it("defines CASE_STATUSES and VALID_CASE_TRANSITIONS", () => {
    expect(LEGAL_ROUTE).toContain("CASE_STATUSES");
    expect(LEGAL_ROUTE).toContain("VALID_CASE_TRANSITIONS");
  });

  it("case statuses: open, in_progress, judgment, execution, closed", () => {
    const idx = LEGAL_ROUTE.indexOf("CASE_STATUSES");
    const line = LEGAL_ROUTE.slice(idx, LEGAL_ROUTE.indexOf("\n", idx));
    expect(line).toContain("open");
    expect(line).toContain("in_progress");
    expect(line).toContain("judgment");
    expect(line).toContain("execution");
    expect(line).toContain("closed");
  });

  it("closed is a terminal case state", () => {
    const idx = LEGAL_ROUTE.indexOf("VALID_CASE_TRANSITIONS");
    const block = LEGAL_ROUTE.slice(idx, idx + 400);
    expect(block).toContain("closed:      []");
  });

  it("validates case status transitions in PATCH", () => {
    const idx = LEGAL_ROUTE.indexOf('router.patch("/cases/:id"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("VALID_CASE_TRANSITIONS");
  });
});

describe("Legal contract renew lifecycle", () => {
  it("renew uses applyTransition", () => {
    const idx = LEGAL_ROUTE.indexOf('"/contracts/:id/renew"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("applyTransition");
  });

  it("renew requires newEndDate", () => {
    const idx = LEGAL_ROUTE.indexOf('"/contracts/:id/renew"');
    const section = LEGAL_ROUTE.slice(idx, idx + 500);
    expect(section).toContain("تاريخ نهاية التجديد مطلوب");
  });

  it("renew increments renewalCount", () => {
    const idx = LEGAL_ROUTE.indexOf('"/contracts/:id/renew"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("renewalCount");
  });

  it("renew emits legal.contract.renewed event", () => {
    const idx = LEGAL_ROUTE.indexOf('"/contracts/:id/renew"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain('"legal.contract.renewed"');
  });
});

describe("Legal contract terminate lifecycle", () => {
  it("terminate uses applyTransition", () => {
    const idx = LEGAL_ROUTE.indexOf('"/contracts/:id/terminate"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("applyTransition");
  });

  it("terminate requires reason", () => {
    const idx = LEGAL_ROUTE.indexOf('"/contracts/:id/terminate"');
    const section = LEGAL_ROUTE.slice(idx, idx + 500);
    expect(section).toContain("سبب إنهاء العقد مطلوب");
  });

  it("terminate emits legal.contract.terminated event", () => {
    const idx = LEGAL_ROUTE.indexOf('"/contracts/:id/terminate"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain('"legal.contract.terminated"');
  });

  it("terminate sets terminationDate and terminationReason", () => {
    const idx = LEGAL_ROUTE.indexOf('"/contracts/:id/terminate"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("terminationDate");
    expect(section).toContain("terminationReason");
  });
});

describe("Legal case close lifecycle", () => {
  it("close endpoint uses applyTransition", () => {
    const idx = LEGAL_ROUTE.indexOf('"/cases/:id/close"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("applyTransition");
    expect(section).toContain('"legal.case.closed"');
  });

  it("close requires closureReason", () => {
    const idx = LEGAL_ROUTE.indexOf('"/cases/:id/close"');
    const section = LEGAL_ROUTE.slice(idx, idx + 800);
    expect(section).toContain("سبب الإغلاق مطلوب");
  });

  it("close cancels outstanding obligations", () => {
    const idx = LEGAL_ROUTE.indexOf('"/cases/:id/close"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("cancelObligation");
  });

  it("close guards state via applyTransition fromStates", () => {
    const idx = LEGAL_ROUTE.indexOf('"/cases/:id/close"');
    const section = LEGAL_ROUTE.slice(idx, idx + 1200);
    expect(section).toContain("fromStates");
    expect(section).toContain("lifecycleErrorResponse");
  });
});

describe("Legal session lifecycle", () => {
  it("session auto-advances case from open to in_progress", () => {
    const idx = LEGAL_ROUTE.indexOf('router.post("/cases/:caseId/sessions"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("in_progress");
    expect(section).toContain("open");
  });

  it("session registers hearing obligation", () => {
    const idx = LEGAL_ROUTE.indexOf('router.post("/cases/:caseId/sessions"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("registerObligation");
    expect(section).toContain("hearing");
  });

  it("session notifies the lawyer", () => {
    const idx = LEGAL_ROUTE.indexOf('router.post("/cases/:caseId/sessions"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("createNotification");
    expect(section).toContain("legal_session");
  });

  it("session calculates distance to court", () => {
    const idx = LEGAL_ROUTE.indexOf('router.post("/cases/:caseId/sessions"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("haversineKm");
  });
});

describe("Legal obligation management", () => {
  it("imports obligation engine functions", () => {
    expect(LEGAL_ROUTE).toContain("registerObligation");
    expect(LEGAL_ROUTE).toContain("cancelObligation");
    expect(LEGAL_ROUTE).toContain("markObligationMet");
  });

  it("session creates escalation steps for hearing obligations", () => {
    expect(LEGAL_ROUTE).toContain("lawyer");
    expect(LEGAL_ROUTE).toContain("legal_manager");
  });
});

describe("Legal event emission contract", () => {
  it("emits legal.contract.created on contract creation", () => {
    expect(LEGAL_ROUTE).toContain('"legal.contract.created"');
  });

  it("emits events on contract status changes", () => {
    expect(LEGAL_ROUTE).toContain('"legal.contract.status_changed"');
  });

  it("emits events on contract updates", () => {
    expect(LEGAL_ROUTE).toContain('"legal.contract.updated"');
  });

  it("creates audit logs systematically", () => {
    const auditCalls = LEGAL_ROUTE.match(/createAuditLog\(/g);
    expect(auditCalls!.length).toBeGreaterThanOrEqual(10);
  });
});

describe("Legal security contracts", () => {
  it("contract list includes companyId scoping", () => {
    const idx = LEGAL_ROUTE.indexOf('router.get("/contracts"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("companyId");
  });

  it("contract list filters deletedAt IS NULL", () => {
    const idx = LEGAL_ROUTE.indexOf('router.get("/contracts"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain('"deletedAt" IS NULL');
  });

  it("case list filters deletedAt IS NULL", () => {
    const idx = LEGAL_ROUTE.indexOf('router.get("/cases"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain('"deletedAt" IS NULL');
  });

  it("validates contract input with zod on create", () => {
    expect(LEGAL_ROUTE).toContain("createContractSchema.safeParse");
  });

  it("validates case input with zod on create", () => {
    expect(LEGAL_ROUTE).toContain("createCaseSchema.safeParse");
  });

  it("validates session input with zod on create", () => {
    expect(LEGAL_ROUTE).toContain("createSessionSchema.safeParse");
  });

  it("prevents deleting active contracts", () => {
    const idx = LEGAL_ROUTE.indexOf('router.delete("/contracts/:id"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("لا يمكن حذف عقد نشط");
  });

  it("checks duplicate contract ref on create", () => {
    const idx = LEGAL_ROUTE.indexOf('router.post("/contracts"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("مرجع العقد مسجل مسبقاً");
  });

  it("prevents adding sessions to closed cases", () => {
    const idx = LEGAL_ROUTE.indexOf('router.post("/cases/:caseId/sessions"');
    const endIdx = LEGAL_ROUTE.indexOf("router.", idx + 10);
    const section = LEGAL_ROUTE.slice(idx, endIdx);
    expect(section).toContain("لا يمكن إضافة جلسات لقضية مغلقة");
  });
});

describe("Legal lifecycle integration", () => {
  it("imports applyTransition from lifecycleEngine", () => {
    expect(LEGAL_ROUTE).toContain("applyTransition");
    expect(LEGAL_ROUTE).toContain("lifecycleEngine");
  });

  it("uses lifecycleErrorResponse for applyTransition errors", () => {
    expect(LEGAL_ROUTE).toContain("lifecycleErrorResponse");
  });

  it("case detail response includes allowedTransitions", () => {
    expect(LEGAL_ROUTE).toContain("allowedTransitions");
    expect(LEGAL_ROUTE).toContain("VALID_CASE_TRANSITIONS[row.status]");
  });
});
