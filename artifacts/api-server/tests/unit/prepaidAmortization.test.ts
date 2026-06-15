/**
 * FIN-TIME-SPREADING (#2247) — prepaid-amortization engine contract.
 *
 * Static + pure style (mirrors vehicleFuelJournalContract.test.ts /
 * financialClosureRegression.test.ts). Posting is DB-bound, so the JE shape,
 * idempotency, and period-close gate are covered via PURE re-derivation of the
 * math/decision + a STATIC contract assertion on the engine/migration source.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeMonthlySchedule,
  amountForMonth,
  monthsBetween,
  duePeriodsUpTo,
  buildAmortizationLines,
  amortizationSourceKey,
  periodYm,
} from "../../src/lib/engines/prepaidAmortizationEngine.js";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const API_SRC = join(REPO_ROOT, "artifacts/api-server/src");
const MIGRATION = readFileSync(
  join(API_SRC, "migrations/373_prepaid_amortization_schedules.sql"),
  "utf8",
);
const ENGINE = readFileSync(
  join(API_SRC, "lib/engines/prepaidAmortizationEngine.ts"),
  "utf8",
);
const LIFECYCLE = readFileSync(
  join(API_SRC, "lib/fiscalPeriodLifecycle.ts"),
  "utf8",
);
// FIN-PERIOD-CLOSE (#2250) — the per-blocker checks moved out of the gate into
// the aggregating coordinator; the gate now calls it and throws ONCE on the set.
const COORDINATOR = readFileSync(
  join(API_SRC, "lib/periodCloseCoordinator.ts"),
  "utf8",
);
const ROUTE = readFileSync(
  join(API_SRC, "routes/finance-amortization.ts"),
  "utf8",
);

// ── Pure: computeMonthlySchedule ──────────────────────────────────────────────
describe("computeMonthlySchedule — pure", () => {
  it("1200 over 12 months → 100/mo, sum === 1200", () => {
    const { months, monthlyAmount } = computeMonthlySchedule({
      totalAmount: 1200,
      startDate: "2026-01-15",
      endDate: "2026-12-15",
    });
    expect(months).toBe(12);
    expect(monthlyAmount).toBe(100);
    let sum = 0;
    for (let m = 1; m <= months; m++) sum += amountForMonth(m, 1200, months, monthlyAmount);
    expect(sum).toBe(1200);
  });

  it("rounding case 1000/3: last month absorbs the remainder, sum === 1000", () => {
    const { months, monthlyAmount } = computeMonthlySchedule({
      totalAmount: 1000,
      startDate: "2026-01-01",
      endDate: "2026-03-01",
    });
    expect(months).toBe(3);
    expect(monthlyAmount).toBe(333.33);
    const m1 = amountForMonth(1, 1000, months, monthlyAmount);
    const m2 = amountForMonth(2, 1000, months, monthlyAmount);
    const m3 = amountForMonth(3, 1000, months, monthlyAmount);
    expect(m1).toBe(333.33);
    expect(m2).toBe(333.33);
    expect(m3).toBe(333.34); // last month absorbs the rounding remainder
    expect(m1 + m2 + m3).toBe(1000);
  });

  it("month count is correct (inclusive whole-month span)", () => {
    expect(monthsBetween("2026-01-15", "2026-01-20")).toBe(1);
    expect(monthsBetween("2026-01-01", "2026-06-30")).toBe(6);
    expect(monthsBetween("2026-01-10", "2027-01-10")).toBe(13);
  });

  it("due periods up to asOf are 1-based YYYY-MM, capped at month span", () => {
    const due = duePeriodsUpTo("2026-01-15", 12, "2026-03-31");
    expect(due.map((d) => d.ym)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(due[0].index).toBe(1);
    expect(periodYm("2026-07-09")).toBe("2026-07");
    // never exceeds the schedule's month span.
    expect(duePeriodsUpTo("2026-01-01", 2, "2030-01-01").length).toBe(2);
  });
});

// ── Static: migration contract ────────────────────────────────────────────────
describe("migration 371 — static contract", () => {
  it("has @rollback annotation that drops both tables", () => {
    expect(MIGRATION).toMatch(/@rollback:/);
    expect(MIGRATION).toMatch(/DROP TABLE IF EXISTS prepaid_amortization_postings/);
    expect(MIGRATION).toMatch(/DROP TABLE IF EXISTS prepaid_amortization_schedules/);
  });

  it("is additive + idempotent (IF NOT EXISTS)", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS prepaid_amortization_schedules/);
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS prepaid_amortization_postings/);
    expect(MIGRATION).toMatch(/CREATE (UNIQUE )?INDEX IF NOT EXISTS/);
  });

  it("schedules table has the listed columns incl. dimensions", () => {
    for (const col of [
      '"companyId"', '"branchId"', '"sourceType"', '"sourceId"',
      '"prepaidAccountCode"', '"expenseAccountPurpose"', '"totalAmount"',
      '"startDate"', '"endDate"', '"months"', '"monthlyAmount"',
      '"recognizedAmount"', "status",
      '"vehicleId"', '"propertyId"', '"employeeId"', '"projectId"', '"costCenterId"',
      '"currency"', '"createdAt"', '"updatedAt"', '"deletedAt"',
    ]) {
      expect(MIGRATION).toContain(col);
    }
  });

  it("both tables carry their own companyId (tenant isolation)", () => {
    // two NOT NULL companyId FK declarations — one per table.
    const matches = MIGRATION.match(/"companyId"\s+INTEGER NOT NULL REFERENCES companies/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("stores expenseAccountPurpose TEXT — NO final accountCode column for the expense side", () => {
    expect(MIGRATION).toMatch(/"expenseAccountPurpose"\s+TEXT NOT NULL/);
    // the only *AccountCode column is the prepaid (asset) side — never an expense one.
    expect(MIGRATION).not.toMatch(/"expenseAccountCode"/);
    const codeCols = MIGRATION.match(/"\w*AccountCode"/g) ?? [];
    expect(codeCols).toEqual(['"prepaidAccountCode"']);
  });

  it("has the UNIQUE(companyId,scheduleId,periodYm) idempotency index", () => {
    expect(MIGRATION).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]*?prepaid_amortization_postings[\s\S]*?"companyId"[\s\S]*?"scheduleId"[\s\S]*?"periodYm"/,
    );
  });
});

// ── Pure: JE shape ────────────────────────────────────────────────────────────
describe("amortization JE shape — pure", () => {
  it("DR expense / CR prepaid, balanced", () => {
    const lines = buildAmortizationLines({
      expenseAccountCode: "5310",
      prepaidAccountCode: "1410",
      amount: 100,
      dims: { vehicleId: null, propertyId: null, employeeId: null, projectId: null, costCenterId: null },
    });
    expect(lines).toHaveLength(2);
    const dr = lines.find((l) => l.debit > 0)!;
    const cr = lines.find((l) => l.credit > 0)!;
    expect(dr.accountCode).toBe("5310"); // resolved expense
    expect(cr.accountCode).toBe("1410"); // prepaid asset
    const totalDr = lines.reduce((s, l) => s + l.debit, 0);
    const totalCr = lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDr).toBe(totalCr);
    expect(totalDr).toBe(100);
  });

  it("carries the schedule dimensions onto BOTH lines (e.g. vehicleId for insurance-vehicle)", () => {
    const lines = buildAmortizationLines({
      expenseAccountCode: "5310",
      prepaidAccountCode: "1410",
      amount: 250,
      dims: { vehicleId: 12, propertyId: null, employeeId: null, projectId: 7, costCenterId: 3 },
    });
    for (const l of lines) {
      expect(l.vehicleId).toBe(12);
      expect(l.projectId).toBe(7);
      expect(l.costCenterId).toBe(3);
    }
  });
});

// ── Idempotency contract (static + pure) ──────────────────────────────────────
describe("idempotency — two-layer guard", () => {
  it("sourceKey is the stable prepaid:${id}:${ym} form", () => {
    expect(amortizationSourceKey(42, "2026-03")).toBe("prepaid:42:2026-03");
    // no Date.now-style volatile suffix (financialEngine rejects those).
    expect(amortizationSourceKey(42, "2026-03")).not.toMatch(/1\d{12}/);
  });

  it("engine posts with that sourceKey AND guards on the UNIQUE postings index", () => {
    expect(ENGINE).toMatch(/sourceKey:\s*amortizationSourceKey\(/);
    expect(ENGINE).toMatch(/INSERT INTO prepaid_amortization_postings[\s\S]*?ON CONFLICT[\s\S]*?DO NOTHING/);
  });

  it("the UNIQUE index exists in the migration (second layer)", () => {
    expect(MIGRATION).toMatch(/idx_prepaid_amort_posting_unique/);
  });
});

// ── Period-close gate (static) ────────────────────────────────────────────────
describe("period-close gate", () => {
  it("closeFiscalPeriodCanonical refuses when a due un-posted amortization exists", () => {
    // #2250 — the amortization check now lives in the coordinator, which adds an
    // 'amortization' blocker; the gate aggregates ALL blockers and throws ONCE.
    expect(COORDINATOR).toMatch(/findUnpostedDueAmortizations/);
    expect(COORDINATOR).toMatch(/pendingAmort/);
    expect(COORDINATOR).toMatch(/type:\s*"amortization"/);
    expect(LIFECYCLE).toMatch(/collectPeriodCloseBlockers/);
    expect(LIFECYCLE).toMatch(/throw new ConflictError/);
    // the coordinator is company-scoped (mirrors the pending-manual-JE gate).
    expect(COORDINATOR).toMatch(/companyId/);
  });

  it("the gate helper is company-scoped + reads the postings ledger", () => {
    expect(ENGINE).toMatch(/findUnpostedDueAmortizations/);
    expect(ENGINE).toMatch(/"companyId"=\$1/);
  });
});

// ── Route contract (static) ───────────────────────────────────────────────────
describe("route — static contract", () => {
  it("exposes run + list + create, company-scoped, validates prepaid postable", () => {
    expect(ROUTE).toMatch(/\/amortization\/run/);
    expect(ROUTE).toMatch(/\/amortization\/schedules/);
    expect(ROUTE).toMatch(/assertPostableAccount/);
    expect(ROUTE).toMatch(/scope\.companyId/);
    // does NOT store a final expense accountCode — purpose only.
    expect(ROUTE).toMatch(/expenseAccountPurpose/);
  });
});
