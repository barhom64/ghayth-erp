import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const CRM_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/crm.ts"), "utf8");

// ─── CRM Golden Path Tests ──────────────────────────────────────────────────
// P4.3 of the unification plan. Lock in CRM opportunity lifecycle contracts.

describe("CRM route structure", () => {
  it("POST /opportunities endpoint exists", () => {
    expect(CRM_ROUTE).toContain('router.post("/opportunities"');
  });

  it("PATCH /opportunities/:id endpoint exists", () => {
    expect(CRM_ROUTE).toContain('router.patch("/opportunities/:id"');
  });

  it("DELETE /opportunities/:id endpoint exists", () => {
    expect(CRM_ROUTE).toContain('router.delete("/opportunities/:id"');
  });

  it("POST /opportunities/:id/convert endpoint exists", () => {
    expect(CRM_ROUTE).toContain('"/opportunities/:id/convert"');
  });

  it("POST /opportunities/:id/activities endpoint exists", () => {
    expect(CRM_ROUTE).toContain('"/opportunities/:id/activities"');
  });

  it("GET /pipeline endpoint exists", () => {
    expect(CRM_ROUTE).toContain('"/pipeline"');
  });

  it("GET /analytics and /stats endpoints exist", () => {
    expect(CRM_ROUTE).toContain('"/analytics"');
    expect(CRM_ROUTE).toContain('"/stats"');
  });
});

describe("CRM stage state machine", () => {
  it("defines CRM_TRANSITIONS constant", () => {
    expect(CRM_ROUTE).toContain("CRM_TRANSITIONS");
  });

  it("defines STAGE_ORDER with all stages", () => {
    expect(CRM_ROUTE).toContain("STAGE_ORDER");
    expect(CRM_ROUTE).toContain("lead");
    expect(CRM_ROUTE).toContain("qualified");
    expect(CRM_ROUTE).toContain("proposal");
    expect(CRM_ROUTE).toContain("negotiation");
    expect(CRM_ROUTE).toContain("closed_won");
    expect(CRM_ROUTE).toContain("closed_lost");
  });

  it("closed_won is a terminal stage", () => {
    const idx = CRM_ROUTE.indexOf("CRM_TRANSITIONS");
    const block = CRM_ROUTE.slice(idx, idx + 600);
    expect(block).toContain("closed_won:  []");
  });

  it("closed_lost can reopen to qualified", () => {
    const idx = CRM_ROUTE.indexOf("CRM_TRANSITIONS");
    const block = CRM_ROUTE.slice(idx, idx + 600);
    const lostIdx = block.indexOf("closed_lost:");
    const lostLine = block.slice(lostIdx, block.indexOf("\n", lostIdx));
    expect(lostLine).toContain("qualified");
  });

  it("rejects illegal stage transitions with ConflictError", () => {
    const idx = CRM_ROUTE.indexOf("CRM_TRANSITIONS[existing.stage]");
    const section = CRM_ROUTE.slice(idx, idx + 600);
    expect(section).toContain("ConflictError");
    expect(section).toContain("allowedNext");
  });

  it("validates stage is in STAGE_ORDER", () => {
    expect(CRM_ROUTE).toContain("STAGE_ORDER.includes(b.stage)");
  });
});

describe("CRM deal won side-effects", () => {
  it("calls handleDealWon on closed_won transition", () => {
    expect(CRM_ROUTE).toContain("handleDealWon");
    expect(CRM_ROUTE).toContain("closed_won");
  });

  it("creates or resolves client on deal won", () => {
    const idx = CRM_ROUTE.indexOf("function handleDealWon");
    expect(idx).toBeGreaterThan(-1);
    const section = CRM_ROUTE.slice(idx, idx + 1000);
    expect(section).toContain("INSERT INTO clients");
  });

  it("requests legal contract creation", () => {
    expect(CRM_ROUTE).toContain("requestLegalContractCreation");
  });

  it("creates invoice on deal won", () => {
    expect(CRM_ROUTE).toContain("INV-CRM-");
  });

  it("marks follow-up obligation as met on won", () => {
    expect(CRM_ROUTE).toContain("markObligationMet");
  });

  it("cancels obligation on deal lost", () => {
    const patchIdx = CRM_ROUTE.indexOf('router.patch("/opportunities/:id"');
    const endIdx = CRM_ROUTE.indexOf("router.", patchIdx + 10);
    const section = CRM_ROUTE.slice(patchIdx, endIdx);
    expect(section).toContain("closed_lost");
    expect(section).toContain("cancelObligation");
  });
});

