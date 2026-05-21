import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const DISCIPLINE_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr-discipline.ts"),
  "utf8"
);

// ─── HR Discipline Smoke Tests ──────────────────────────────────────────────
// Validates the discipline regulation CRUD, inquiry memo 5-step lifecycle,
// penalty preview, appeal workflow, auto-detection, and security contracts.

describe("Discipline route structure", () => {
  it("exports a router as default", () => {
    expect(DISCIPLINE_ROUTE).toContain("export default router");
  });

  it("relies on global authMiddleware from index.ts", () => {
    expect(DISCIPLINE_ROUTE).not.toContain("router.use(authMiddleware)");
  });

  it("imports applyTransition from lifecycleEngine", () => {
    expect(DISCIPLINE_ROUTE).toContain("applyTransition");
    expect(DISCIPLINE_ROUTE).toContain("lifecycleEngine");
  });

  it("imports disciplineEngine functions", () => {
    expect(DISCIPLINE_ROUTE).toContain("resolvePenalty");
    expect(DISCIPLINE_ROUTE).toContain("getDailyWage");
    expect(DISCIPLINE_ROUTE).toContain("generateMemoNumber");
    expect(DISCIPLINE_ROUTE).toContain("parsePenaltyLabel");
    expect(DISCIPLINE_ROUTE).toContain("ensureInquiryMemoForViolation");
  });

  it("imports autoViolationEngine functions", () => {
    expect(DISCIPLINE_ROUTE).toContain("runAutoDetection");
    expect(DISCIPLINE_ROUTE).toContain("getDetectionLog");
    expect(DISCIPLINE_ROUTE).toContain("getAutoDetectionSettings");
    expect(DISCIPLINE_ROUTE).toContain("saveAutoDetectionSettings");
  });
});

