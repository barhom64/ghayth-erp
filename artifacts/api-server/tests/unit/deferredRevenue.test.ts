/**
 * FIN-DEFERRED-REVENUE (#2248) — deferred-revenue recognition engine contract.
 *
 * The SYMMETRIC counterpart of prepaidAmortization.test.ts. Static + pure style
 * (mirrors prepaidAmortization.test.ts / financialClosureRegression.test.ts).
 * Posting is DB-bound, so the JE shape, idempotency, and period-close gate are
 * covered via PURE re-derivation of the math/decision + a STATIC contract
 * assertion on the engine/migration source.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeRecognitionSchedule,
  amountForMonth,
  monthsBetween,
  duePeriodsUpTo,
  buildRecognitionLines,
  recognitionSourceKey,
  periodYm,
} from "../../src/lib/engines/deferredRevenueEngine.js";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const API_SRC = join(REPO_ROOT, "artifacts/api-server/src");
const MIGRATION = readFileSync(
  join(API_SRC, "migrations/374_deferred_revenue_schedules.sql"),
  "utf8",
);
const ENGINE = readFileSync(
  join(API_SRC, "lib/engines/deferredRevenueEngine.ts"),
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
  join(API_SRC, "routes/finance-deferred-revenue.ts"),
  "utf8",
);

// ── Pure: computeRecognitionSchedule ──────────────────────────────────────────
describe("computeRecognitionSchedule — pure", () => {
  it("12000 over 12 months → 1000/mo, sum === 12000", () => {
    const { months, monthlyAmount } = computeRecognitionSchedule({
      totalAmount: 12000,
      startDate: "2026-01-15",
      endDate: "2026-12-15",
    });
    expect(months).toBe(12);
    expect(monthlyAmount).toBe(1000);
    let sum = 0;
    for (let m = 1; m <= months; m++) sum += amountForMonth(m, 12000, months, monthlyAmount);
    expect(sum).toBe(12000);
  });

  it("rounding case 1000/3: last month absorbs the remainder, sum === 1000", () => {
    const { months, monthlyAmount } = computeRecognitionSchedule({
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
describe("migration 374 — static contract", () => {
  it("has @rollback annotation that drops both tables", () => {
    expect(MIGRATION).toMatch(/@rollback:/);
    expect(MIGRATION).toMatch(/DROP TABLE IF EXISTS deferred_revenue_postings/);
    expect(MIGRATION).toMatch(/DROP TABLE IF EXISTS deferred_revenue_schedules/);
  });

  it("is additive + idempotent (IF NOT EXISTS)", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS deferred_revenue_schedules/);
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS deferred_revenue_postings/);
    expect(MIGRATION).toMatch(/CREATE (UNIQUE )?INDEX IF NOT EXISTS/);
  });

  it("schedules table has the listed columns incl. dimensions", () => {
    for (const col of [
      '"companyId"', '"branchId"', '"sourceType"', '"sourceId"',
      '"deferredRevenueAccountCode"', '"revenueAccountPurpose"', '"totalAmount"',
      '"startDate"', '"endDate"', '"recognitionMethod"', '"months"', '"monthlyAmount"',
      '"recognizedAmount"', '"remainingAmount"', "status",
      '"propertyId"', '"unitId"', '"contractId"',
      '"umrahSeasonId"', '"umrahAgentId"', '"clientId"', '"costCenterId"',
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

  it("stores revenueAccountPurpose TEXT — NO final accountCode column for the revenue side", () => {
    expect(MIGRATION).toMatch(/"revenueAccountPurpose"\s+TEXT NOT NULL/);
    // the only *AccountCode column is the deferred (liability) side — never a revenue one.
    expect(MIGRATION).not.toMatch(/"revenueAccountCode"/);
    const codeCols = MIGRATION.match(/"\w*AccountCode"/g) ?? [];
    expect(codeCols).toEqual(['"deferredRevenueAccountCode"']);
  });

  it("has the UNIQUE(companyId,scheduleId,periodYm) idempotency index", () => {
    expect(MIGRATION).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]*?deferred_revenue_postings[\s\S]*?"companyId"[\s\S]*?"scheduleId"[\s\S]*?"periodYm"/,
    );
  });
});

// ── Pure: JE shape ────────────────────────────────────────────────────────────
describe("recognition JE shape — pure", () => {
  it("DR deferred-revenue liability / CR revenue, balanced (mirror of amortization)", () => {
    const lines = buildRecognitionLines({
      deferredRevenueAccountCode: "2410",
      revenueAccountCode: "4110",
      amount: 1000,
      dims: {
        propertyId: null, unitId: null, contractId: null,
        umrahSeasonId: null, umrahAgentId: null, clientId: null, costCenterId: null,
      },
    });
    expect(lines).toHaveLength(2);
    const dr = lines.find((l) => l.debit > 0)!;
    const cr = lines.find((l) => l.credit > 0)!;
    expect(dr.accountCode).toBe("2410"); // deferred-revenue liability debited down
    expect(cr.accountCode).toBe("4110"); // resolved revenue credited
    const totalDr = lines.reduce((s, l) => s + l.debit, 0);
    const totalCr = lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDr).toBe(totalCr);
    expect(totalDr).toBe(1000);
  });

  it("carries rent dimensions (contractId/propertyId) onto BOTH lines", () => {
    const lines = buildRecognitionLines({
      deferredRevenueAccountCode: "2410",
      revenueAccountCode: "4110",
      amount: 250,
      dims: {
        propertyId: 8, unitId: 5, contractId: 99,
        umrahSeasonId: null, umrahAgentId: null, clientId: null, costCenterId: 3,
      },
    });
    for (const l of lines) {
      expect(l.propertyId).toBe(8);
      expect(l.contractId).toBe(99);
      expect(l.costCenterId).toBe(3);
    }
  });

  it("carries umrah dimensions (umrahSeasonId) onto BOTH lines", () => {
    const lines = buildRecognitionLines({
      deferredRevenueAccountCode: "2410",
      revenueAccountCode: "4120",
      amount: 500,
      dims: {
        propertyId: null, unitId: null, contractId: null,
        umrahSeasonId: 42, umrahAgentId: 7, clientId: 13, costCenterId: null,
      },
    });
    for (const l of lines) {
      expect(l.umrahSeasonId).toBe(42);
      expect(l.umrahAgentId).toBe(7);
      expect(l.clientId).toBe(13);
    }
  });
});

// ── Idempotency contract (static + pure) ──────────────────────────────────────
describe("idempotency — two-layer guard", () => {
  it("sourceKey is the stable deferred_revenue:${id}:${ym} form", () => {
    expect(recognitionSourceKey(42, "2026-03")).toBe("deferred_revenue:42:2026-03");
    // no Date.now-style volatile suffix (financialEngine rejects those).
    expect(recognitionSourceKey(42, "2026-03")).not.toMatch(/1\d{12}/);
  });

  it("engine posts with that sourceKey AND guards on the UNIQUE postings index", () => {
    expect(ENGINE).toMatch(/sourceKey:\s*recognitionSourceKey\(/);
    expect(ENGINE).toMatch(/INSERT INTO deferred_revenue_postings[\s\S]*?ON CONFLICT[\s\S]*?DO NOTHING/);
  });

  it("the UNIQUE index exists in the migration (second layer)", () => {
    expect(MIGRATION).toMatch(/idx_deferred_rev_posting_unique/);
  });
});

// ── Period-close gate (static) ────────────────────────────────────────────────
describe("period-close gate", () => {
  it("closeFiscalPeriodCanonical refuses when a due un-posted recognition exists", () => {
    // #2250 — the deferred-revenue check now lives in the coordinator, which adds
    // a 'deferred_revenue' blocker; the gate aggregates ALL blockers, throws ONCE.
    expect(COORDINATOR).toMatch(/findUnpostedDueRecognitions/);
    expect(COORDINATOR).toMatch(/pendingDefRev/);
    expect(COORDINATOR).toMatch(/type:\s*"deferred_revenue"/);
    expect(LIFECYCLE).toMatch(/collectPeriodCloseBlockers/);
    expect(LIFECYCLE).toMatch(/throw new ConflictError/);
    // the coordinator is company-scoped (mirrors the amortization / pending-JE gate).
    expect(COORDINATOR).toMatch(/companyId/);
  });

  it("the gate helper is company-scoped + reads the postings ledger", () => {
    expect(ENGINE).toMatch(/findUnpostedDueRecognitions/);
    expect(ENGINE).toMatch(/"companyId"=\$1/);
  });
});

// ── Route contract (static) ───────────────────────────────────────────────────
describe("route — static contract", () => {
  it("exposes run + list + create, company-scoped, validates deferred postable", () => {
    expect(ROUTE).toMatch(/\/deferred-revenue\/run/);
    expect(ROUTE).toMatch(/\/deferred-revenue\/schedules/);
    expect(ROUTE).toMatch(/assertPostableAccount/);
    expect(ROUTE).toMatch(/scope\.companyId/);
    // does NOT store a final revenue accountCode — purpose only.
    expect(ROUTE).toMatch(/revenueAccountPurpose/);
  });
});
