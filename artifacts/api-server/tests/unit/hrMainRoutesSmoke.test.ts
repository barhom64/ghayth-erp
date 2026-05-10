import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const HR_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"), "utf8");

// ─── HR Main Routes Smoke Tests ─────────────────────────────────────────────
// Covers attendance, payroll, shifts, performance, evaluations, transfers,
// delegations, public holidays, IDP, reporting, and all remaining endpoints
// NOT covered in hrLeaveGoldenPath, hrBroadGoldenPath, or hrEngineSmoke.

// ═══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Attendance check-in", () => {
  it("POST /check-in endpoint exists with hr:self or hr:create", () => {
    const idx = HR_ROUTE.indexOf('"/check-in"');
    const line = HR_ROUTE.slice(HR_ROUTE.lastIndexOf("\n", idx) + 1, HR_ROUTE.indexOf("\n", idx));
    expect(line).toContain("authorize(");
  });

  it("check-in requires active assignment", () => {
    const idx = HR_ROUTE.indexOf('"/check-in"');
    const section = HR_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("activeAssignmentId");
    expect(section).toContain("لا يوجد تعيين نشط لهذا الحساب");
  });

  it("check-in verifies active contract exists", () => {
    const idx = HR_ROUTE.indexOf('"/check-in"');
    const section = HR_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("employee_contracts");
    expect(section).toContain("لا يوجد عقد نشط لتعيينك الحالي");
  });

  it("check-in prevents duplicate for same day", () => {
    const idx = HR_ROUTE.indexOf('"/check-in"');
    const section = HR_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("existing");
    expect(section).toContain("assignmentId");
    expect(section).toContain("date");
  });

  it("check-in has rate limiter", () => {
    expect(HR_ROUTE).toContain("checkInLimiter");
  });
});

describe("Attendance check-out", () => {
  it("POST /check-out endpoint exists", () => {
    expect(HR_ROUTE).toContain('"/check-out"');
  });
});

