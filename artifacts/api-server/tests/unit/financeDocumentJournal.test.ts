import { describe, it, expect } from "vitest";
import {
  buildDocumentJournalLegs,
  resolveDocumentLine,
  resolveDocumentLines,
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
