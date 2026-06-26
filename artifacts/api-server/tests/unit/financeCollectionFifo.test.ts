import { describe, it, expect } from "vitest";
import {
  allocateReceiptFifo,
  validateManualApplications,
  CollectionError,
  type OpenInvoice,
} from "../../src/lib/financeCollectionFifo.js";

/**
 * م٣ — تخصيص التحصيل. النواة نقية بلا قاعدة بيانات: نثبت أن FIFO (الأقدم أولًا)
 * والسداد الجزئي والزائد والتخصيص اليدوي حتمية وصحيحة — قبل أي ترحيل دفتر.
 */

const inv = (invoiceId: number, outstanding: number, date?: string): OpenInvoice => ({ invoiceId, outstanding, date });

describe("allocateReceiptFifo", () => {
  it("applies oldest-first, fully clearing earlier invoices", () => {
    const res = allocateReceiptFifo([inv(1, 100), inv(2, 100), inv(3, 100)], 250);
    expect(res.applications).toEqual([
      { invoiceId: 1, amount: 100 },
      { invoiceId: 2, amount: 100 },
      { invoiceId: 3, amount: 50 }, // سداد جزئي للأخيرة
    ]);
    expect(res.leftover).toBe(0);
    expect(res.appliedTotal).toBe(250);
  });

  it("records leftover (excess → advance) when amount exceeds all outstanding", () => {
    const res = allocateReceiptFifo([inv(1, 100), inv(2, 50)], 200);
    expect(res.applications).toEqual([
      { invoiceId: 1, amount: 100 },
      { invoiceId: 2, amount: 50 },
    ]);
    expect(res.leftover).toBe(50);
    expect(res.appliedTotal).toBe(150);
  });

  it("partial payment of the single oldest invoice leaves it open", () => {
    const res = allocateReceiptFifo([inv(1, 100), inv(2, 100)], 60);
    expect(res.applications).toEqual([{ invoiceId: 1, amount: 60 }]);
    expect(res.leftover).toBe(0);
  });

  it("orders by date oldest-first even when input order is shuffled", () => {
    const res = allocateReceiptFifo(
      [inv(3, 100, "2026-03-01"), inv(1, 100, "2026-01-01"), inv(2, 100, "2026-02-01")],
      150,
    );
    expect(res.applications.map((a) => a.invoiceId)).toEqual([1, 2]);
    expect(res.applications[1].amount).toBe(50);
  });

  it("skips zero/negative-outstanding invoices", () => {
    const res = allocateReceiptFifo([inv(1, 0), inv(2, -5), inv(3, 80)], 80);
    expect(res.applications).toEqual([{ invoiceId: 3, amount: 80 }]);
    expect(res.leftover).toBe(0);
  });

  it("handles fractional amounts with 2-dp rounding (balanced)", () => {
    const res = allocateReceiptFifo([inv(1, 33.33), inv(2, 33.33)], 50);
    expect(res.applications[0]).toEqual({ invoiceId: 1, amount: 33.33 });
    expect(res.applications[1]).toEqual({ invoiceId: 2, amount: 16.67 });
    expect(res.appliedTotal).toBe(50);
    expect(res.leftover).toBe(0);
  });

  it("whole amount is leftover when there are no open invoices", () => {
    const res = allocateReceiptFifo([], 500);
    expect(res.applications).toEqual([]);
    expect(res.leftover).toBe(500);
  });

  it("throws on non-positive amount", () => {
    expect(() => allocateReceiptFifo([inv(1, 100)], 0)).toThrow(CollectionError);
    expect(() => allocateReceiptFifo([inv(1, 100)], -10)).toThrow(CollectionError);
  });
});

describe("validateManualApplications", () => {
  const open = [inv(1, 100), inv(2, 200), inv(3, 50)];

  it("accepts a valid manual split + computes leftover", () => {
    const res = validateManualApplications(open, [{ invoiceId: 2, amount: 200 }, { invoiceId: 3, amount: 30 }], 300);
    expect(res.appliedTotal).toBe(230);
    expect(res.leftover).toBe(70);
  });

  it("allows partial payment of an invoice (apply < outstanding)", () => {
    const res = validateManualApplications(open, [{ invoiceId: 2, amount: 120 }], 120);
    expect(res.applications).toEqual([{ invoiceId: 2, amount: 120 }]);
    expect(res.leftover).toBe(0);
  });

  it("rejects an application above the invoice outstanding", () => {
    expect(() => validateManualApplications(open, [{ invoiceId: 1, amount: 150 }], 150)).toThrow(/يتجاوز المتبقي/);
  });

  it("rejects total applications exceeding the received amount", () => {
    expect(() => validateManualApplications(open, [{ invoiceId: 1, amount: 100 }, { invoiceId: 2, amount: 200 }], 250))
      .toThrow(/يتجاوز المبلغ المستلم/);
  });

  it("rejects a duplicate invoice in the split", () => {
    expect(() => validateManualApplications(open, [{ invoiceId: 1, amount: 50 }, { invoiceId: 1, amount: 50 }], 100))
      .toThrow(/مكرّرة/);
  });

  it("rejects an invoice that is not in the open set", () => {
    expect(() => validateManualApplications(open, [{ invoiceId: 999, amount: 10 }], 10)).toThrow(/ليست ضمن الفواتير المفتوحة/);
  });

  it("ignores zero-amount applications silently", () => {
    const res = validateManualApplications(open, [{ invoiceId: 1, amount: 0 }, { invoiceId: 2, amount: 50 }], 50);
    expect(res.applications).toEqual([{ invoiceId: 2, amount: 50 }]);
  });
});
