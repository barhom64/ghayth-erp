import { describe, it, expect } from "vitest";
import {
  buildDocumentJournalLegs,
  resolveDocumentLine,
  resolveDocumentLines,
  buildDocumentPersistencePlan,
  DocumentJournalError,
} from "../../src/lib/financeDocumentJournal.js";

/**
 * م١-ب — assertion test on the derived journal lines (الدستور قاعدة ٣: لا تغيير
 * قيد بلا اختبار assertion على سطور القيد). Pure builder → no DB needed.
 * Reference: docs/finance-audit/25 §٢/§١١.١ ; issue #2994.
 */
describe("buildDocumentJournalLegs — م١-ب multi-line posting", () => {
  const sumDebit = (legs: { debit: number }[]) => legs.reduce((s, l) => s + l.debit, 0);
  const sumCredit = (legs: { credit: number }[]) => legs.reduce((s, l) => s + l.credit, 0);

  it("payment with 3 lines (different expense accounts) → balanced multi-leg journal", () => {
    const legs = buildDocumentJournalLegs(
      { direction: "payment", cashAccountCode: "1111", vatAccountCode: "1180" },
      [
        { lineNo: 1, net: 1000, vat: 150, counterAccountCode: "5510" },
        { lineNo: 2, net: 2000, vat: 300, counterAccountCode: "5610" },
        { lineNo: 3, net: 500, vat: 75, counterAccountCode: "5399" },
      ],
    );
    // 3 expense debits + 1 VAT debit + 1 cash credit
    expect(legs).toHaveLength(5);
    expect(sumDebit(legs)).toBeCloseTo(sumCredit(legs), 2);
    const cash = legs.find((l) => l.accountCode === "1111")!;
    expect(cash.credit).toBeCloseTo(4025, 2); // 3500 net + 525 VAT
    expect(cash.debit).toBe(0);
    const vat = legs.find((l) => l.accountCode === "1180")!;
    expect(vat.debit).toBeCloseTo(525, 2);
    // every expense leg is a debit carrying its source line
    const expenseLegs = legs.filter((l) => ["5510", "5610", "5399"].includes(l.accountCode));
    expect(expenseLegs.every((l) => l.credit === 0 && l.lineNo != null)).toBe(true);
  });

  it("splits ONE line (9,000 maintenance) across 3 vehicles with per-entity dims + costBearer", () => {
    const legs = buildDocumentJournalLegs(
      { direction: "payment", cashAccountCode: "1111" },
      [
        {
          lineNo: 1,
          net: 9000,
          vat: 0,
          counterAccountCode: "5610",
          allocations: [
            { entityType: "vehicle", entityId: 11, amount: 3000 },
            { entityType: "vehicle", entityId: 12, amount: 3000 },
            { entityType: "vehicle", entityId: 13, amount: 3000, costBearer: "driver" },
          ],
        },
      ],
    );
    const expenseLegs = legs.filter((l) => l.accountCode === "5610");
    expect(expenseLegs).toHaveLength(3);
    expect(expenseLegs.map((l) => l.debit)).toEqual([3000, 3000, 3000]);
    expect(expenseLegs[0].entityRef).toEqual({ entityType: "vehicle", entityId: 11 });
    expect(expenseLegs[2].dims?.costBearer).toBe("driver");
    // cash credit = full 9,000; journal balances
    const cash = legs.find((l) => l.accountCode === "1111")!;
    expect(cash.credit).toBeCloseTo(9000, 2);
    expect(sumDebit(legs)).toBeCloseTo(sumCredit(legs), 2);
  });

  it("receipt flips direction: revenue credited, VAT output credited, cash debited", () => {
    const legs = buildDocumentJournalLegs(
      { direction: "receipt", cashAccountCode: "1111", vatAccountCode: "2131" },
      [{ lineNo: 1, net: 1000, vat: 150, counterAccountCode: "4120" }],
    );
    expect(legs.find((l) => l.accountCode === "1111")!.debit).toBeCloseTo(1150, 2);
    expect(legs.find((l) => l.accountCode === "4120")!.credit).toBeCloseTo(1000, 2);
    expect(legs.find((l) => l.accountCode === "2131")!.credit).toBeCloseTo(150, 2);
    expect(sumDebit(legs)).toBeCloseTo(sumCredit(legs), 2);
  });

  it("rejects an allocation split that does not sum to the line net", () => {
    expect(() =>
      buildDocumentJournalLegs({ direction: "payment", cashAccountCode: "1111" }, [
        {
          lineNo: 1,
          net: 9000,
          vat: 0,
          counterAccountCode: "5610",
          allocations: [{ entityType: "vehicle", entityId: 11, amount: 3000 }],
        },
      ]),
    ).toThrow(DocumentJournalError);
  });

  it("rejects VAT-bearing lines with no VAT account", () => {
    expect(() =>
      buildDocumentJournalLegs({ direction: "payment", cashAccountCode: "1111" }, [
        { lineNo: 1, net: 1000, vat: 150, counterAccountCode: "5510" },
      ]),
    ).toThrow(DocumentJournalError);
  });

  it("rejects an empty document", () => {
    expect(() =>
      buildDocumentJournalLegs({ direction: "payment", cashAccountCode: "1111" }, []),
    ).toThrow(DocumentJournalError);
  });
});