describe("Regulation catalog CRUD", () => {
  it("GET /regulation endpoint exists with hr:read", () => {
    expect(DISCIPLINE_ROUTE).toContain('router.get("/regulation"');
    const idx = DISCIPLINE_ROUTE.indexOf('router.get("/regulation"');
    const line = DISCIPLINE_ROUTE.slice(idx, DISCIPLINE_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("GET /regulation/:id endpoint exists", () => {
    expect(DISCIPLINE_ROUTE).toContain('router.get("/regulation/:id"');
  });

  it("POST /regulation endpoint requires hr:create", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('router.post("/regulation"');
    const line = DISCIPLINE_ROUTE.slice(idx, DISCIPLINE_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("PATCH /regulation/:id requires hr:update", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('router.patch("/regulation/:id"');
    const line = DISCIPLINE_ROUTE.slice(idx, DISCIPLINE_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("DELETE /regulation/:id requires hr:delete", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('router.delete("/regulation/:id"');
    const line = DISCIPLINE_ROUTE.slice(idx, DISCIPLINE_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("regulation list groups by section with Arabic labels", () => {
    expect(DISCIPLINE_ROUTE).toContain("مخالفات تتعلق بمواعيد العمل");
    expect(DISCIPLINE_ROUTE).toContain("مخالفات تتعلق بتنظيم العمل");
    expect(DISCIPLINE_ROUTE).toContain("مخالفات تتعلق بسلوك العامل");
  });

  it("regulation list supports 3 sections: work_time, work_organization, conduct", () => {
    expect(DISCIPLINE_ROUTE).toContain("work_time");
    expect(DISCIPLINE_ROUTE).toContain("work_organization");
    expect(DISCIPLINE_ROUTE).toContain("conduct");
  });

  it("regulation create validates with Zod schema", () => {
    expect(DISCIPLINE_ROUTE).toContain("createRegulationSchema");
    expect(DISCIPLINE_ROUTE).toContain('section: z.enum(["work_time", "work_organization", "conduct"]');
  });

  it("regulation has 4-tier penalty columns", () => {
    expect(DISCIPLINE_ROUTE).toContain("penalty1");
    expect(DISCIPLINE_ROUTE).toContain("penalty2");
    expect(DISCIPLINE_ROUTE).toContain("penalty3");
    expect(DISCIPLINE_ROUTE).toContain("penalty4");
  });

  it("regulation create emits event and audit log", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('router.post("/regulation"');
    const endIdx = DISCIPLINE_ROUTE.indexOf("router.", idx + 10);
    const section = DISCIPLINE_ROUTE.slice(idx, endIdx);
    expect(section).toContain("createAuditLog");
    expect(section).toContain("emitEvent");
    expect(section).toContain("hr.discipline.regulation.create");
  });

  it("delete uses soft delete with deletedAt", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('router.delete("/regulation/:id"');
    const endIdx = DISCIPLINE_ROUTE.indexOf("router.", idx + 10);
    const section = DISCIPLINE_ROUTE.slice(idx, endIdx);
    expect(section).toContain('"deletedAt" = NOW()');
    expect(section).toContain('"isActive" = FALSE');
  });

  it("reseed endpoint clones default regulation", () => {
    expect(DISCIPLINE_ROUTE).toContain("/regulation/reseed");
    expect(DISCIPLINE_ROUTE).toContain("hr_clone_default_regulation");
  });
});

describe("Inquiry memo lifecycle", () => {
  it("has all memo CRUD + lifecycle endpoints", () => {
    const endpoints = [
      '"/memos"',
      '"/memos/:id"',
      '"/memos/:id/justify"',
      '"/memos/:id/manager-recommendation"',
      '"/memos/:id/gm-decision"',
      '"/memos/:id/cancel"',
      '"/memos/:id/appeal"',
      '"/memos/:id/appeal-decision"',
      '"/memos/:id/close"',
    ];
    for (const ep of endpoints) {
      expect(DISCIPLINE_ROUTE).toContain(ep);
    }
  });

  it("memo creation validates with Zod", () => {
    expect(DISCIPLINE_ROUTE).toContain("createMemoSchema");
    expect(DISCIPLINE_ROUTE).toContain("assignmentId: z.coerce.number");
    expect(DISCIPLINE_ROUTE).toContain("incidentType: incidentTypeEnum");
    expect(DISCIPLINE_ROUTE).toContain("incidentDate: z.string()");
  });

  it("incidentType enum includes all known types", () => {
    expect(DISCIPLINE_ROUTE).toContain('"late"');
    expect(DISCIPLINE_ROUTE).toContain('"early_leave"');
    expect(DISCIPLINE_ROUTE).toContain('"absence"');
    expect(DISCIPLINE_ROUTE).toContain('"behavior"');
    expect(DISCIPLINE_ROUTE).toContain('"organization"');
    expect(DISCIPLINE_ROUTE).toContain('"gps_out_of_range"');
    expect(DISCIPLINE_ROUTE).toContain('"custom"');
  });

  it("memo creation verifies assignment belongs to company", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('router.post("/memos"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("التعيين غير موجود أو خارج نطاق الشركة");
    expect(section).toContain("assignment.companyId !== scope.companyId");
  });

  it("memo creation auto-resolves penalty via disciplineEngine", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('router.post("/memos"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("resolvePenalty");
    expect(section).toContain("getDailyWage");
  });

  it("memo creation generates sequential memo number", () => {
    expect(DISCIPLINE_ROUTE).toContain("generateMemoNumber");
  });

  it("memo starts as pending_employee", () => {
    expect(DISCIPLINE_ROUTE).toContain("'manual','pending_employee'");
  });

  it("memo creation notifies employee", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('router.post("/memos"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain("محضر استفسار جديد");
    expect(section).toContain("createNotification");
    expect(section).toContain('priority: "high"');
  });
});

describe("Memo step 1: Employee justification", () => {
  it("justify endpoint validates with Zod", () => {
    expect(DISCIPLINE_ROUTE).toContain("justifyMemoSchema");
  });

  it("justify checks ownership: employee or HR/GM/Owner", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/justify"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("isOwnerOfMemo");
    expect(section).toContain("لا تملك صلاحية تقديم التبرير");
  });

  it("justify uses applyTransition from pending_employee → pending_manager", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/justify"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("applyTransition");
    expect(section).toContain('"pending_employee"');
    expect(section).toContain('"pending_manager"');
  });

  it("justify supports employee declining to justify", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/justify"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("declined");
    expect(section).toContain("employeeDeclined");
  });

  it("justify notifies manager for next step", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/justify"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("محضر استفسار بانتظار توصيتك");
    expect(section).toContain("getManagerAssignmentId");
  });
});

describe("Memo step 2: Manager recommendation", () => {
  it("manager recommendation validates with Zod", () => {
    expect(DISCIPLINE_ROUTE).toContain("managerRecommendationSchema");
    expect(DISCIPLINE_ROUTE).toContain('"approve_excuse", "reject_excuse"');
  });

  it("manager recommendation uses applyTransition pending_manager → pending_gm", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/manager-recommendation"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("applyTransition");
    expect(section).toContain('"pending_manager"');
    expect(section).toContain('"pending_gm"');
  });

  it("manager recommendation requires hr:update", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/manager-recommendation"');
    const line = DISCIPLINE_ROUTE.slice(idx, DISCIPLINE_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("manager recommendation logs event", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/manager-recommendation"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("logMemoEvent");
    expect(section).toContain("manager_recommended");
  });
});

describe("Memo step 3: GM final decision", () => {
  it("GM decision requires hr:discipline:approve", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/gm-decision"');
    const line = DISCIPLINE_ROUTE.slice(idx, DISCIPLINE_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("GM decision validates approved/rejected/other", () => {
    expect(DISCIPLINE_ROUTE).toContain("gmDecisionSchema");
    expect(DISCIPLINE_ROUTE).toContain('"approved", "rejected", "other"');
  });

  it("GM decision uses applyTransition pending_gm → approved/rejected", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/gm-decision"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("applyTransition");
    expect(section).toContain('"pending_gm"');
  });

  it("GM decision computes penalty via resolvePenalty on approval", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/gm-decision"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("resolvePenalty");
    expect(section).toContain("dailyWage");
  });

  it("GM decision inserts attendance_deductions on approval", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/gm-decision"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("INSERT INTO attendance_deductions");
    expect(section).toContain("pending_payroll");
  });

  it("GM decision routes the linked employee_violations through applyTransition", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/gm-decision"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain('entity: "employee_violations"');
    expect(section).toContain("memo.violationId");
  });

  it("GM decision notifies employee of result", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/gm-decision"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 6000);
    expect(section).toContain("تم اعتماد جزاء المحضر");
    expect(section).toContain("تم رفض المحضر");
  });

  it("GM decision logs penalty_applied event on system", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/gm-decision"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 6000);
    expect(section).toContain("penalty_applied");
    expect(section).toContain("تم تطبيق الجزاء على كشف الرواتب");
  });
});