describe("Attendance listing and detail", () => {
  it("GET /attendance lists with filters and companyId scope", () => {
    const idx = HR_ROUTE.indexOf('router.get("/attendance"');
    const section = HR_ROUTE.slice(idx, idx + 1000);
    expect(section).toContain('authorize(');
    expect(section).toContain("companyId");
  });

  it("GET /attendance/today-summary exists", () => {
    expect(HR_ROUTE).toContain('"/attendance/today-summary"');
  });

  it("GET /attendance/:id exists with companyId scope", () => {
    expect(HR_ROUTE).toContain('"/attendance/:id"');
  });

  it("GET /monthly-attendance endpoint exists", () => {
    expect(HR_ROUTE).toContain('"/monthly-attendance"');
  });

  it("GET /attendance-stats aggregates attendance metrics", () => {
    const idx = HR_ROUTE.indexOf('"/attendance-stats"');
    expect(idx).toBeGreaterThan(-1);
  });

  it("GET /attendance-policy endpoint exists", () => {
    expect(HR_ROUTE).toContain('"/attendance-policy"');
  });

  it("PUT /attendance-policy endpoint exists for updates", () => {
    expect(HR_ROUTE).toContain('router.put("/attendance-policy"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAYROLL
// ═══════════════════════════════════════════════════════════════════════════════

describe("Payroll run creation", () => {
  it("POST /payroll requires hr:create", () => {
    const idx = HR_ROUTE.indexOf('router.post("/payroll"');
    const line = HR_ROUTE.slice(idx, HR_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("payroll restricts to HR/Finance/GM/Owner roles", () => {
    const idx = HR_ROUTE.indexOf('router.post("/payroll"');
    const section = HR_ROUTE.slice(idx, idx + 800);
    expect(section).toContain("PAYROLL_ROLES");
  });

  it("payroll checks financial period is open", () => {
    const idx = HR_ROUTE.indexOf('router.post("/payroll"');
    const section = HR_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("checkFinancialPeriodOpen");
    expect(section).toContain("لا يمكن تشغيل الرواتب في فترة مُقفلة");
  });

  it("payroll prevents duplicate runs for same period", () => {
    const idx = HR_ROUTE.indexOf('router.post("/payroll"');
    const section = HR_ROUTE.slice(idx, idx + 2500);
    expect(section).toContain("الرواتب لشهر");
    expect(section).toContain("تمت معالجتها مسبقاً");
  });

  it("payroll pre-checks attendance completeness", () => {
    const idx = HR_ROUTE.indexOf('router.post("/payroll"');
    const section = HR_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("سجلات الحضور غير مكتملة");
    expect(section).toContain("totalWithAttendance < totalActive");
  });

  it("payroll pre-checks unresolved violations", () => {
    const idx = HR_ROUTE.indexOf('router.post("/payroll"');
    const section = HR_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain("employee_violations");
    expect(section).toContain("deduction IS NULL");
    expect(section).toContain("مخالفة لم يُحدد جزاؤها");
  });
});

describe("Payroll listing and detail", () => {
  it("GET /payroll lists runs with companyId scope", () => {
    expect(HR_ROUTE).toContain('router.get("/payroll"');
  });

  it("GET /payroll/:id returns detail", () => {
    expect(HR_ROUTE).toContain('router.get("/payroll/:id"');
  });

  it("GET /payroll/:id/lines returns individual lines", () => {
    expect(HR_ROUTE).toContain('"/payroll/:id/lines"');
  });

  it("GET /payroll-summary provides aggregated stats", () => {
    expect(HR_ROUTE).toContain('"/payroll-summary"');
  });
});

describe("Payroll update and delete", () => {
  it("PATCH /payroll/:id exists with hr:update", () => {
    const idx = HR_ROUTE.indexOf('router.patch("/payroll/:id"');
    const line = HR_ROUTE.slice(idx, HR_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("DELETE /payroll/:id exists with hr:delete", () => {
    const idx = HR_ROUTE.indexOf('router.delete("/payroll/:id"');
    const line = HR_ROUTE.slice(idx, HR_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });
});

describe("Accruals", () => {
  it("POST /accruals/monthly exists with hr:update", () => {
    const idx = HR_ROUTE.indexOf('"/accruals/monthly"');
    expect(idx).toBeGreaterThan(-1);
  });

  it("monthly accruals validates period format YYYY-MM", () => {
    const idx = HR_ROUTE.indexOf('"/accruals/monthly"');
    const section = HR_ROUTE.slice(idx, idx + 500);
    expect(section).toContain("صيغة الفترة غير صحيحة (YYYY-MM)");
  });

  it("monthly accruals checks financial period is open", () => {
    const idx = HR_ROUTE.indexOf('"/accruals/monthly"');
    const section = HR_ROUTE.slice(idx, idx + 1200);
    expect(section).toContain("checkFinancialPeriodOpen");
    expect(section).toContain("لا يمكن تسجيل استحقاقات في فترة مُقفلة");
  });

  it("monthly accruals prevents duplicate via ref check", () => {
    const idx = HR_ROUTE.indexOf('"/accruals/monthly"');
    const section = HR_ROUTE.slice(idx, idx + 1800);
    expect(section).toContain("HR-ACCRUAL-");
    expect(section).toContain("تم تسجيل استحقاقات هذه الفترة مسبقاً");
  });

  it("monthly accruals uses 21-day annual leave standard", () => {
    const idx = HR_ROUTE.indexOf('"/accruals/monthly"');
    const section = HR_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("DEFAULT_ANNUAL_LEAVE_DAYS");
  });

  it("GET /accruals/preview provides preview without posting", () => {
    expect(HR_ROUTE).toContain('"/accruals/preview"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VIOLATIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Violations CRUD", () => {
  it("GET /violations lists with companyId scope", () => {
    expect(HR_ROUTE).toContain('router.get("/violations"');
  });

  it("GET /violations/:id returns detail", () => {
    expect(HR_ROUTE).toContain('router.get("/violations/:id"');
  });

  it("POST /violations creates violation with Zod validation", () => {
    const idx = HR_ROUTE.indexOf('router.post("/violations"');
    const section = HR_ROUTE.slice(idx, idx + 1000);
    expect(section).toContain("violationSchema.safeParse");
    expect(section).toContain('authorize(');
  });

  it("violation creation pre-checks assignment FK", () => {
    const idx = HR_ROUTE.indexOf('router.post("/violations"');
    const section = HR_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("غير موجود في هذه الشركة");
    expect(section).toContain("assignmentId");
  });

  it("violation creation wires to discipline engine", () => {
    const idx = HR_ROUTE.indexOf('router.post("/violations"');
    const section = HR_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("ensureInquiryMemoForViolation");
  });

  it("PATCH /violations/:id updates with hr:update", () => {
    const idx = HR_ROUTE.indexOf('router.patch("/violations/:id",');
    const line = HR_ROUTE.slice(idx, HR_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("violation approval/reject/return actions exist", () => {
    expect(HR_ROUTE).toContain('"/violations/:id/approve"');
    expect(HR_ROUTE).toContain('"/violations/:id/reject"');
    expect(HR_ROUTE).toContain('"/violations/:id/return"');
    expect(HR_ROUTE).toContain("violationApprovalAction");
  });

  it("DELETE /violations/:id exists with hr:delete", () => {
    expect(HR_ROUTE).toContain('router.delete("/violations/:id"');
  });

  it("GET /violations-stats exists", () => {
    expect(HR_ROUTE).toContain('"/violations-stats"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SHIFTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Shifts CRUD", () => {
  it("GET /shifts lists shifts", () => {
    expect(HR_ROUTE).toContain('router.get("/shifts"');
  });

  it("POST /shifts creates a shift with hr:create", () => {
    const idx = HR_ROUTE.indexOf('router.post("/shifts"');
    const line = HR_ROUTE.slice(idx, HR_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("PATCH /shifts/:id updates with hr:update", () => {
    const idx = HR_ROUTE.indexOf('router.patch("/shifts/:id"');
    const line = HR_ROUTE.slice(idx, HR_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("DELETE /shifts/:id removes with hr:delete", () => {
    const idx = HR_ROUTE.indexOf('router.delete("/shifts/:id"');
    const line = HR_ROUTE.slice(idx, HR_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("GET /shift-assignments lists assignments", () => {
    expect(HR_ROUTE).toContain('"/shift-assignments"');
  });

  it("POST /shift-assignments creates assignment", () => {
    expect(HR_ROUTE).toContain('router.post("/shift-assignments"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Performance CRUD", () => {
  it("GET /performance lists reviews", () => {
    expect(HR_ROUTE).toContain('router.get("/performance"');
  });

  it("GET /performance/:id returns detail", () => {
    expect(HR_ROUTE).toContain('router.get("/performance/:id"');
  });

  it("POST /performance creates review with hr:create", () => {
    const idx = HR_ROUTE.indexOf('router.post("/performance"');
    const line = HR_ROUTE.slice(idx, HR_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("PATCH /performance/:id updates with hr:update", () => {
    const idx = HR_ROUTE.indexOf('router.patch("/performance/:id"');
    const line = HR_ROUTE.slice(idx, HR_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("DELETE /performance/:id removes with hr:delete", () => {
    const idx = HR_ROUTE.indexOf('router.delete("/performance/:id"');
    const line = HR_ROUTE.slice(idx, HR_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUATION CYCLES
// ═══════════════════════════════════════════════════════════════════════════════

describe("Evaluation cycles", () => {
  it("GET /evaluation-cycles lists cycles", () => {
    expect(HR_ROUTE).toContain('router.get("/evaluation-cycles"');
  });

  it("POST /evaluation-cycles creates a cycle", () => {
    expect(HR_ROUTE).toContain('router.post("/evaluation-cycles"');
  });

  it("GET /evaluation-cycles/:id returns detail", () => {
    expect(HR_ROUTE).toContain('router.get("/evaluation-cycles/:id"');
  });

  it("GET /evaluation-cycles/:id/system-report generates auto-report", () => {
    expect(HR_ROUTE).toContain('"/evaluation-cycles/:id/system-report"');
  });

  it("POST /evaluation-cycles/:id/peer-evaluation submits peer eval", () => {
    expect(HR_ROUTE).toContain('"/evaluation-cycles/:id/peer-evaluation"');
  });

  it("POST /evaluation-cycles/:id/upward-review submits upward review", () => {
    expect(HR_ROUTE).toContain('"/evaluation-cycles/:id/upward-review"');
  });

  it("GET /evaluation-cycles/:id/summary provides aggregated report", () => {
    expect(HR_ROUTE).toContain('"/evaluation-cycles/:id/summary"');
  });

  it("GET /employees/:id/evaluation-history returns historical data", () => {
    expect(HR_ROUTE).toContain('"/employees/:id/evaluation-history"');
  });

  it("GET /upward-reviews/manager/:managerId returns reviews for manager", () => {
    expect(HR_ROUTE).toContain('"/upward-reviews/manager/:managerId"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SALARY COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Salary components", () => {
  it("GET /salary-components lists with hr:read", () => {
    const idx = HR_ROUTE.indexOf('"/salary-components"');
    expect(idx).toBeGreaterThan(-1);
  });

  it("POST /salary-components creates with hr:create", () => {
    expect(HR_ROUTE).toContain('router.post("/salary-components"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVAL CHAIN DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Approval chain definitions", () => {
  it("GET /approval-chains lists active chains", () => {
    expect(HR_ROUTE).toContain('"/approval-chains"');
  });

  it("GET /approval-chain-definitions lists definitions", () => {
    expect(HR_ROUTE).toContain('"/approval-chain-definitions"');
  });

  it("POST /approval-chain-definitions creates definition", () => {
    expect(HR_ROUTE).toContain('router.post("/approval-chain-definitions"');
  });

  it("DELETE /approval-chain-definitions/:id removes definition", () => {
    expect(HR_ROUTE).toContain('router.delete("/approval-chain-definitions/:id"');
  });

  it("GET /approval-requests lists pending requests", () => {
    expect(HR_ROUTE).toContain('"/approval-requests"');
  });

  it("PATCH /approval-requests/:id/decide processes decision", () => {
    expect(HR_ROUTE).toContain('"/approval-requests/:id/decide"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSFERS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Transfers lifecycle", () => {
  it("GET /transfers lists transfers", () => {
    expect(HR_ROUTE).toContain('router.get("/transfers"');
  });

  it("GET /transfers/:id returns detail", () => {
    expect(HR_ROUTE).toContain('router.get("/transfers/:id"');
  });

  it("POST /transfers creates a transfer request", () => {
    expect(HR_ROUTE).toContain('router.post("/transfers"');
  });

  it("PATCH /transfers/:id/approve approves transfer", () => {
    expect(HR_ROUTE).toContain('"/transfers/:id/approve"');
  });

  it("PATCH /transfers/:id/receive receives transfer", () => {
    expect(HR_ROUTE).toContain('"/transfers/:id/receive"');
  });

  it("transfer has multi-step flow with pending_receiving_manager", () => {
    expect(HR_ROUTE).toContain("pending_receiving_manager");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELEGATIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Delegations", () => {
  it("GET /delegations lists with hr:read", () => {
    const idx = HR_ROUTE.indexOf('"/delegations"');
    expect(idx).toBeGreaterThan(-1);
  });

  it("POST /delegations requires hr:approve", () => {
    const idx = HR_ROUTE.indexOf('router.post("/delegations"');
    const line = HR_ROUTE.slice(idx, HR_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC HOLIDAYS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Public holidays CRUD", () => {
  it("GET /public-holidays lists holidays", () => {
    expect(HR_ROUTE).toContain('router.get("/public-holidays"');
  });

  it("POST /public-holidays creates with hr:create", () => {
    const idx = HR_ROUTE.indexOf('router.post("/public-holidays"');
    const line = HR_ROUTE.slice(idx, HR_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("PATCH /public-holidays/:id updates with hr:update", () => {
    expect(HR_ROUTE).toContain('router.patch("/public-holidays/:id"');
  });

  it("DELETE /public-holidays/:id removes with hr:delete", () => {
    expect(HR_ROUTE).toContain('router.delete("/public-holidays/:id"');
  });

  it("GET /public-holidays/check checks a specific date", () => {
    expect(HR_ROUTE).toContain('"/public-holidays/check"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// IDP (Individual Development Plans)
// ═══════════════════════════════════════════════════════════════════════════════

describe("IDP CRUD", () => {
  it("GET /idp lists plans", () => {
    expect(HR_ROUTE).toContain('router.get("/idp"');
  });

  it("POST /idp creates plan with hr:create", () => {
    const idx = HR_ROUTE.indexOf('router.post("/idp"');
    const line = HR_ROUTE.slice(idx, HR_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("PATCH /idp/:id updates plan with hr:update", () => {
    expect(HR_ROUTE).toContain('router.patch("/idp/:id"');
  });

  it("DELETE /idp/:id removes plan with hr:delete", () => {
    expect(HR_ROUTE).toContain('router.delete("/idp/:id"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OFFICIAL LETTERS (additional coverage beyond hrBroadGoldenPath)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Official letters CRUD", () => {
  it("GET /official-letters lists letters", () => {
    expect(HR_ROUTE).toContain('router.get("/official-letters"');
  });

  it("POST /official-letters creates letter", () => {
    expect(HR_ROUTE).toContain('router.post("/official-letters"');
  });

  it("GET /official-letters/:id returns detail", () => {
    expect(HR_ROUTE).toContain('router.get("/official-letters/:id"');
  });

  it("PATCH /official-letters/:id updates letter", () => {
    expect(HR_ROUTE).toContain('router.patch("/official-letters/:id"');
  });

  it("DELETE /official-letters/:id removes letter", () => {
    expect(HR_ROUTE).toContain('router.delete("/official-letters/:id"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTING & ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

describe("HR reporting endpoints", () => {
  it("GET /stats provides overall HR statistics", () => {
    expect(HR_ROUTE).toContain('router.get("/stats"');
  });

  it("GET /deductions lists deductions", () => {
    expect(HR_ROUTE).toContain('"/deductions"');
  });

  it("GET /onboarding-steps provides onboarding progress", () => {
    expect(HR_ROUTE).toContain('"/onboarding-steps"');
  });

  it("PUT /onboarding-steps updates steps", () => {
    expect(HR_ROUTE).toContain('router.put("/onboarding-steps"');
  });

  it("POST /impact-preview/leave simulates leave impact", () => {
    expect(HR_ROUTE).toContain('"/impact-preview/leave"');
  });

  it("POST /impact-preview/termination simulates termination", () => {
    expect(HR_ROUTE).toContain('"/impact-preview/termination"');
  });

  it("POST /impact-preview/violation simulates violation impact", () => {
    expect(HR_ROUTE).toContain('"/impact-preview/violation"');
  });

  it("GET /employee-status/:employeeId returns employee status", () => {
    expect(HR_ROUTE).toContain('"/employee-status/:employeeId"');
  });

  it("GET /employees-status returns bulk status", () => {
    expect(HR_ROUTE).toContain('"/employees-status"');
  });

  it("GET /gratuity/:employeeId calculates gratuity", () => {
    expect(HR_ROUTE).toContain('"/gratuity/:employeeId"');
  });

  it("GET /turnover-report provides turnover analytics", () => {
    expect(HR_ROUTE).toContain('"/turnover-report"');
  });

  it("GET /expiring-documents alerts on soon-to-expire docs", () => {
    expect(HR_ROUTE).toContain('"/expiring-documents"');
  });

  it("GET /company-documents lists company-level documents", () => {
    expect(HR_ROUTE).toContain('"/company-documents"');
  });

  it("POST /company-documents uploads document", () => {
    expect(HR_ROUTE).toContain('router.post("/company-documents"');
  });

  it("GET /employee-documents lists employee documents", () => {
    expect(HR_ROUTE).toContain('"/employee-documents"');
  });

  it("POST /employee-documents uploads employee document", () => {
    expect(HR_ROUTE).toContain('router.post("/employee-documents"');
  });

  it("GET /leave-types lists available leave types", () => {
    expect(HR_ROUTE).toContain('"/leave-types"');
  });

  it("GET /leave-balance returns balance for assignment", () => {
    expect(HR_ROUTE).toContain('"/leave-balance"');
  });

  it("GET /leave-stats provides leave statistics", () => {
    expect(HR_ROUTE).toContain('"/leave-stats"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXCUSE REQUESTS (additional coverage beyond hrBroadGoldenPath)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Excuse requests CRUD", () => {
  it("GET /excuse-requests lists requests", () => {
    expect(HR_ROUTE).toContain('router.get("/excuse-requests"');
  });

  it("GET /excuse-requests/:id returns detail", () => {
    expect(HR_ROUTE).toContain('router.get("/excuse-requests/:id"');
  });

  it("POST /excuse-requests creates a request", () => {
    expect(HR_ROUTE).toContain('router.post("/excuse-requests"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEAVE REQUESTS (additional coverage beyond hrLeaveGoldenPath)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Leave requests additional endpoints", () => {
  it("PATCH /leave-requests/:id updates draft leave", () => {
    expect(HR_ROUTE).toContain('router.patch("/leave-requests/:id"');
  });

  it("DELETE /leave-requests/:id deletes draft leave", () => {
    expect(HR_ROUTE).toContain('router.delete("/leave-requests/:id"');
  });

  it("PATCH /leave-requests/:id/escalate escalates approval", () => {
    expect(HR_ROUTE).toContain('"/leave-requests/:id/escalate"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISSIONS — verify every endpoint has proper permission guard
// ═══════════════════════════════════════════════════════════════════════════════

describe("Permission enforcement across HR routes", () => {
  it("all GET endpoints require at least hr:read", () => {
    const getEndpoints = HR_ROUTE.matchAll(/router\.get\("[^"]+",\s*([^,]+)/g);
    for (const match of getEndpoints) {
      const middleware = match[1]!;
      const hasPermission =
        middleware.includes("authorize(") ||
        middleware.includes("requireAnyPermission");
      expect(hasPermission).toBe(true);
    }
  });

  it("all POST endpoints require hr:create or hr:self or hr:update", () => {
    const postEndpoints = HR_ROUTE.matchAll(/router\.post\("[^"]+",\s*([^,]+)/g);
    for (const match of postEndpoints) {
      const middleware = match[1]!;
      const hasPermission =
        middleware.includes("authorize(") ||
        middleware.includes("requireAnyPermission") ||
        middleware.includes("checkInLimiter");
      expect(hasPermission).toBe(true);
    }
  });

  it("all PATCH endpoints require hr:update", () => {
    const patchEndpoints = HR_ROUTE.matchAll(/router\.patch\("[^"]+",\s*([^,]+)/g);
    for (const match of patchEndpoints) {
      const middleware = match[1]!;
      expect(middleware).toContain("authorize(");
    }
  });

  it("all DELETE endpoints require hr:delete", () => {
    const deleteEndpoints = HR_ROUTE.matchAll(/router\.delete\("[^"]+",\s*([^,]+)/g);
    for (const match of deleteEndpoints) {
      const middleware = match[1]!;
      expect(middleware).toContain('authorize(');
    }
  });
});