describe("resolveDocumentLine — raw input → resolved line", () => {
  it("computes net + VAT from qty × unitPrice × rate%", () => {
    const r = resolveDocumentLine({
      lineNo: 1, quantity: 10, unitPrice: 100, taxRatePercent: 15, counterAccountCode: "5510",
    });
    expect(r.net).toBeCloseTo(1000, 2);
    expect(r.vat).toBeCloseTo(150, 2);
  });

  it("normalizes percent allocations to amounts (30/30/40 of 9,000)", () => {
    const r = resolveDocumentLine({
      lineNo: 1, quantity: 1, unitPrice: 9000, counterAccountCode: "5610",
      allocations: [
        { entityType: "vehicle", entityId: 11, allocationType: "percent", percent: 30 },
        { entityType: "vehicle", entityId: 12, allocationType: "percent", percent: 30 },
        { entityType: "vehicle", entityId: 13, allocationType: "percent", percent: 40 },
      ],
    });
    expect(r.allocations!.map((a) => a.amount)).toEqual([2700, 2700, 3600]);
  });

  it("normalizes quantity allocations to amounts (qty × unitPrice)", () => {
    const r = resolveDocumentLine({
      lineNo: 1, quantity: 100, unitPrice: 5, counterAccountCode: "5510", // net 500
      allocations: [
        { entityType: "project", entityId: 1, allocationType: "quantity", quantity: 60 }, // 300
        { entityType: "project", entityId: 2, allocationType: "quantity", quantity: 40 }, // 200
      ],
    });
    expect(r.allocations!.map((a) => a.amount)).toEqual([300, 200]);
  });

  it("resolve → build end-to-end: percent split balances", () => {
    const lines = resolveDocumentLines([
      {
        lineNo: 1, quantity: 1, unitPrice: 9000, counterAccountCode: "5610",
        allocations: [
          { entityType: "vehicle", entityId: 11, allocationType: "percent", percent: 50 },
          { entityType: "vehicle", entityId: 12, allocationType: "percent", percent: 50 },
        ],
      },
    ]);
    const legs = buildDocumentJournalLegs({ direction: "payment", cashAccountCode: "1111" }, lines);
    expect(legs.filter((l) => l.accountCode === "5610").map((l) => l.debit)).toEqual([4500, 4500]);
    expect(legs.reduce((s, l) => s + l.debit, 0)).toBeCloseTo(
      legs.reduce((s, l) => s + l.credit, 0), 2,
    );
  });
});

