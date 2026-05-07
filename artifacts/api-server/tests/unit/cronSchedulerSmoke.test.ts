import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib/cronScheduler.ts"),
  "utf8"
);

// ── Exports ───────────────────────────────────────────────────────────────

describe("cronScheduler — exported functions", () => {
  it("exports seedCronJobs", () => {
    expect(SRC).toContain("export async function seedCronJobs");
  });

  it("exports startCronScheduler", () => {
    expect(SRC).toContain("export async function startCronScheduler");
  });

  it("exports triggerJobByName", () => {
    expect(SRC).toContain("export async function triggerJobByName");
  });

  it("exports stopCronScheduler", () => {
    expect(SRC).toContain("export function stopCronScheduler");
  });

  it("exports reloadCronScheduler", () => {
    expect(SRC).toContain("export async function reloadCronScheduler");
  });
});

// ── Infrastructure ────────────────────────────────────────────────────────

describe("cronScheduler — infrastructure", () => {
  it("has cron lock acquisition (distributed locking)", () => {
    expect(SRC).toContain("acquireCronLock");
  });

  it("has cron lock release", () => {
    expect(SRC).toContain("releaseCronLock");
  });

  it("has job logging", () => {
    expect(SRC).toContain("logCronJob");
  });

  it("has system timezone detection", () => {
    expect(SRC).toContain("getSystemTimezone");
  });

  it("has generic runJob wrapper", () => {
    expect(SRC).toContain("async function runJob");
  });
});

// ── HR domain cron jobs ───────────────────────────────────────────────────

describe("cronScheduler — HR jobs", () => {
  for (const job of [
    "documentExpiryAlerts",
    "contractExpiryAlerts",
    "leaveEscalationCheck",
    "leaveReturnToWorkClosure",
    "inquiryMemoEscalation",
    "reconcileAttendance",
    "probationAlertCheck",
    "retryStuckOfficialLetters",
    "dailyAutoViolationDetection",
    "dailyDeductionCheck",
    "yearlyLeaveBalanceRenewal",
  ]) {
    it(`has job: ${job}`, () => {
      expect(SRC).toContain(`async function ${job}`);
    });
  }
});

// ── Finance domain cron jobs ──────────────────────────────────────────────

describe("cronScheduler — finance jobs", () => {
  for (const job of [
    "dailyInvoiceOverdueEscalation",
    "dailyBudgetVarianceAlert",
    "dailyDunningAutoSend",
    "monthlyPayrollPrep",
    "monthlyClosingPrep",
    "monthlyAutoDepreciation",
    "monthlyBadDebtReminder",
    "monthlyFxRevaluationReminder",
  ]) {
    it(`has job: ${job}`, () => {
      expect(SRC).toContain(`async function ${job}`);
    });
  }
});

// ── Fleet domain cron jobs ────────────────────────────────────────────────

describe("cronScheduler — fleet jobs", () => {
  for (const job of [
    "fleetStatusCheck",
    "dailyFuelMonitor",
  ]) {
    it(`has job: ${job}`, () => {
      expect(SRC).toContain(`async function ${job}`);
    });
  }
});

// ── Property domain cron jobs ─────────────────────────────────────────────

describe("cronScheduler — property jobs", () => {
  for (const job of [
    "dailyPropertyCheck",
    "monthlyRentPenalties",
    "weeklyPropertyRevenue",
  ]) {
    it(`has job: ${job}`, () => {
      expect(SRC).toContain(`async function ${job}`);
    });
  }
});

// ── Legal domain cron jobs ────────────────────────────────────────────────

describe("cronScheduler — legal jobs", () => {
  it("has dailyLegalCheck", () => {
    expect(SRC).toContain("async function dailyLegalCheck");
  });

  it("has vendorContractExpiryAlerts", () => {
    expect(SRC).toContain("async function vendorContractExpiryAlerts");
  });

  it("has govExpiryAlerts", () => {
    expect(SRC).toContain("async function govExpiryAlerts");
  });
});

// ── Project & CRM cron jobs ───────────────────────────────────────────────

describe("cronScheduler — project & CRM jobs", () => {
  for (const job of [
    "dailyProjectCheck",
    "dailyCrmCheck",
    "weeklyCrmReport",
    "weeklyClientClassification",
  ]) {
    it(`has job: ${job}`, () => {
      expect(SRC).toContain(`async function ${job}`);
    });
  }
});

// ── Warehouse & inventory jobs ────────────────────────────────────────────

describe("cronScheduler — warehouse jobs", () => {
  it("has dailyInventoryCheck", () => {
    expect(SRC).toContain("async function dailyInventoryCheck");
  });

  it("has monthlyInventoryAudit", () => {
    expect(SRC).toContain("async function monthlyInventoryAudit");
  });
});

// ── System-wide cron jobs ─────────────────────────────────────────────────

describe("cronScheduler — system-wide jobs", () => {
  for (const job of [
    "dailyKpiSnapshot",
    "dailySmartAlertScan",
    "dailySlaGeneral",
    "dailyNotificationCleanup",
    "dailySystemHealthReport",
    "hourlyObligationsScan",
    "hourlySlaEscalation",
    "hourlyApprovalEscalation",
    "hourlyWorkflowSlaCheck",
    "weeklyHrReport",
    "weeklyFleetReport",
    "weeklyLogsArchiving",
    "weeklyDataCleanup",
    "weeklyCashFlowCheck",
    "runScheduledReports",
  ]) {
    it(`has job: ${job}`, () => {
      expect(SRC).toContain(`async function ${job}`);
    });
  }
});

// ── Communication queue jobs ──────────────────────────────────────────────

describe("cronScheduler — communication queues", () => {
  it("has processEmailQueue", () => {
    expect(SRC).toContain("async function processEmailQueue");
  });

  it("has processSmsQueue", () => {
    expect(SRC).toContain("async function processSmsQueue");
  });

  it("has processWhatsAppQueue", () => {
    expect(SRC).toContain("async function processWhatsAppQueue");
  });
});

// ── Umrah domain cron jobs ────────────────────────────────────────────────

describe("cronScheduler — umrah jobs", () => {
  for (const job of [
    "umrahDailyAbsconderCheck",
    "umrahOverdueInvoiceEscalation",
    "umrahWeeklyAgentPerformance",
    "umrahVisaExpiryAlerts",
    "umrahMonthlyFinancialSummary",
  ]) {
    it(`has job: ${job}`, () => {
      expect(SRC).toContain(`async function ${job}`);
    });
  }
});

// ── Security ──────────────────────────────────────────────────────────────

describe("cronScheduler — security", () => {
  it("uses parameterized queries extensively", () => {
    const params = [...SRC.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(100);
  });

  it("scopes queries by companyId", () => {
    const matches = [...SRC.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(50);
  });

  it("has at least 61 job functions", () => {
    // Lower bound only — new background jobs are added regularly and we
    // don't want every cron addition to need a parallel test bump. The
    // intent of this guard is to catch accidental DELETIONS of jobs.
    const funcs = [...SRC.matchAll(/^async function /gm)];
    expect(funcs.length).toBeGreaterThanOrEqual(61);
  });
});
