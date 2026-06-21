/**
 * الفوترة المتكررة — الدفعة (2): المولّد الدفتري. assertion بلا DB (نمط #2698).
 *
 * يمسّ الدفتر لكن **لا منطق قيد جديد**: يُعاد استخدام financialEngine.postSalesInvoice
 * (يملك الترقيم/الضريبة/الحسابات/القيد المتوازن/idempotency). يُحاكى المحرك + rawdb
 * فيُؤكَّد: بناء الطلب الصحيح + إدراج صفّ الفاتورة بإجماليات prepared + تقديم الجدول
 * + مفتاح idempotency على تاريخ الاستحقاق.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { postSalesInvoiceMock, rawQueryMock, rawExecuteMock, computeNextRunDateMock, captured } = vi.hoisted(() => {
  const captured: any = { insertSql: "", insertParams: [] as any[], request: null as any };
  return {
    captured,
    computeNextRunDateMock: vi.fn(() => "2026-02-01"),
    rawQueryMock: vi.fn(),
    rawExecuteMock: vi.fn(async () => ({ affectedRows: 1 })),
    // يحاكي المحرك: يستدعي insertInvoice بـ prepared (كما يفعل الحقيقي) ويلتقط الإدراج.
    postSalesInvoiceMock: vi.fn(async (request: any, insertInvoice: any) => {
      captured.request = request;
      const fakeClient = {
        query: async (sql: string, params: any[]) => { captured.insertSql = sql; captured.insertParams = params; return { rows: [{ id: 999 }] }; },
      };
      const prepared = {
        invoiceNumber: "INV-REC-1", invoiceDate: request.invoiceDate, dueDate: request.dueDate, currency: request.currency,
        subtotalExclTax: 100, taxTotal: 15, grandTotal: 115, arAccountCode: "1131", revenueAccountCode: ["4101"],
        taxAccountCode: "2151", lineBreakdown: [{ taxRate: 15 }], period: "2026-01",
      };
      await insertInvoice(prepared, fakeClient);
      return { invoiceId: 999, invoiceNumber: "INV-REC-1", journalEntryId: 5, postingStatus: "posted" };
    }),
  };
});

vi.mock("../../src/lib/engines/index.js", () => ({ financialEngine: { postSalesInvoice: postSalesInvoiceMock } }));
vi.mock("../../src/lib/rawdb.js", () => ({ rawQuery: rawQueryMock, rawExecute: rawExecuteMock }));
vi.mock("../../src/lib/recurringJournalProcessor.js", () => ({ computeNextRunDate: computeNextRunDateMock }));

const TEMPLATE = {
  id: 7, companyId: 2, branchId: 1, clientId: 9, title: "اشتراك شهري",
  lines: [{ description: "خدمة صيانة", quantity: 1, unitPriceExclTax: 100, isTaxable: true, taxCode: "VAT_STANDARD" }],
  currency: "SAR", frequency: "monthly", nextRunDate: "2026-01-01", dueInDays: 30, notes: null,
};

describe("#recurring-invoice generator — reuses postSalesInvoice façade (ledger owned by engine)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    computeNextRunDateMock.mockReturnValue("2026-02-01");
    rawQueryMock.mockImplementation(async (sql: string) => {
      if (/FROM recurring_invoice_templates/.test(sql) && /WHERE id = \$1/.test(sql)) return [{ ...TEMPLATE }];
      return [];
    });
    rawExecuteMock.mockResolvedValue({ affectedRows: 1 });
  });

  it("builds the sales-invoice request from the template (client, lines, finance module)", async () => {
    const { runRecurringInvoice } = await import("../../src/lib/recurringInvoiceProcessor.js");
    const res = await runRecurringInvoice({ companyId: 2, templateId: 7, createdBy: 100, today: "2026-01-15" });

    expect(res.generated).toBe(true);
    expect(res.invoiceId).toBe(999);
    expect(postSalesInvoiceMock).toHaveBeenCalledTimes(1);
    const req = captured.request;
    expect(req.clientId).toBe(9);
    expect(req.moduleKey).toBe("finance");
    expect(req.entityKey).toBe("sales_invoice");
    expect(req.lines).toHaveLength(1);
    expect(req.lines[0]).toMatchObject({ description: "خدمة صيانة", quantity: 1, unitPriceExclTax: 100, isTaxable: true, taxCode: "VAT_STANDARD" });
  });

  it("is idempotent on (template, due-date): sourceKey carries the run date", async () => {
    const { runRecurringInvoice } = await import("../../src/lib/recurringInvoiceProcessor.js");
    await runRecurringInvoice({ companyId: 2, templateId: 7, createdBy: 100, today: "2026-01-15" });
    expect(captured.request.sourceRefs.sourceKey).toBe("finance:recurring_invoice:2:7:2026-01-01");
    expect(captured.request.sourceRefs.sourceType).toBe("recurring_invoice");
  });

  it("inserts the invoice row with the engine-prepared totals (ref/total/tax/status sent)", async () => {
    const { runRecurringInvoice } = await import("../../src/lib/recurringInvoiceProcessor.js");
    await runRecurringInvoice({ companyId: 2, templateId: 7, createdBy: 100, today: "2026-01-15" });
    expect(captured.insertSql).toMatch(/INSERT INTO invoices/);
    expect(captured.insertSql).toMatch(/'sent'/);
    // params: [companyId, branchId, clientId, ref, title, subtotal, total, vatAmount, vatRate, dueDate, createdBy, notes]
    expect(captured.insertParams).toContain("INV-REC-1"); // ref = prepared.invoiceNumber
    expect(captured.insertParams).toContain(115);          // total = prepared.grandTotal
    expect(captured.insertParams).toContain(15);           // vatAmount = prepared.taxTotal
  });

  it("advances the schedule from the DUE date (not today) so the cycle never drifts", async () => {
    const { runRecurringInvoice } = await import("../../src/lib/recurringInvoiceProcessor.js");
    const res = await runRecurringInvoice({ companyId: 2, templateId: 7, createdBy: 100, today: "2026-01-15" });
    expect(computeNextRunDateMock).toHaveBeenCalledWith("2026-01-01", "monthly");
    const upd = rawExecuteMock.mock.calls.find((c) => /UPDATE recurring_invoice_templates SET "lastRunDate"/.test(c[0]));
    expect(upd).toBeTruthy();
    expect(upd![1]).toEqual(["2026-01-01", "2026-02-01", 7, 2]);
    expect(res.nextRunDate).toBe("2026-02-01");
  });

  it("does NOT generate when the template is not due yet (force=false)", async () => {
    const { runRecurringInvoice } = await import("../../src/lib/recurringInvoiceProcessor.js");
    const res = await runRecurringInvoice({ companyId: 2, templateId: 7, createdBy: 100, today: "2025-12-01", force: false });
    expect(res.generated).toBe(false);
    expect(postSalesInvoiceMock).not.toHaveBeenCalled();
  });
});
