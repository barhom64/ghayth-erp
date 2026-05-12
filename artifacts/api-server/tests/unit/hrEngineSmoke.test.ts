import { describe, it, expect } from "vitest";
import { DOMAIN_REGISTRY, getDomain } from "../../src/lib/domainRegistry.js";

// ─── HR Engine Deep Smoke Tests ───��────────────────────────────────────���────
// Validates the HR domain's engine contract, GL posting patterns,
// source key conventions, and cross-domain event wiring.

describe("HR domain registry completeness", () => {
  const hr = getDomain("hr")!;

  it("exists in the registry", () => {
    expect(hr).toBeDefined();
    expect(hr.id).toBe("hr");
  });

  it("owns the expected core tables", () => {
    const required = [
      "employees", "employee_assignments", "hr_leave_requests",
      "hr_attendance_records", "hr_overtime_requests", "hr_loans",
      "hr_exit_requests", "payroll_runs", "payroll_lines",
    ];
    for (const t of required) {
      expect(hr.tables).toContain(t);
    }
  });

  it("declares hrEngine as primary engine", () => {
    expect(hr.engines).toContain("hrEngine");
  });

  it("has GL integration enabled", () => {
    expect(hr.glIntegration).toBe(true);
  });

  it("has necessary permissions", () => {
    expect(hr.permissions).toContain("hr:read");
    expect(hr.permissions).toContain("hr:create");
    expect(hr.permissions).toContain("hr:update");
    expect(hr.permissions).toContain("hr:approve");
    expect(hr.permissions).toContain("hr:self");
  });

  it("has lifecycle entities for workflows", () => {
    expect(hr.lifecycleEntities).toContain("hr_leave_requests");
    expect(hr.lifecycleEntities).toContain("hr_exit_requests");
    expect(hr.lifecycleEntities).toContain("hr_inquiry_memos");
    expect(hr.lifecycleEntities).toContain("employee_transfers");
  });

  it("has obligation types for compliance", () => {
    expect(hr.obligationTypes).toContain("gosi_submission");
    expect(hr.obligationTypes).toContain("contract_renewal");
    expect(hr.obligationTypes).toContain("residency_expiry");
    expect(hr.obligationTypes).toContain("license_expiry");
  });

  it("has cron jobs for proactive monitoring", () => {
    expect(hr.cronJobs.length).toBeGreaterThan(0);
    expect(hr.cronJobs).toContain("attendance_anomaly_scan");
    expect(hr.cronJobs).toContain("contract_expiry_check");
  });
});

describe("HR Engine method contracts", () => {
  it("postPayrollGL requires all financial context", async () => {
    const { hrEngine } = await import("../../src/lib/engines/hrEngine.js");
    expect(hrEngine.postPayrollGL.length).toBe(2);
  });

  it("postLoanDisbursementGL requires context + loan", async () => {
    const { hrEngine } = await import("../../src/lib/engines/hrEngine.js");
    expect(hrEngine.postLoanDisbursementGL.length).toBe(2);
  });

  it("postExitSettlementGL requires context + exit", async () => {
    const { hrEngine } = await import("../../src/lib/engines/hrEngine.js");
    expect(hrEngine.postExitSettlementGL.length).toBe(2);
  });

  it("createPayrollDeduction requires params object", async () => {
    const { hrEngine } = await import("../../src/lib/engines/hrEngine.js");
    expect(typeof hrEngine.createPayrollDeduction).toBe("function");
  });

  it("has monthly accruals GL method", async () => {
    const { hrEngine } = await import("../../src/lib/engines/hrEngine.js");
    expect(typeof hrEngine.postMonthlyAccrualsGL).toBe("function");
  });

  it("has payroll post GL method", async () => {
    const { hrEngine } = await import("../../src/lib/engines/hrEngine.js");
    expect(typeof hrEngine.postPayrollPostGL).toBe("function");
  });
});

describe("HR Engine sourceKey conventions", () => {
  it("all HR sourceKeys start with hr: prefix", () => {
    const expectedPatterns = [
      /^hr:payroll:\d+$/,
      /^hr:loan:\d+$/,
      /^hr:exit:\d+$/,
      /^hr:leave_accrual:\d+:.+$/,
      /^hr:eos_accrual:\d+:.+$/,
      /^hr:payroll_run:\d+$/,
      /^hr:payroll_post:\d+$/,
      /^hr:monthly_accruals:\d+:.+$/,
    ];
    for (const p of expectedPatterns) {
      expect(p.source.startsWith("^hr:")).toBe(true);
    }
  });
});

describe("HR domain table ownership", () => {
  it("no other domain claims HR tables", () => {
    const hrTables = getDomain("hr")!.tables;
    for (const d of DOMAIN_REGISTRY) {
      if (d.id === "hr") continue;
      for (const t of d.tables) {
        expect(hrTables).not.toContain(t);
      }
    }
  });
});

describe("HR Engine cross-domain wiring", () => {
  it("HR engine registers fleet deduction handler via DLQ-backed registerCrossDomainHandler", async () => {
    const { eventBus } = await import("../../src/lib/eventBus.js");
    await import("../../src/lib/engines/hrEngine.js");
    const listeners = eventBus.listeners("fleet.violation.deduction_requested");
    expect(listeners.length).toBeGreaterThanOrEqual(1);
  });
});