describe("CRM deal lost side-effects", () => {
  it("records loss analysis activity", () => {
    expect(CRM_ROUTE).toContain("تحليل خسارة");
  });

  it("requires client info before closing a deal", () => {
    expect(CRM_ROUTE).toContain("لا يمكن إغلاق الصفقة بدون بيانات العميل");
  });
});

describe("CRM convert endpoint", () => {
  it("uses applyTransition for conversion", () => {
    const idx = CRM_ROUTE.indexOf('"/opportunities/:id/convert"');
    const endIdx = CRM_ROUTE.indexOf("router.", idx + 10);
    const section = CRM_ROUTE.slice(idx, endIdx);
    expect(section).toContain("applyTransition");
  });

  it("prevents double conversion", () => {
    expect(CRM_ROUTE).toContain("convertedAt");
    expect(CRM_ROUTE).toContain("تم تحويل هذه الفرصة مسبقاً");
  });

  it("sets stage to closed_won and records convertedAt", () => {
    const idx = CRM_ROUTE.indexOf('"/opportunities/:id/convert"');
    const endIdx = CRM_ROUTE.indexOf("router.", idx + 10);
    const section = CRM_ROUTE.slice(idx, endIdx);
    expect(section).toContain('stage: "closed_won"');
    expect(section).toContain("convertedAt");
  });
});

describe("CRM obligation management", () => {
  it("registers follow-up obligation on stage change", () => {
    expect(CRM_ROUTE).toContain("registerObligation");
    expect(CRM_ROUTE).toContain("crm_opportunity");
  });

  it("refreshes obligation on non-terminal stage transitions", () => {
    expect(CRM_ROUTE).toContain("cancelObligation");
    expect(CRM_ROUTE).toContain("registerObligation");
  });

  it("escalation steps: sales_manager 24h, general_manager 72h", () => {
    expect(CRM_ROUTE).toContain("sales_manager");
    expect(CRM_ROUTE).toContain("general_manager");
    expect(CRM_ROUTE).toContain("hoursAfterDue: 24");
    expect(CRM_ROUTE).toContain("hoursAfterDue: 72");
  });
});

describe("CRM event emission contract", () => {
  it("emits crm.deal.won on closed_won", () => {
    expect(CRM_ROUTE).toContain('"crm.deal.won"');
  });

  it("emits crm.deal.lost on closed_lost", () => {
    expect(CRM_ROUTE).toContain('"crm.deal.lost"');
  });

  it("emits crm.opportunity.stage_changed on non-terminal transitions", () => {
    expect(CRM_ROUTE).toContain('"crm.opportunity.stage_changed"');
  });

  it("emits crm.opportunity.updated on non-stage field changes", () => {
    expect(CRM_ROUTE).toContain('"crm.opportunity.updated"');
  });

  it("emits crm.opportunity.created on creation", () => {
    expect(CRM_ROUTE).toContain('"crm.opportunity.created"');
  });

  it("emits crm.opportunity.deleted on soft delete", () => {
    expect(CRM_ROUTE).toContain('"crm.opportunity.deleted"');
  });

  it("emits crm.opportunity.converted on convert", () => {
    expect(CRM_ROUTE).toContain('"crm.opportunity.converted"');
  });
});

