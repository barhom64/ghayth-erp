import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const EXIT_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/hr-exit.ts"), "utf8");
const LOANS_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/hr-loans.ts"), "utf8");
const OVERTIME_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/hr-overtime.ts"), "utf8");

// ─── HR Exit Smoke Tests ────────────────────────────────────────────────────

describe("Exit route structure", () => {
  it("has all exit lifecycle endpoints", () => {
    expect(EXIT_ROUTE).toContain('"/exit"');
    expect(EXIT_ROUTE).toContain('"/exit/:id"');
    expect(EXIT_ROUTE).toContain('"/exit/:id/approve"');
    expect(EXIT_ROUTE).toContain('"/exit/clearance/:id"');
    expect(EXIT_ROUTE).toContain('"/exit/:id/complete"');
  });

  it("imports applyTransition from lifecycleEngine", () => {
    expect(EXIT_ROUTE).toContain("applyTransition");
    expect(EXIT_ROUTE).toContain("lifecycleEngine");
  });

  it("imports workflowEngine for approval workflows", () => {
    expect(EXIT_ROUTE).toContain("submitWorkflow");
    expect(EXIT_ROUTE).toContain("workflowEngine");
  });

  it("imports hrHelpers for sequential number generation", () => {
    expect(EXIT_ROUTE).toContain("generateSequentialNumber");
    expect(EXIT_ROUTE).toContain("HR_TABLES");
    expect(EXIT_ROUTE).toContain("NUMBER_PREFIXES");
  });
});

