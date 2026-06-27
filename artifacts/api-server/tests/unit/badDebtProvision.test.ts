// Constitution Rule 3 (Ledger safety) — the delta-to-target math decides the
// bad-debt journal lines, so it carries unit assertions. The companion
// badDebtProvisionDelta.dynamic.test.ts asserts the posted journal_lines + the
// 1135 balance against a live DB.
import { describe, it, expect } from "vitest";
import { computeBadDebtTarget, badDebtDeltaLines } from "../../src/lib/finance/badDebtProvision.js";
import { STANDARD_BAD_DEBT_RATES } from "../../src/lib/badDebtPolicy.js";

const DAY = 86400000;
const ASOF = new Date("2026-06-30").getTime();
// An invoice that is `daysOverdue` days past due as of ASOF (created 30d before due).
const inv = (daysOverdue: number, outstanding: number) => ({
  createdAt: new Date(ASOF - (daysOverdue + 30) * DAY).toISOString(),
  dueDate: new Date(ASOF - daysOverdue * DAY).toISOString(),
  outstanding,
});

describe("bad-debt provision — aging target (computeBadDebtTarget)", () => {
  it("buckets invoices by days-overdue and applies the standard rates", () => {
    const { buckets, target } = computeBadDebtTarget(
      [inv(-5, 1000), inv(15, 1000), inv(45, 1000), inv(75, 1000), inv(120, 1000)],
      ASOF,
      STANDARD_BAD_DEBT_RATES,
    );
    expect(buckets).toEqual({ current: 1000, d30: 1000, d60: 1000, d90: 1000, d90plus: 1000 });
    // 1000*(0 + .05 + .25 + .5 + .75) = 1550
    expect(target).toBe(1550);
  });

  it("an invoice with no dueDate falls due 30 days after creation", () => {
    const createdAt = new Date(ASOF - 100 * DAY).toISOString(); // due = ASOF-70 ⇒ 70 days ⇒ d90 bucket
    const { buckets } = computeBadDebtTarget(
      [{ createdAt, dueDate: null, outstanding: 500 }],
      ASOF,
      STANDARD_BAD_DEBT_RATES,
    );
    expect(buckets.d90).toBe(500);
  });

  it("empty invoice set → zero target", () => {
    expect(computeBadDebtTarget([], ASOF, STANDARD_BAD_DEBT_RATES).target).toBe(0);
  });
});

describe("bad-debt provision — signed delta lines (badDebtDeltaLines)", () => {
  it("delta > 0 raises the provision: DR 5820 / CR 1135, balanced", () => {
    const r = badDebtDeltaLines(1550, 1000, "5820", "1135");
    expect(r).not.toBeNull();
    expect(r!.delta).toBe(550);
    expect(r!.lines).toEqual([
      { accountCode: "5820", debit: 550, credit: 0 },
      { accountCode: "1135", debit: 0, credit: 550 },
    ]);
    const dr = r!.lines.reduce((s, l) => s + l.debit, 0);
    const cr = r!.lines.reduce((s, l) => s + l.credit, 0);
    expect(dr).toBe(cr);
  });

  it("delta < 0 releases the provision: DR 1135 / CR 5820, balanced", () => {
    const r = badDebtDeltaLines(800, 1000, "5820", "1135");
    expect(r!.delta).toBe(-200);
    expect(r!.lines).toEqual([
      { accountCode: "1135", debit: 200, credit: 0 },
      { accountCode: "5820", debit: 0, credit: 200 },
    ]);
  });

  it("|delta| < 0.01 (already at target) → null, no entry", () => {
    expect(badDebtDeltaLines(1000, 1000, "5820", "1135")).toBeNull();
    expect(badDebtDeltaLines(1000.004, 1000, "5820", "1135")).toBeNull();
  });

  it("uses the resolved account codes, not hardcoded ones", () => {
    const r = badDebtDeltaLines(100, 0, "5825", "1136");
    expect(r!.lines[0].accountCode).toBe("5825");
    expect(r!.lines[1].accountCode).toBe("1136");
  });
});
