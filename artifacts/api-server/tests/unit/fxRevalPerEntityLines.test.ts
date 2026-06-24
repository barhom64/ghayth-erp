/**
 * اختبارات assertion إلزامية (يمسّ الدفتر) لقيد إعادة تقييم FX المفصّل لكل كيان.
 *
 * يغطّي:
 *   (أ) التوازن: مدين=دائن في حالات (عميل واحد / عدة عملاء / خليط عملاء+موردين /
 *       صافي صفر يُحذف).
 *   (ب) مطابقة الإجمالي: Σ سطري G/L = totalGain/totalLoss على نفس المدخلات
 *       (التفصيل لا يغيّر الصافي).
 *   (ج) كل سطر AR يحمل clientId، كل سطر AP يحمل vendorId، سطرا G/L بلا بُعد.
 *   (د) الإنفاذ: السطور المفصّلة تجتاز assertDimensionContract/assertLedgerTruth
 *       بلا رمي؛ واختبار سلبي: AR على 1131 بلا clientId يرمي.
 */
import { describe, it, expect } from "vitest";
import {
  buildPeriodRevalLines,
  type FxRevalInvoiceRow,
  type FxRevalPoRow,
} from "../../src/lib/fx/build-period-reval-lines.js";
import {
  assertDimensionContract,
  assertLedgerTruth,
} from "../../src/lib/financePostingPolicy.js";

const ACCOUNTS = { arCode: "1131", apCode: "2111", gainCode: "4910", lossCode: "5910" };
const PERIOD = "2026-06";

// عميل أو مورد، عملة USD سعرها المبدئي 3.75 والإقفال 3.80 (فرق موجب).
function inv(
  id: number,
  clientId: number | null,
  total: number,
  paid = 0,
  booked = 3.75,
  currency = "USD",
): FxRevalInvoiceRow {
  return { id, ref: `INV-${id}`, currency, exchangeRate: booked, total, paidAmount: paid, clientId };
}
function po(
  id: number,
  supplierId: number | null,
  totalAmount: number,
  booked = 3.75,
  currency = "USD",
): FxRevalPoRow {
  return { id, ref: `PO-${id}`, currency, exchangeRate: booked, totalAmount, supplierId };
}

const RATE = { USD: 3.8 }; // إقفال

function totals(lines: { accountCode: string; debit: number; credit: number }[]) {
  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  return { debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 };
}