describe("CRM auto-actions contract", () => {
  it("creates auto follow-up activity on stage change", () => {
    expect(CRM_ROUTE).toContain("STAGE_AUTO_ACTIONS");
    expect(CRM_ROUTE).toContain("followUpDays");
  });

  it("creates escalation activity on proposal stage", () => {
    expect(CRM_ROUTE).toContain("escalation");
    expect(CRM_ROUTE).toContain("proposal");
  });

  it("notifies assigned employee on stage change", () => {
    expect(CRM_ROUTE).toContain("crm_stage_change");
    expect(CRM_ROUTE).toContain("تحديث مرحلة");
  });
});

describe("CRM security contracts", () => {
  it("all opportunity queries include companyId", () => {
    const updates = CRM_ROUTE.matchAll(
      /UPDATE\s+crm_opportunities\s+SET[^;]+WHERE[^;]+/g
    );
    for (const match of updates) {
      expect(match[0]).toContain("companyId");
    }
  });

  it("soft delete uses deletedAt=NOW()", () => {
    const deleteIdx = CRM_ROUTE.indexOf('router.delete("/opportunities/:id"');
    const endIdx = CRM_ROUTE.indexOf("router.", deleteIdx + 10);
    const section = CRM_ROUTE.slice(deleteIdx, endIdx);
    expect(section).toContain('"deletedAt"=NOW()');
    expect(section).not.toContain("DELETE FROM crm_opportunities");
  });

  it("opportunity list filters deletedAt IS NULL", () => {
    const listIdx = CRM_ROUTE.indexOf('router.get("/opportunities"');
    const endIdx = CRM_ROUTE.indexOf("router.", listIdx + 10);
    const section = CRM_ROUTE.slice(listIdx, endIdx);
    expect(section).toContain('"deletedAt" IS NULL');
  });

  it("validates input with zod on create", () => {
    expect(CRM_ROUTE).toContain("createOpportunitySchema.safeParse");
  });

  it("pre-validates clientId FK before insert", () => {
    const idx = CRM_ROUTE.indexOf('router.post("/opportunities"');
    const endIdx = CRM_ROUTE.indexOf("router.", idx + 10);
    const section = CRM_ROUTE.slice(idx, endIdx);
    expect(section).toContain("العميل المحدد غير موجود");
  });

  it("pre-validates assignedTo FK before insert", () => {
    const idx = CRM_ROUTE.indexOf('router.post("/opportunities"');
    const endIdx = CRM_ROUTE.indexOf("router.", idx + 10);
    const section = CRM_ROUTE.slice(idx, endIdx);
    expect(section).toContain("assignedTo");
    expect(section).toContain("employee_assignments");
  });
});

describe("CRM audit log contract", () => {
  it("creates audit log on opportunity creation", () => {
    const idx = CRM_ROUTE.indexOf('router.post("/opportunities"');
    const endIdx = CRM_ROUTE.indexOf("router.", idx + 10);
    const section = CRM_ROUTE.slice(idx, endIdx);
    expect(section).toContain("createAuditLog");
    expect(section).toContain('"crm_opportunities"');
  });

  it("creates audit log on opportunity update with field diff", () => {
    const idx = CRM_ROUTE.indexOf('router.patch("/opportunities/:id"');
    const endIdx = CRM_ROUTE.indexOf("router.", idx + 10);
    const section = CRM_ROUTE.slice(idx, endIdx);
    expect(section).toContain("createAuditLog");
    expect(section).toContain("changedFields");
  });

  it("creates audit log on opportunity deletion", () => {
    const idx = CRM_ROUTE.indexOf('router.delete("/opportunities/:id"');
    const endIdx = CRM_ROUTE.indexOf("router.", idx + 10);
    const section = CRM_ROUTE.slice(idx, endIdx);
    expect(section).toContain("createAuditLog");
  });

  it("tracks changed fields with before/after diff", () => {
    expect(CRM_ROUTE).toContain("trackedKeys");
    expect(CRM_ROUTE).toContain("changedFields");
  });
});