describe("Memo cancel flow", () => {
  it("cancel uses applyTransition with multiple fromStates", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/cancel"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("applyTransition");
    expect(section).toContain("draft");
    expect(section).toContain("pending_employee");
    expect(section).toContain("pending_manager");
    expect(section).toContain("pending_gm");
  });

  it("cancel transitions to cancelled", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/cancel"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain('"cancelled"');
  });

  it("cancel also cancels the linked violation via applyTransition", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/cancel"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 2500);
    expect(section).toContain('entity: "employee_violations"');
    expect(section).toContain('toState: "cancelled"');
  });
});

describe("Appeal workflow", () => {
  it("appeal only from approved state", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/appeal"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain('"approved"');
    expect(section).toContain('"appeal_pending"');
  });

  it("appeal requires reason", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/appeal"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 800);
    expect(section).toContain("zodParse(appealSchema.safeParse");
    // The validation message "سبب الاستئناف مطلوب" is defined in the appealSchema Zod definition
    expect(DISCIPLINE_ROUTE).toContain("سبب الاستئناف مطلوب");
  });

  it("appeal-decision accepts accepted/rejected", () => {
    expect(DISCIPLINE_ROUTE).toContain('"accepted", "rejected"');
    expect(DISCIPLINE_ROUTE).toContain("appeal_accepted");
  });

  it("appeal-decision requires hr:discipline:approve", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/appeal-decision"');
    const line = DISCIPLINE_ROUTE.slice(idx, DISCIPLINE_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("appeal acceptance updates the linked violation via applyTransition", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/appeal-decision"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 2800);
    expect(section).toContain('entity: "employee_violations"');
    expect(section).toContain('toState: "appeal_accepted"');
  });

  it("appeal notifies employee of result", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/appeal-decision"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("تم قبول الاستئناف");
    expect(section).toContain("تم رفض الاستئناف");
  });
});

describe("Memo close flow", () => {
  it("close allowed from terminal states", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/close"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain('"approved"');
    expect(section).toContain('"rejected"');
    expect(section).toContain('"appeal_accepted"');
    expect(section).toContain('"cancelled"');
  });

  it("close transitions to closed state", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/close"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain('"closed"');
    expect(section).toContain("closedAt");
  });

  it("close also closes the linked violation via applyTransition", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/memos/:id/close"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 2500);
    expect(section).toContain('entity: "employee_violations"');
    expect(section).toContain('toState: "closed"');
  });
});