describe("buildPeriodRevalLines — (أ) التوازن", () => {
  it("عميل واحد: مدين=دائن", () => {
    const r = buildPeriodRevalLines({
      invoices: [inv(1, 100, 1000)],
      purchaseOrders: [],
      rateMap: RATE,
      accounts: ACCOUNTS,
      period: PERIOD,
    });
    const t = totals(r.lines);
    expect(t.debit).toBe(t.credit);
    expect(t.debit).toBeGreaterThan(0);
  });

  it("عدة عملاء: مدين=دائن، سطر AR لكل عميل", () => {
    const r = buildPeriodRevalLines({
      invoices: [inv(1, 100, 1000), inv(2, 200, 500), inv(3, 300, 2000)],
      purchaseOrders: [],
      rateMap: RATE,
      accounts: ACCOUNTS,
      period: PERIOD,
    });
    const t = totals(r.lines);
    expect(t.debit).toBe(t.credit);
    const arLines = r.lines.filter((l) => l.accountCode === ACCOUNTS.arCode);
    expect(arLines).toHaveLength(3);
    expect(new Set(arLines.map((l) => l.clientId))).toEqual(new Set([100, 200, 300]));
  });

  it("خليط عملاء + موردين: مدين=دائن", () => {
    const r = buildPeriodRevalLines({
      invoices: [inv(1, 100, 1000), inv(2, 200, 800)],
      purchaseOrders: [po(10, 900, 600), po(11, 901, 1200)],
      rateMap: RATE,
      accounts: ACCOUNTS,
      period: PERIOD,
    });
    const t = totals(r.lines);
    expect(t.debit).toBe(t.credit);
    expect(r.lines.filter((l) => l.accountCode === ACCOUNTS.arCode)).toHaveLength(2);
    expect(r.lines.filter((l) => l.accountCode === ACCOUNTS.apCode)).toHaveLength(2);
  });

  it("صافي صفر لعميل واحد (فاتورتان متعاكستان) → يُحذف سطره", () => {
    // فاتورة فرقها موجب (booked 3.75 → 3.80) وأخرى فرقها سالب (booked 3.85 → 3.80)
    // بنفس المبلغ لنفس العميل → الصافي صفر.
    const r = buildPeriodRevalLines({
      invoices: [inv(1, 100, 1000, 0, 3.75), inv(2, 100, 1000, 0, 3.85)],
      purchaseOrders: [],
      rateMap: RATE,
      accounts: ACCOUNTS,
      period: PERIOD,
    });
    const arLines = r.lines.filter((l) => l.accountCode === ACCOUNTS.arCode);
    expect(arLines).toHaveLength(0);
    // ولا سطور إجمالية إن لا مكسب ولا خسارة.
    expect(r.lines).toHaveLength(0);
    expect(r.totalGain).toBe(0);
    expect(r.totalLoss).toBe(0);
  });

  it("التوازن يبقى صحيحًا مع وجود مكسب وخسارة معًا (عملاء متعاكسون)", () => {
    const r = buildPeriodRevalLines({
      invoices: [inv(1, 100, 1000, 0, 3.75) /* مكسب */, inv(2, 200, 1000, 0, 3.9) /* خسارة */],
      purchaseOrders: [],
      rateMap: RATE,
      accounts: ACCOUNTS,
      period: PERIOD,
    });
    const t = totals(r.lines);
    expect(t.debit).toBe(t.credit);
    expect(r.totalGain).toBeGreaterThan(0);
    expect(r.totalLoss).toBeGreaterThan(0);
  });
});

describe("buildPeriodRevalLines — (ب) مطابقة الإجمالي (التفصيل لا يغيّر الصافي)", () => {
  it("Σ سطور المكسب = totalGain و Σ سطور الخسارة = totalLoss", () => {
    const r = buildPeriodRevalLines({
      invoices: [inv(1, 100, 1000, 0, 3.75), inv(2, 200, 1000, 0, 3.9)],
      purchaseOrders: [po(10, 900, 600, 3.9) /* AP فرق سالب → مكسب */],
      rateMap: RATE,
      accounts: ACCOUNTS,
      period: PERIOD,
    });
    const gainLine = r.lines.find((l) => l.accountCode === ACCOUNTS.gainCode);
    const lossLine = r.lines.find((l) => l.accountCode === ACCOUNTS.lossCode);
    expect(gainLine?.credit ?? 0).toBeCloseTo(r.totalGain, 2);
    expect(lossLine?.debit ?? 0).toBeCloseTo(r.totalLoss, 2);
  });

  it("الإجمالي ثابت بين المجمّع والمفصّل لنفس المدخلات", () => {
    const invoices = [inv(1, 100, 1000, 0, 3.75), inv(2, 200, 1500, 0, 3.75)];
    const pos = [po(10, 900, 800, 3.75)];
    // المجمّع (مرجع): فرق AR = (1000+1500)*0.05 = 125 ؛ فرق AP = 800*0.05 = 40.
    // AR موجب → مكسب 125 ؛ AP موجب (التزام يرتفع) → خسارة 40.
    const r = buildPeriodRevalLines({
      invoices, purchaseOrders: pos, rateMap: RATE, accounts: ACCOUNTS, period: PERIOD,
    });
    expect(r.totalGain).toBeCloseTo(125, 2);
    expect(r.totalLoss).toBeCloseTo(40, 2);
    expect(r.arDiff).toBeCloseTo(125, 2);
    expect(r.apDiff).toBeCloseTo(40, 2);
  });
});

