import { describe, it, expect } from "vitest";
import { buildAmortizationLines } from "../../src/lib/engines/prepaidAmortizationEngine.js";

// Direct unit coverage for buildAmortizationLines — the pure journal-line
// builder shared by BOTH the prepaid-amortization and insurance-amortization
// engines (insuranceEngine.ts:26 reuses it). It produces the monthly
// DR expense / CR prepaid-asset entry; locking its shape + dimension passthrough
// + balance guards every amortization posting in the system.

interface Line {
  accountCode: string; debit: number; credit: number;
  vehicleId?: number; propertyId?: number; employeeId?: number; projectId?: number; costCenterId?: number;
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const sumDebit = (ls: Line[]) => round2(ls.reduce((s, l) => s + l.debit, 0));
const sumCredit = (ls: Line[]) => round2(ls.reduce((s, l) => s + l.credit, 0));
const noDims = { vehicleId: null, propertyId: null, employeeId: null, projectId: null, costCenterId: null };

describe("buildAmortizationLines — amortization journal_lines builder", () => {
  it("DR expense / CR prepaid for the amount, two legs, balanced", () => {
    const lines = buildAmortizationLines({
      expenseAccountCode: "5530", prepaidAccountCode: "1172", amount: 1200.75, dims: noDims,
    }) as Line[];
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ accountCode: "5530", debit: 1200.75, credit: 0 });
    expect(lines[1]).toMatchObject({ accountCode: "1172", debit: 0, credit: 1200.75 });
    expect(sumDebit(lines)).toBe(sumCredit(lines));
  });

  it("stamps the cost dimensions on BOTH legs; null dims are not stamped", () => {
    const lines = buildAmortizationLines({
      expenseAccountCode: "5530", prepaidAccountCode: "1172", amount: 500,
      dims: { vehicleId: 7, propertyId: null, employeeId: null, projectId: 3, costCenterId: 9 },
    }) as Line[];
    expect(lines.every(l => l.vehicleId === 7)).toBe(true);
    expect(lines.every(l => l.projectId === 3)).toBe(true);
    expect(lines.every(l => l.costCenterId === 9)).toBe(true);
    expect(lines.every(l => l.propertyId === undefined)).toBe(true);  // null → undefined, not stamped
    expect(lines.every(l => l.employeeId === undefined)).toBe(true);
  });

  it("rounds the amount to 2 decimals on both legs (stays balanced)", () => {
    const lines = buildAmortizationLines({
      expenseAccountCode: "5530", prepaidAccountCode: "1172", amount: 99.999, dims: noDims,
    }) as Line[];
    expect(lines[0].debit).toBe(100);   // roundTo2(99.999)
    expect(lines[1].credit).toBe(100);
    expect(sumDebit(lines)).toBe(sumCredit(lines));
  });

  it("falls back to a default Arabic description when none is given", () => {
    const lines = buildAmortizationLines({
      expenseAccountCode: "5530", prepaidAccountCode: "1172", amount: 10, dims: noDims,
    }) as Array<Line & { description: string }>;
    expect(lines[0].description).toBe("إطفاء مصروف مدفوع مقدماً");
    expect(lines[1].description).toBe("إطفاء مصروف مدفوع مقدماً");
  });
});