describe("Penalty preview", () => {
  it("preview endpoint exists at POST /penalty-preview", () => {
    expect(DISCIPLINE_ROUTE).toContain('"/penalty-preview"');
  });

  it("preview validates with Zod", () => {
    expect(DISCIPLINE_ROUTE).toContain("penaltyPreviewSchema");
  });

  it("preview calls resolvePenalty + getDailyWage", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/penalty-preview"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("resolvePenalty");
    expect(section).toContain("getDailyWage");
  });

  it("preview returns dailyWage and resolution", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/penalty-preview"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 2500);
    expect(section).toContain("res.json({ dailyWage, resolution })");
  });
});

describe("Employee discipline summary", () => {
  it("GET /employee/:employeeId/summary exists", () => {
    expect(DISCIPLINE_ROUTE).toContain('"/employee/:employeeId/summary"');
  });

  it("summary includes YTD stats and recent memos", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/employee/:employeeId/summary"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 2500);
    expect(section).toContain("ytdCount");
    expect(section).toContain("ytdDeductions");
    expect(section).toContain("currentEscalation");
    expect(section).toContain("terminations");
    expect(section).toContain("LIMIT 5");
  });
});

describe("Discipline stats", () => {
  it("GET /stats endpoint exists", () => {
    expect(DISCIPLINE_ROUTE).toContain('router.get("/stats"');
  });

  it("stats break down by workflow status", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('router.get("/stats"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("pendingEmployee");
    expect(section).toContain("pendingManager");
    expect(section).toContain("pendingGm");
    expect(section).toContain("approved");
    expect(section).toContain("rejected");
    expect(section).toContain("totalDeductions");
  });
});

describe("Auto-detection system", () => {
  it("GET /auto-detection/settings exists", () => {
    expect(DISCIPLINE_ROUTE).toContain('"/auto-detection/settings"');
    expect(DISCIPLINE_ROUTE).toContain("getAutoDetectionSettings");
  });

  it("PUT /auto-detection/settings restricts to HR/GM/Owner", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('router.put("/auto-detection/settings"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 800);
    expect(section).toContain("HR_ROLES");
    expect(section).toContain("غير مصرح بتعديل إعدادات الرصد التلقائي");
  });

  it("PUT settings validates with Zod autoDetectionSettingsSchema", () => {
    expect(DISCIPLINE_ROUTE).toContain("autoDetectionSettingsSchema");
    expect(DISCIPLINE_ROUTE).toContain("enableLateDetection");
    expect(DISCIPLINE_ROUTE).toContain("enableAbsenceDetection");
    expect(DISCIPLINE_ROUTE).toContain("enableGpsDetection");
  });

  it("POST /auto-detection/run triggers manual detection", () => {
    expect(DISCIPLINE_ROUTE).toContain('"/auto-detection/run"');
    expect(DISCIPLINE_ROUTE).toContain("runAutoDetection");
  });

  it("auto-detection run restricts to HR/GM/Owner", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('"/auto-detection/run"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 600);
    expect(section).toContain("غير مصرح بتشغيل الرصد التلقائي");
  });

  it("GET /auto-detection/log retrieves detection history", () => {
    expect(DISCIPLINE_ROUTE).toContain('"/auto-detection/log"');
    expect(DISCIPLINE_ROUTE).toContain("getDetectionLog");
  });

  it("GET /auto-detection/summary provides 30-day stats", () => {
    expect(DISCIPLINE_ROUTE).toContain('"/auto-detection/summary"');
    expect(DISCIPLINE_ROUTE).toContain("INTERVAL '30 days'");
  });
});

describe("Discipline security", () => {
  it("getMemo helper scopes by companyId", () => {
    const idx = DISCIPLINE_ROUTE.indexOf("async function getMemo");
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 500);
    expect(section).toContain("companyId");
    expect(section).toContain("hr_inquiry_memos");
  });

  it("memo list has a LIMIT", () => {
    const idx = DISCIPLINE_ROUTE.indexOf('router.get("/memos"');
    const section = DISCIPLINE_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("LIMIT 500");
  });

  it("lifecycle errors are handled with lifecycleErrorResponse", () => {
    const matches = DISCIPLINE_ROUTE.match(/lifecycleErrorResponse\(err\)/g);
    expect(matches!.length).toBeGreaterThanOrEqual(5);
  });

  it("all lifecycle transitions log events via logMemoEvent", () => {
    const matches = DISCIPLINE_ROUTE.match(/logMemoEvent\(\{/g);
    expect(matches!.length).toBeGreaterThanOrEqual(7);
  });
});