describe("buildPeriodRevalLines — (ج) الأبعاد على السطور", () => {
  it("كل سطر AR يحمل clientId، كل سطر AP يحمل vendorId، سطرا G/L بلا بُعد", () => {
    const r = buildPeriodRevalLines({
      invoices: [inv(1, 100, 1000), inv(2, 200, 1000, 0, 3.9)],
      purchaseOrders: [po(10, 900, 600), po(11, 901, 600, 3.9)],
      rateMap: RATE,
      accounts: ACCOUNTS,
      period: PERIOD,
    });
    for (const l of r.lines.filter((x) => x.accountCode === ACCOUNTS.arCode)) {
      expect(l.clientId).toBeGreaterThan(0);
      expect(l.vendorId).toBeUndefined();
    }
    for (const l of r.lines.filter((x) => x.accountCode === ACCOUNTS.apCode)) {
      expect(l.vendorId).toBeGreaterThan(0);
      expect(l.clientId).toBeUndefined();
    }
    for (const l of r.lines.filter(
      (x) => x.accountCode === ACCOUNTS.gainCode || x.accountCode === ACCOUNTS.lossCode,
    )) {
      expect(l.clientId).toBeUndefined();
      expect(l.vendorId).toBeUndefined();
    }
  });

  it("فاتورة بلا عميل / أمر شراء بلا مورد → يُتخطّى ويُسجَّل (لا إسقاط صامت)", () => {
    const r = buildPeriodRevalLines({
      invoices: [inv(1, null, 1000), inv(2, 200, 1000)],
      purchaseOrders: [po(10, null, 600), po(11, 901, 600)],
      rateMap: RATE,
      accounts: ACCOUNTS,
      period: PERIOD,
    });
    expect(r.skipped).toHaveLength(2);
    expect(r.skipped.map((s) => s.kind).sort()).toEqual(["AP", "AR"]);
    // البنود المتخطّاة لا تدخل أبعاد القيد ولا الإجمالي.
    expect(r.lines.filter((l) => l.clientId === undefined && l.accountCode === ACCOUNTS.arCode)).toHaveLength(0);
    // ما تبقّى متوازن.
    const t = totals(r.lines);
    expect(t.debit).toBe(t.credit);
  });
});

describe("buildPeriodRevalLines — (د) الإنفاذ عبر عقد البُعد", () => {
  it("السطور المفصّلة تجتاز assertDimensionContract بلا رمي", () => {
    const r = buildPeriodRevalLines({
      invoices: [inv(1, 100, 1000), inv(2, 200, 1000, 0, 3.9)],
      purchaseOrders: [po(10, 900, 600), po(11, 901, 600, 3.9)],
      rateMap: RATE,
      accounts: ACCOUNTS,
      period: PERIOD,
    });
    expect(() => assertDimensionContract({ lines: r.lines })).not.toThrow();
  });

  it("السطور المفصّلة تجتاز assertLedgerTruth (مُنسِّق) بلا رمي", () => {
    const r = buildPeriodRevalLines({
      invoices: [inv(1, 100, 1000)],
      purchaseOrders: [po(10, 900, 600)],
      rateMap: RATE,
      accounts: ACCOUNTS,
      period: PERIOD,
    });
    expect(() =>
      assertLedgerTruth({
        lines: r.lines as any,
        header: { type: "fx_revaluation", sourceType: "fx_revaluation", isManual: false },
      }),
    ).not.toThrow();
  });

  it("سلبي: سطر AR على 1131 بلا clientId يرمي (يثبت أن الإنفاذ فعّال)", () => {
    const badLines = [
      { accountCode: "1131", debit: 50, credit: 0, description: "AR بلا عميل" },
      { accountCode: "4910", debit: 0, credit: 50, description: "مكسب" },
    ];
    expect(() => assertDimensionContract({ lines: badLines })).toThrow();
  });

  it("سلبي: سطر AP على 2111 بلا vendorId يرمي", () => {
    const badLines = [
      { accountCode: "2111", debit: 0, credit: 40, description: "AP بلا مورد" },
      { accountCode: "5910", debit: 40, credit: 0, description: "خسارة" },
    ];
    expect(() => assertDimensionContract({ lines: badLines })).toThrow();
  });
});
