/**
 * تحقّق ترتيب نطاق التاريخ (start ≤ end) — دفعة متعلّقة بالدفتر. نفس صنف #2871
 * لكن على مخطّطين يغذّيان حسابات مالية: عقد الموظف (←الرواتب) وقاعدة التسعير
 * (←أسعار الفواتير). تحقّق إدخال فقط — لا تغيير في منطق الحساب. اختبار سلوكي.
 *
 * hr-contracts: refine مطبَّق على الإنشاء والتحديث الجزئي (عبر contractFields الأساسي).
 */
import { describe, it, expect } from "vitest";
import { createContractSchema } from "../../src/routes/hr-contracts.js";
import { ruleBodySchema } from "../../src/routes/finance-pricing.js";

describe("date-range order — employee contract (startDate ≤ endDate)", () => {
  const base = { employeeId: 1, contractType: "permanent", startDate: "2026-01-01" };
  it("rejects endDate before startDate", () => {
    expect(createContractSchema.safeParse({ ...base, endDate: "2025-12-01" }).success).toBe(false);
  });
  it("accepts ordered, equal, and open-ended (no endDate) contracts", () => {
    expect(createContractSchema.safeParse({ ...base, endDate: "2026-12-31" }).success).toBe(true);
    expect(createContractSchema.safeParse({ ...base, endDate: "2026-01-01" }).success).toBe(true);
    expect(createContractSchema.safeParse(base).success).toBe(true);
  });
});

describe("date-range order — pricing rule validity (validFrom ≤ validTo)", () => {
  const base = { name: "قاعدة" };
  it("rejects validTo before validFrom", () => {
    expect(ruleBodySchema.safeParse({ ...base, validFrom: "2026-06-01", validTo: "2026-05-01" }).success).toBe(false);
  });
  it("accepts ordered, equal, and open-ended validity windows", () => {
    expect(ruleBodySchema.safeParse({ ...base, validFrom: "2026-05-01", validTo: "2026-06-01" }).success).toBe(true);
    expect(ruleBodySchema.safeParse({ ...base, validFrom: "2026-05-01", validTo: "2026-05-01" }).success).toBe(true);
    expect(ruleBodySchema.safeParse({ ...base, validFrom: "2026-05-01" }).success).toBe(true);
    expect(ruleBodySchema.safeParse(base).success).toBe(true);
  });
});