describe("Exit request creation", () => {
  it("validates with Zod createExitSchema", () => {
    expect(EXIT_ROUTE).toContain("createExitSchema");
    expect(EXIT_ROUTE).toContain("assignmentId: z.coerce.number");
    expect(EXIT_ROUTE).toContain("exitType: z.string()");
  });

  it("requires hr:create permission", () => {
    const idx = EXIT_ROUTE.indexOf('router.post("/exit"');
    const line = EXIT_ROUTE.slice(idx, EXIT_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("prevents duplicate active exit requests", () => {
    const idx = EXIT_ROUTE.indexOf('router.post("/exit"');
    const section = EXIT_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("يوجد طلب نهاية خدمة سابق لهذا الموظف");
    expect(section).toContain("NOT IN ('rejected','cancelled')");
  });

  it("calculates gratuity per Saudi labor law (Articles 84 & 85)", () => {
    const idx = EXIT_ROUTE.indexOf('router.post("/exit"');
    const section = EXIT_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("yearsOfService");
    expect(section).toContain("first5");
    expect(section).toContain("above5");
    expect(section).toContain("(salary / 2) * first5 + salary * above5");
  });

  it("reduces gratuity for resignation per Article 85", () => {
    const idx = EXIT_ROUTE.indexOf('router.post("/exit"');
    const section = EXIT_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain('exitType === "resignation"');
    expect(section).toContain("yearsOfService < 2");
    expect(section).toContain("yearsOfService < 5");
    expect(section).toContain("yearsOfService < 10");
  });

  it("calculates leave compensation from balance", () => {
    const idx = EXIT_ROUTE.indexOf('router.post("/exit"');
    const section = EXIT_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain("leave_balances");
    expect(section).toContain("leaveCompensation");
    expect(section).toContain("dailyRate");
  });

  it("deducts outstanding loans from settlement", () => {
    const idx = EXIT_ROUTE.indexOf('router.post("/exit"');
    const section = EXIT_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain("hr_employee_loans");
    expect(section).toContain("remainingAmount");
    expect(section).toContain("loanDeductions");
  });

  it("computes net settlement: gratuity + leave - loans - other", () => {
    expect(EXIT_ROUTE).toContain("gratuity + leaveCompensation - loanDeductions - otherDeductions");
  });

  it("creates default clearance items for 6 departments", () => {
    expect(EXIT_ROUTE).toContain("DEFAULT_CLEARANCE_DEPARTMENTS");
    expect(EXIT_ROUTE).toContain("تقنية المعلومات");
    expect(EXIT_ROUTE).toContain("الموارد البشرية");
    expect(EXIT_ROUTE).toContain("المالية");
    expect(EXIT_ROUTE).toContain("الإدارة");
    expect(EXIT_ROUTE).toContain("المدير المباشر");
    expect(EXIT_ROUTE).toContain("الأمن");
  });

  it("initiates approval chain for exit requests", () => {
    const idx = EXIT_ROUTE.indexOf('router.post("/exit"');
    const section = EXIT_ROUTE.slice(idx, idx + 6000);
    expect(section).toContain("initiateApprovalChain");
    expect(section).toContain('chainType: "exit"');
  });

  it("submits to workflow engine", () => {
    const idx = EXIT_ROUTE.indexOf('router.post("/exit"');
    const section = EXIT_ROUTE.slice(idx, idx + 6000);
    expect(section).toContain("submitWorkflow");
    expect(section).toContain('requestType: "exit"');
  });
});

describe("Exit approval flow", () => {
  it("approval restricts to HR/GM/Owner", () => {
    const idx = EXIT_ROUTE.indexOf('"/exit/:id/approve"');
    const section = EXIT_ROUTE.slice(idx, idx + 1000);
    expect(section).toContain("HR_ROLES");
  });

  it("approval uses applyTransition for both approve and reject", () => {
    const idx = EXIT_ROUTE.indexOf('"/exit/:id/approve"');
    const endIdx = EXIT_ROUTE.indexOf("router.", idx + 10);
    const section = EXIT_ROUTE.slice(idx, endIdx);
    const transitions = section.match(/applyTransition\(/g);
    expect(transitions!.length).toBe(2);
  });

  it("rejection notifies employee with reason", () => {
    const idx = EXIT_ROUTE.indexOf('"/exit/:id/approve"');
    const section = EXIT_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("exit_rejected");
    expect(section).toContain("تم رفض طلب نهاية الخدمة");
  });

  it("approval supports multi-step approval chain", () => {
    const idx = EXIT_ROUTE.indexOf('"/exit/:id/approve"');
    const section = EXIT_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("processApprovalStep");
    expect(section).toContain("pending_next_step");
  });

  it("final approval notifies employee to complete clearance", () => {
    const idx = EXIT_ROUTE.indexOf('"/exit/:id/approve"');
    const section = EXIT_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("exit_approved");
    expect(section).toContain("يرجى إكمال إخلاء الطرف");
  });
});

describe("Exit clearance flow", () => {
  it("clearance update validates with Zod", () => {
    expect(EXIT_ROUTE).toContain("updateClearanceSchema");
  });

  it("clearance marks items as cleared or rejected", () => {
    const idx = EXIT_ROUTE.indexOf('"/exit/clearance/:id"');
    const section = EXIT_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain('"cleared"');
    expect(section).toContain('"rejected"');
  });

  it("auto-completes clearance when all items are done", () => {
    const idx = EXIT_ROUTE.indexOf('"/exit/clearance/:id"');
    const section = EXIT_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain('"clearanceCompleted" = TRUE');
    expect(section).toContain("status = 'pending'");
  });
});

describe("Exit completion flow", () => {
  it("complete requires clearance to be done first", () => {
    const idx = EXIT_ROUTE.indexOf('"/exit/:id/complete"');
    const section = EXIT_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("clearanceCompleted");
    expect(section).toContain("يجب إكمال إخلاء الطرف أولاً");
  });

  it("complete uses applyTransition approved → completed", () => {
    const idx = EXIT_ROUTE.indexOf('"/exit/:id/complete"');
    const section = EXIT_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("applyTransition");
    expect(section).toContain('"approved"');
    expect(section).toContain('"completed"');
  });

  it("complete terminates the employee assignment", () => {
    const idx = EXIT_ROUTE.indexOf('"/exit/:id/complete"');
    const section = EXIT_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("UPDATE employee_assignments SET status = 'terminated'");
  });

  it("complete posts GL settlement via hrEngine", () => {
    const idx = EXIT_ROUTE.indexOf('"/exit/:id/complete"');
    const section = EXIT_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("hrEngine.postExitSettlementGL");
  });
});

// ─── HR Loans Smoke Tests ───────────────────────────────────────────────────

describe("Loans route structure", () => {
  it("has all loan endpoints", () => {
    expect(LOANS_ROUTE).toContain('"/loans"');
    expect(LOANS_ROUTE).toContain('"/loans/my"');
    expect(LOANS_ROUTE).toContain('"/loans/:id"');
    expect(LOANS_ROUTE).toContain('"/loans/:id/approve"');
    expect(LOANS_ROUTE).toContain('"/loans/:id/reject"');
  });

  it("imports workflowEngine and approval helpers", () => {
    expect(LOANS_ROUTE).toContain("submitWorkflow");
    expect(LOANS_ROUTE).toContain("initiateApprovalChain");
    expect(LOANS_ROUTE).toContain("processApprovalStep");
  });

  it("imports hrHelpers for unified number generation", () => {
    expect(LOANS_ROUTE).toContain("generateSequentialNumber");
    expect(LOANS_ROUTE).toContain("HR_TABLES");
    expect(LOANS_ROUTE).toContain("LOAN_STATUS");
  });
});

describe("Loan creation", () => {
  it("validates with Zod createLoanSchema", () => {
    expect(LOANS_ROUTE).toContain("createLoanSchema");
    expect(LOANS_ROUTE).toContain("amount: z.coerce.number");
    expect(LOANS_ROUTE).toContain("installmentCount: z.coerce.number");
  });

  it("prevents duplicate active loans per employee", () => {
    const idx = LOANS_ROUTE.indexOf('router.post("/loans"');
    const section = LOANS_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("يوجد سلفة نشطة بالفعل لهذا الموظف");
    expect(section).toContain("'pending','approved','active'");
  });

  it("enforces max loan = 3x salary", () => {
    const idx = LOANS_ROUTE.indexOf('router.post("/loans"');
    const section = LOANS_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("salary || 0) * 3");
    expect(section).toContain("3 أضعاف الراتب");
  });

  it("calculates installment amount", () => {
    expect(LOANS_ROUTE).toContain("amount / installmentCount");
  });

  it("initiates approval chain for loans", () => {
    const idx = LOANS_ROUTE.indexOf('router.post("/loans"');
    const section = LOANS_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("initiateApprovalChain");
    expect(section).toContain('chainType: "loans"');
  });
});

describe("Loan approval flow", () => {
  it("approval restricts roles to manager/HR/finance/owner", () => {
    const idx = LOANS_ROUTE.indexOf('"/loans/:id/approve"');
    const section = LOANS_ROUTE.slice(idx, idx + 1000);
    expect(section).toContain("LOAN_APPROVAL_ROLES");
  });

  it("prevents self-approval", () => {
    const idx = LOANS_ROUTE.indexOf('"/loans/:id/approve"');
    const section = LOANS_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("لا يمكنك اعتماد سلفتك الخاصة");
    expect(section).toContain("loan.assignmentId === scope.activeAssignmentId");
  });

  it("generates installment schedule on approval", () => {
    const idx = LOANS_ROUTE.indexOf('"/loans/:id/approve"');
    const endIdx = LOANS_ROUTE.indexOf("router.", idx + 10);
    const section = LOANS_ROUTE.slice(idx, endIdx);
    expect(section).toContain("INSERT INTO hr_loan_installments");
    expect(section).toContain("installmentNumber");
    expect(section).toContain("advancePeriod");
  });

  it("last installment absorbs rounding remainder", () => {
    const idx = LOANS_ROUTE.indexOf('"/loans/:id/approve"');
    const endIdx = LOANS_ROUTE.indexOf("router.", idx + 10);
    const section = LOANS_ROUTE.slice(idx, endIdx);
    expect(section).toContain("isLast");
    // The handler now copies `loan.installmentCount ?? 0` into a local
    // `installmentCount` const and uses the local in the formula, so the
    // assertion accepts either spelling.
    expect(section).toMatch(/(?:loan\.)?installmentCount - 1/);
  });

  it("posts GL disbursement entry via hrEngine", () => {
    const idx = LOANS_ROUTE.indexOf('"/loans/:id/approve"');
    const endIdx = LOANS_ROUTE.indexOf("router.", idx + 10);
    const section = LOANS_ROUTE.slice(idx, endIdx);
    expect(section).toContain("hrEngine.postLoanDisbursementGL");
  });

  it("notifies employee on approval", () => {
    const idx = LOANS_ROUTE.indexOf('"/loans/:id/approve"');
    const endIdx = LOANS_ROUTE.indexOf("router.", idx + 10);
    const section = LOANS_ROUTE.slice(idx, endIdx);
    expect(section).toContain("loan_approved");
    expect(section).toContain("تمت الموافقة على سلفتك");
  });

  it("supports multi-step approval chain", () => {
    const idx = LOANS_ROUTE.indexOf('"/loans/:id/approve"');
    const section = LOANS_ROUTE.slice(idx, idx + 3500);
    expect(section).toContain("processApprovalStep");
    expect(section).toContain("pending_next_step");
  });
});

describe("Loan rejection", () => {
  it("reject restricts roles", () => {
    const idx = LOANS_ROUTE.indexOf('"/loans/:id/reject"');
    const section = LOANS_ROUTE.slice(idx, idx + 500);
    expect(section).toContain("LOAN_APPROVAL_ROLES");
  });

  it("reject only from pending state", () => {
    const idx = LOANS_ROUTE.indexOf('"/loans/:id/reject"');
    const section = LOANS_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain('loan.status !== "pending"');
  });

  it("reject notifies employee", () => {
    const idx = LOANS_ROUTE.indexOf('"/loans/:id/reject"');
    const endIdx = LOANS_ROUTE.indexOf("export default", idx);
    const section = LOANS_ROUTE.slice(idx, endIdx);
    expect(section).toContain("loan_rejected");
    expect(section).toContain("تم رفض طلب السلفة");
  });
});

describe("Loan self-service", () => {
  it("GET /loans/my uses activeAssignmentId scope", () => {
    const idx = LOANS_ROUTE.indexOf('"/loans/my"');
    const section = LOANS_ROUTE.slice(idx, idx + 500);
    expect(section).toContain("scope.activeAssignmentId");
  });
});

describe("Loan detail with installments", () => {
  it("GET /loans/:id returns loan + installments", () => {
    const idx = LOANS_ROUTE.indexOf('"/loans/:id"');
    const section = LOANS_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("hr_loan_installments");
    expect(section).toContain("installments");
  });
});

// ─── HR Overtime Smoke Tests ────────────────────────────────────────────────

describe("Overtime route structure", () => {
  it("has all overtime endpoints", () => {
    expect(OVERTIME_ROUTE).toContain('"/overtime"');
    expect(OVERTIME_ROUTE).toContain('"/overtime/my"');
    expect(OVERTIME_ROUTE).toContain('"/overtime/summary"');
    expect(OVERTIME_ROUTE).toContain('"/overtime/:id"');
    expect(OVERTIME_ROUTE).toContain('"/overtime/:id/approve"');
    expect(OVERTIME_ROUTE).toContain('"/overtime/:id/reject"');
  });

  it("imports hourly rate calculator from hrHelpers (Article 98)", () => {
    expect(OVERTIME_ROUTE).toContain("calcHourlyRate");
    expect(OVERTIME_ROUTE).toContain("hrHelpers");
  });
});

describe("Overtime creation", () => {
  it("validates with Zod", () => {
    expect(OVERTIME_ROUTE).toContain("createOvertimeSchema");
    expect(OVERTIME_ROUTE).toContain("overtimeDate: z.string()");
    expect(OVERTIME_ROUTE).toContain("startTime: z.string()");
    expect(OVERTIME_ROUTE).toContain("endTime: z.string()");
  });

  it("limits hours to max 12 per day", () => {
    expect(OVERTIME_ROUTE).toContain('.max(12, "لا يمكن تسجيل أكثر من 12 ساعة إضافية في اليوم")');
  });

  it("computes totalAmount = hourlyRate * multiplier * hours", () => {
    expect(OVERTIME_ROUTE).toContain("hourlyRate * multiplier * hours");
  });

  it("default multiplier is 1.5x", () => {
    expect(OVERTIME_ROUTE).toContain("DEFAULT 1.50");
    expect(OVERTIME_ROUTE).toContain("b.multiplier || 1.5");
  });

  it("prevents duplicate request for same employee+date", () => {
    const idx = OVERTIME_ROUTE.indexOf('router.post("/overtime"');
    const section = OVERTIME_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("يوجد طلب وقت إضافي لنفس الموظف في نفس التاريخ");
  });

  it("links to payroll period (YYYY-MM)", () => {
    expect(OVERTIME_ROUTE).toContain('"payrollPeriod"');
    expect(OVERTIME_ROUTE).toContain("overtimeDate.substring(0, 7)");
  });

  it("initiates approval chain", () => {
    const idx = OVERTIME_ROUTE.indexOf('router.post("/overtime"');
    const section = OVERTIME_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("initiateApprovalChain");
    expect(section).toContain('chainType: "overtime"');
  });
});

describe("Overtime approval flow", () => {
  it("approval restricts to manager/HR/GM/Owner", () => {
    const idx = OVERTIME_ROUTE.indexOf('"/overtime/:id/approve"');
    const section = OVERTIME_ROUTE.slice(idx, idx + 600);
    expect(section).toContain("HR_APPROVAL_ROLES");
  });

  it("prevents self-approval", () => {
    const idx = OVERTIME_ROUTE.indexOf('"/overtime/:id/approve"');
    const section = OVERTIME_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("لا يمكنك اعتماد طلبك الخاص");
  });

  it("supports multi-step approval chain", () => {
    const idx = OVERTIME_ROUTE.indexOf('"/overtime/:id/approve"');
    const section = OVERTIME_ROUTE.slice(idx, idx + 3500);
    expect(section).toContain("processApprovalStep");
    expect(section).toContain("pending_next_step");
  });

  it("notifies employee on approval and rejection", () => {
    const idx = OVERTIME_ROUTE.indexOf('"/overtime/:id/approve"');
    const endIdx = OVERTIME_ROUTE.indexOf("router.", idx + 10);
    const section = OVERTIME_ROUTE.slice(idx, endIdx);
    expect(section).toContain("overtime_approved");
    expect(section).toContain("overtime_rejected");
  });
});

describe("Overtime monthly summary", () => {
  it("summary groups by assignmentId with totals", () => {
    const idx = OVERTIME_ROUTE.indexOf('"/overtime/summary"');
    const section = OVERTIME_ROUTE.slice(idx, idx + 1200);
    expect(section).toContain('GROUP BY o."assignmentId"');
    expect(section).toContain('"totalHours"');
    expect(section).toContain('"totalAmount"');
    expect(section).toContain('"requestCount"');
  });

  it("summary only includes approved requests", () => {
    const idx = OVERTIME_ROUTE.indexOf('"/overtime/summary"');
    const section = OVERTIME_ROUTE.slice(idx, idx + 1000);
    expect(section).toContain("status = 'approved'");
  });
});

describe("Overtime self-service", () => {
  it("GET /overtime/my scopes by activeAssignmentId", () => {
    const idx = OVERTIME_ROUTE.indexOf('"/overtime/my"');
    // Window widened from 500 → 2000 chars: the original slice landed
    // exactly on the boundary, and additions to the route's SELECT
    // projection (e.g. typing rawQuery<OvertimeRow> in #271) could push
    // the assertion target past the cliff. The intent of the assertion
    // is "the route filters by scope.activeAssignmentId somewhere in
    // its handler" — the slice is just a guard against accidentally
    // matching a comment elsewhere in the file.
    const section = OVERTIME_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("scope.activeAssignmentId");
  });
});