describe("buildDocumentPersistencePlan — rows to insert + legs to post", () => {
  it("maps lines to financial_document_lines rows with computed tax + total", () => {
    const plan = buildDocumentPersistencePlan(
      { direction: "payment", cashAccountCode: "1111", vatAccountCode: "1180" },
      [
        { lineNo: 1, itemName: "ديزل", unit: "لتر", quantity: 100, unitPrice: 2, taxRatePercent: 15, counterAccountCode: "5510" },
        { lineNo: 2, itemName: "إطار", unit: "قطعة", quantity: 4, unitPrice: 250, counterAccountCode: "5610" },
      ],
    );
    expect(plan.lineRows).toHaveLength(2);
    expect(plan.lineRows[0]).toMatchObject({
      lineNo: 1, itemName: "ديزل", unit: "لتر", quantity: 100, unitPrice: 2,
      taxAmount: 30, lineTotal: 230, accountCode: "5510",
    });
    expect(plan.lineRows[1]).toMatchObject({ taxAmount: 0, lineTotal: 1000, accountCode: "5610" });
    expect(plan.totals).toMatchObject({ net: 1200, vat: 30, gross: 1230 });
    // journal balances
    expect(plan.journalLegs.reduce((s, l) => s + l.debit, 0)).toBeCloseTo(
      plan.journalLegs.reduce((s, l) => s + l.credit, 0), 2,
    );
  });

  it("preserves allocation split type (percent) + links rows by lineNo", () => {
    const plan = buildDocumentPersistencePlan(
      { direction: "payment", cashAccountCode: "1111" },
      [
        {
          lineNo: 1, itemName: "صيانة", quantity: 1, unitPrice: 9000, counterAccountCode: "5610",
          allocations: [
            { entityType: "vehicle", entityId: 11, allocationType: "percent", percent: 50 },
            { entityType: "vehicle", entityId: 12, allocationType: "percent", percent: 50, costBearer: "driver" },
          ],
        },
      ],
    );
    expect(plan.allocationRows).toHaveLength(2);
    expect(plan.allocationRows[0]).toMatchObject({
      lineNo: 1, entityType: "vehicle", entityId: 11, allocationType: "percent", percent: 50, amount: null, quantity: null,
    });
    expect(plan.allocationRows[1].costBearer).toBe("driver");
    // the journal still splits into two 4,500 legs (resolved from percent)
    expect(plan.journalLegs.filter((l) => l.accountCode === "5610").map((l) => l.debit)).toEqual([4500, 4500]);
  });
});

describe("buildDocumentJournalLegs — م٥ تفريع costBearer (حساب ذمة الطرف)", () => {
  const sumDebit = (legs: { debit: number }[]) => legs.reduce((s, l) => s + l.debit, 0);
  const sumCredit = (legs: { credit: number }[]) => legs.reduce((s, l) => s + l.credit, 0);

  it("شريحة بمتحمِّل ≠ الشركة (overrideAccountCode) تُمدِّن ذمة الطرف لا المصروف", () => {
    // صرف 1000 على مصروف 5510، المتحمِّل سائق → ذمة الموظف 1143 بدل المصروف (§١٠).
    const legs = buildDocumentJournalLegs(
      { direction: "payment", cashAccountCode: "1111" },
      [
        {
          lineNo: 1, net: 1000, vat: 0, counterAccountCode: "5510",
          allocations: [
            { entityType: "employee", entityId: 7, amount: 1000, costBearer: "driver", overrideAccountCode: "1143" },
          ],
        },
      ],
    );
    expect(legs.some((l) => l.accountCode === "5510")).toBe(false); // لا مصروف
    const rec = legs.find((l) => l.accountCode === "1143")!;
    expect(rec.debit).toBeCloseTo(1000, 2);
    expect(rec.credit).toBe(0);
    const cash = legs.find((l) => l.accountCode === "1111")!;
    expect(cash.credit).toBeCloseTo(1000, 2);
    expect(sumDebit(legs)).toBeCloseTo(sumCredit(legs), 2);
  });

  it("شريحة مختلطة: حصة الشركة تبقى مصروفًا، حصة الطرف تتحوّل ذمة — والقيد متوازن", () => {
    const legs = buildDocumentJournalLegs(
      { direction: "payment", cashAccountCode: "1111" },
      [
        {
          lineNo: 1, net: 2000, vat: 0, counterAccountCode: "5510",
          allocations: [
            { entityType: "unit", entityId: 1, amount: 1000, costBearer: "company" },
            { entityType: "tenant", entityId: 2, amount: 1000, costBearer: "tenant", overrideAccountCode: "1131" },
          ],
        },
      ],
    );
    expect(legs.find((l) => l.accountCode === "5510")!.debit).toBeCloseTo(1000, 2); // الشركة → مصروف
    expect(legs.find((l) => l.accountCode === "1131")!.debit).toBeCloseTo(1000, 2); // المستأجر → ذمة
    expect(legs.find((l) => l.accountCode === "1111")!.credit).toBeCloseTo(2000, 2);
    expect(sumDebit(legs)).toBeCloseTo(sumCredit(legs), 2);
  });
});
