/**
 * FIN-PROPERTY-MEDICAL-INSURANCE (#2249) — insurance posting engine contract.
 *
 * Property + medical insurance REUSE the merged prepaid-amortization engine
 * (#2247) — there is no second amortization engine and no monthly loop here.
 *
 * Static + pure style (mirrors prepaidAmortization.test.ts). Posting is
 * DB-bound, so the premium JE shape, the schedule it opens, and the monthly
 * recognition are covered via PURE re-derivation of the math/decision + a
 * STATIC contract assertion on the engine source (no new migration was added —
 * recognition reuses prepaid_amortization_schedules).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeInsuranceMonths,
  insurancePremiumSourceKey,
  scheduleDimsFor,
} from "../../src/lib/engines/insuranceEngine.js";
import {
  computeMonthlySchedule,
  amountForMonth,
  buildAmortizationLines,
} from "../../src/lib/engines/prepaidAmortizationEngine.js";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const API_SRC = join(REPO_ROOT, "artifacts/api-server/src");
const ENGINE = readFileSync(
  join(API_SRC, "lib/engines/insuranceEngine.ts"),
  "utf8",
);
// Code-only view (comments stripped) — so doc-comment references to the reused
// engine's API (e.g. runDueAmortizations) don't count as re-implementing it.
const ENGINE_CODE = ENGINE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const ROUTE = readFileSync(
  join(API_SRC, "routes/finance-insurance.ts"),
  "utf8",
);

// ── no-duplicate-engine: REUSE #2247, NOT a second amortization loop ──────────
describe("no second amortization engine — REUSES #2247", () => {
  it("imports computeMonthlySchedule from the prepaid-amortization engine", () => {
    expect(ENGINE).toMatch(
      /import\s*\{[\s\S]*computeMonthlySchedule[\s\S]*\}\s*from\s*["']\.\/prepaidAmortizationEngine\.js["']/,
    );
  });

  it("delegates schedule opening to the shared openPrepaidSchedule helper (ج-٧)", () => {
    // ج-٧ (DRY): الـINSERT انتقل لمحرّك الإطفاء (مالك الجدول)؛ هذا المحرّك يستدعي
    // المُساعد المشترك openPrepaidSchedule بدل الإدراج المباشر (لا تكرار INSERT).
    expect(ENGINE).toMatch(/openPrepaidSchedule\(/);
    expect(ENGINE).not.toMatch(/INSERT INTO prepaid_amortization_schedules/);
    expect(ENGINE).toMatch(/sourceType[\s\S]*?\$\{kind\}_insurance|`\$\{kind\}_insurance`/);
  });

  it("does NOT define its own monthly recognition loop / postings ledger", () => {
    // Recognition lives in prepaidAmortizationEngine — this engine must not
    // re-implement the month spreading or the postings idempotency ledger.
    expect(ENGINE_CODE).not.toMatch(/duePeriodsUpTo/);
    expect(ENGINE_CODE).not.toMatch(/amountForMonth/);
    expect(ENGINE_CODE).not.toMatch(/prepaid_amortization_postings/);
    expect(ENGINE_CODE).not.toMatch(/runDue|processDue/);
    // computeInsuranceMonths delegates to the #2247 math, not its own counter.
    expect(ENGINE).toMatch(/computeInsuranceMonths[\s\S]*?computeMonthlySchedule\(/);
  });
});

// ── Pure: months delegate to the shared #2247 math ────────────────────────────
describe("computeInsuranceMonths — pure, delegates to #2247", () => {
  it("matches computeMonthlySchedule's month count", () => {
    expect(computeInsuranceMonths("2026-01-15", "2026-12-15")).toBe(12);
    expect(computeInsuranceMonths("2026-01-01", "2026-06-30")).toBe(6);
    expect(
      computeInsuranceMonths("2026-01-10", "2027-01-10"),
    ).toBe(computeMonthlySchedule({ totalAmount: 0, startDate: "2026-01-10", endDate: "2027-01-10" }).months);
  });
});

// ── Pure: premium JE is DR prepaid / CR vendor-or-source, balanced ────────────
describe("premium JE — pure, balanced DR prepaid / CR vendor|source", () => {
  // Mirror the engine's two-line construction with resolved codes.
  function premiumLines(prepaidCode: string, creditCode: string, amount: number, dim: Record<string, number | undefined>) {
    return [
      { accountCode: prepaidCode, debit: amount, credit: 0, ...dim },
      { accountCode: creditCode, debit: 0, credit: amount, ...dim },
    ];
  }

  it("property: DR prepaid / CR vendor AP, balanced, carries propertyId", () => {
    const dim = { propertyId: 7, unitId: 3, vendorId: 99 };
    const lines = premiumLines("1172", "2111", 1200, dim);
    const dr = lines.find((l) => l.debit > 0)!;
    const cr = lines.find((l) => l.credit > 0)!;
    expect(dr.accountCode).toBe("1172"); // prepaid asset
    expect(cr.accountCode).toBe("2111"); // vendor AP (unpaid)
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(lines.reduce((s, l) => s + l.credit, 0));
    for (const l of lines) {
      expect(l.propertyId).toBe(7);
      expect(l.unitId).toBe(3);
    }
  });

  it("medical: DR prepaid / CR source (paid), balanced, carries employeeId/departmentId", () => {
    const dim = { employeeId: 42, departmentId: 5 };
    const lines = premiumLines("1172", "1111", 600, dim);
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(600);
    expect(lines.reduce((s, l) => s + l.credit, 0)).toBe(600);
    for (const l of lines) {
      expect(l.employeeId).toBe(42);
      expect(l.departmentId).toBe(5);
    }
  });
});

// ── Pure: schedule dims per leg ───────────────────────────────────────────────
describe("scheduleDimsFor — pure dimension routing", () => {
  it("property → propertyId on the schedule; no employeeId", () => {
    const d = scheduleDimsFor("property", { propertyId: 7, employeeId: 42, projectId: 2, costCenterId: 3 });
    expect(d.propertyId).toBe(7);
    expect(d.employeeId).toBeNull();
    expect(d.vehicleId).toBeNull();
    expect(d.projectId).toBe(2);
    expect(d.costCenterId).toBe(3);
  });

  it("medical → employeeId on the schedule; no propertyId", () => {
    const d = scheduleDimsFor("medical", { propertyId: 7, employeeId: 42 });
    expect(d.employeeId).toBe(42);
    expect(d.propertyId).toBeNull();
  });
});

// ── Pure: the opened schedule's recognition carries the leg dimension ─────────
describe("recognition via the reused engine carries the leg dimension", () => {
  it("property schedule → buildAmortizationLines (the #2247 builder) carries propertyId; months/monthlyAmount correct", () => {
    const { months, monthlyAmount } = computeMonthlySchedule({
      totalAmount: 1200,
      startDate: "2026-01-15",
      endDate: "2026-12-15",
    });
    expect(months).toBe(12);
    expect(monthlyAmount).toBe(100);

    const sched = scheduleDimsFor("property", { propertyId: 7 });
    const lines = buildAmortizationLines({
      expenseAccountCode: "5310",
      prepaidAccountCode: "1172",
      amount: amountForMonth(1, 1200, months, monthlyAmount),
      dims: sched,
    });
    const dr = lines.find((l) => l.debit > 0)!;
    const cr = lines.find((l) => l.credit > 0)!;
    expect(dr.accountCode).toBe("5310"); // resolved expense (P&L)
    expect(cr.accountCode).toBe("1172"); // prepaid drawn down
    for (const l of lines) expect(l.propertyId).toBe(7);
    // sums to the total exactly across the schedule.
    let sum = 0;
    for (let m = 1; m <= months; m++) sum += amountForMonth(m, 1200, months, monthlyAmount);
    expect(sum).toBe(1200);
  });

  it("medical schedule → recognition carries employeeId", () => {
    const sched = scheduleDimsFor("medical", { employeeId: 42 });
    const lines = buildAmortizationLines({
      expenseAccountCode: "5320",
      prepaidAccountCode: "1172",
      amount: 50,
      dims: sched,
    });
    for (const l of lines) expect(l.employeeId).toBe(42);
  });
});

// ── Idempotency: stable premium sourceKey (no volatile timestamp) ─────────────
describe("premium sourceKey — stable + idempotent", () => {
  it("is the ${kind}_insurance:${type}:${id}:${policy} form", () => {
    expect(insurancePremiumSourceKey("property", "property", 7, "POL-1")).toBe(
      "property_insurance:property:7:POL-1",
    );
    expect(insurancePremiumSourceKey("medical", "employee", 42)).toBe(
      "medical_insurance:employee:42:default",
    );
  });

  it("has no Date.now-style volatile suffix (financialEngine rejects those)", () => {
    expect(insurancePremiumSourceKey("property", "property", 7)).not.toMatch(/1\d{12}/);
  });

  it("engine posts the premium with that key + sourceType insurance_premium", () => {
    expect(ENGINE).toMatch(/sourceKey:\s*insurancePremiumSourceKey\(/);
    expect(ENGINE).toMatch(/sourceType:\s*["']insurance_premium["']/);
  });
});

// ── Static: engine contract (reuse-first, no stored expense code) ─────────────
describe("engine — static contract", () => {
  it("posts the premium via financialEngine.postJournalEntry", () => {
    expect(ENGINE).toMatch(/financialEngine\.postJournalEntry\(/);
  });

  it("resolves prepaid + credit accounts via resolveAccountCode (purpose → code)", () => {
    expect(ENGINE).toMatch(/financialEngine\.resolveAccountCode\(/);
    expect(ENGINE).toMatch(/purchase_vendor_ap/);
  });

  it("passes expenseAccountPurpose to the schedule — never a final expense code", () => {
    // ج-٧: العمود يُكتَب في المُساعد (مالك الجدول)؛ هذا المحرّك يمرّر الغرض النصّي
    // expenseAccountPurpose لـopenPrepaidSchedule (لا كود مصروف نهائي مخزَّن).
    expect(ENGINE).toMatch(/expenseAccountPurpose/);
    expect(ENGINE).not.toMatch(/expenseAccountCode/);
  });

  it("exposes thin property + medical variants over the shared path", () => {
    expect(ENGINE).toMatch(/postPropertyInsurancePremium/);
    expect(ENGINE).toMatch(/postMedicalInsurancePremium/);
    expect(ENGINE).toMatch(/kind:\s*"property"/);
    expect(ENGINE).toMatch(/kind:\s*"medical"/);
  });
});

// ── Static: route contract ────────────────────────────────────────────────────
describe("route — static contract", () => {
  it("exposes property + medical premium endpoints, company-scoped, finance.journal create", () => {
    expect(ROUTE).toMatch(/\/insurance\/property/);
    expect(ROUTE).toMatch(/\/insurance\/medical/);
    expect(ROUTE).toMatch(/feature:\s*["']finance\.journal["'],\s*action:\s*["']create["']/);
    expect(ROUTE).toMatch(/scope\.companyId/);
    // delegates to the shared engine — no inline GL / recognition logic.
    expect(ROUTE).toMatch(/postInsurancePremium/);
    expect(ROUTE).toMatch(/expenseAccountPurpose/);
  });
});
