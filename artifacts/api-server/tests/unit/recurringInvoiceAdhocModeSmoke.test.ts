/**
 * F3 — فصل التشغيل اليدوي (adhoc) عن الدورة المجدوَلة (scheduled). assertion بلا DB.
 *
 * العيب المُصلَح: `runRecurringInvoice` كان **يقدّم الجدول دائمًا** ويحجز مفتاح
 * idempotency على nextRunDate المستقبلي، فالتشغيل اليدوي قبل الاستحقاق كان يستهلك
 * الدورة المجدوَلة ويحجبها. القرار (إبراهيم): اليدوي = «فاتورة إضافية» (adhoc) —
 * لا يقدّم الجدول ولا يحجب الدورة.
 *
 * يمسّ الدفتر لكن **لا منطق قيد جديد**: يُعاد استخدام financialEngine.postSalesInvoice
 * (يملك القيد المتوازن + سطوره + idempotency). نؤكّد هنا سلوك الجدول/المفتاح/التاريخ
 * + أن سطور الفاتورة (ومن ثَمّ القيد) تُمرَّر للمحرّك كما هي بلا أي منطق قيد محلي.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { postSalesInvoiceMock, rawQueryMock, rawExecuteMock, computeNextRunDateMock, captured } = vi.hoisted(() => {
  const captured: any = { request: null as any, updateCalls: [] as Array<{ sql: string; params: any[] }> };
  return {
    captured,
    computeNextRunDateMock: vi.fn(() => "2026-02-01"),
    rawQueryMock: vi.fn(),
    rawExecuteMock: vi.fn(async (sql: string, params: any[]) => {
      captured.updateCalls.push({ sql, params });
      return { affectedRows: 1 };
    }),
    postSalesInvoiceMock: vi.fn(async (request: any, insertInvoice: any) => {
      captured.request = request;
      const fakeClient = { query: async () => ({ rows: [{ id: 999 }] }) };
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

function scheduleUpdate() {
  return captured.updateCalls.find((c: any) => /UPDATE recurring_invoice_templates SET "lastRunDate"/.test(c.sql));
}

describe("F3 — adhoc vs scheduled recurring-invoice run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.request = null;
    captured.updateCalls = [];
    computeNextRunDateMock.mockReturnValue("2026-02-01");
    rawQueryMock.mockImplementation(async (sql: string) => {
      if (/FROM recurring_invoice_templates/.test(sql) && /WHERE id = \$1/.test(sql)) return [{ ...TEMPLATE }];
      return [];
    });
  });

  it("adhoc BEFORE due: issues an invoice dated today, keyed adhoc:today, and does NOT advance the schedule", async () => {
    const { runRecurringInvoice } = await import("../../src/lib/recurringInvoiceProcessor.js");
    // today (2025-12-01) is BEFORE nextRunDate (2026-01-01) — would be "not due" under scheduled.
    const res = await runRecurringInvoice({ companyId: 2, templateId: 7, createdBy: 100, today: "2025-12-01", mode: "adhoc" });

    expect(res.generated).toBe(true);
    // dated today, not the due date.
    expect(captured.request.invoiceDate).toBe("2025-12-01");
    // idempotency key is day-scoped adhoc — distinct from the scheduled cycle key.
    expect(captured.request.sourceRefs.sourceKey).toBe("finance:recurring_invoice:2:7:adhoc:2025-12-01");
    // schedule is NOT advanced: computeNextRunDate untouched, returned nextRunDate unchanged…
    expect(computeNextRunDateMock).not.toHaveBeenCalled();
    expect(res.nextRunDate).toBe("2026-01-01");
    // …and the UPDATE must NOT touch "nextRunDate".
    const upd = scheduleUpdate();
    expect(upd).toBeTruthy();
    expect(upd!.sql).not.toMatch(/"nextRunDate"\s*=/);
    expect(upd!.params).toEqual(["2025-12-01", 7, 2]); // lastRunDate=today, id, companyId
  });

  it("force:true maps to adhoc (backward-compat) — same non-advancing behavior", async () => {
    const { runRecurringInvoice } = await import("../../src/lib/recurringInvoiceProcessor.js");
    const res = await runRecurringInvoice({ companyId: 2, templateId: 7, createdBy: 100, today: "2025-12-01", force: true });

    expect(res.generated).toBe(true);
    expect(captured.request.sourceRefs.sourceKey).toBe("finance:recurring_invoice:2:7:adhoc:2025-12-01");
    expect(computeNextRunDateMock).not.toHaveBeenCalled();
    expect(res.nextRunDate).toBe("2026-01-01");
  });

  it("adhoc idempotency is day-scoped: re-running the same day reuses the exact sourceKey", async () => {
    const { runRecurringInvoice } = await import("../../src/lib/recurringInvoiceProcessor.js");
    await runRecurringInvoice({ companyId: 2, templateId: 7, createdBy: 100, today: "2025-12-01", mode: "adhoc" });
    const key1 = captured.request.sourceRefs.sourceKey;
    captured.request = null;
    await runRecurringInvoice({ companyId: 2, templateId: 7, createdBy: 100, today: "2025-12-01", mode: "adhoc" });
    const key2 = captured.request.sourceRefs.sourceKey;
    // identical key on the same day ⇒ postSalesInvoice collapses the duplicate (engine-owned idempotency).
    expect(key1).toBe(key2);
    expect(key2).toBe("finance:recurring_invoice:2:7:adhoc:2025-12-01");
  });

  it("scheduled WHEN due: keys on the due date and advances the schedule from the due date", async () => {
    const { runRecurringInvoice } = await import("../../src/lib/recurringInvoiceProcessor.js");
    // today (2026-01-15) is on/after nextRunDate (2026-01-01) — due.
    const res = await runRecurringInvoice({ companyId: 2, templateId: 7, createdBy: 100, today: "2026-01-15", mode: "scheduled" });

    expect(res.generated).toBe(true);
    expect(captured.request.sourceRefs.sourceKey).toBe("finance:recurring_invoice:2:7:2026-01-01");
    expect(computeNextRunDateMock).toHaveBeenCalledWith("2026-01-01", "monthly");
    const upd = scheduleUpdate();
    expect(upd!.sql).toMatch(/"nextRunDate"\s*=\s*\$2/);
    expect(upd!.params).toEqual(["2026-01-01", "2026-02-01", 7, 2]); // lastRunDate=due, nextRunDate=next, id, company
    expect(res.nextRunDate).toBe("2026-02-01");
  });

  it("scheduled BEFORE due does NOT generate (cron safety) — engine never invoked", async () => {
    const { runRecurringInvoice } = await import("../../src/lib/recurringInvoiceProcessor.js");
    const res = await runRecurringInvoice({ companyId: 2, templateId: 7, createdBy: 100, today: "2025-12-01", mode: "scheduled" });
    expect(res.generated).toBe(false);
    expect(res.reason).toBe("غير مستحقّ بعد");
    expect(postSalesInvoiceMock).not.toHaveBeenCalled();
  });

  it("no local journal logic: the full invoice (and its JE) is delegated to postSalesInvoice with the template lines intact", async () => {
    const { runRecurringInvoice } = await import("../../src/lib/recurringInvoiceProcessor.js");
    await runRecurringInvoice({ companyId: 2, templateId: 7, createdBy: 100, today: "2025-12-01", mode: "adhoc" });
    // the engine façade is the ONLY ledger path; the processor builds no JE lines itself.
    expect(postSalesInvoiceMock).toHaveBeenCalledTimes(1);
    const req = captured.request;
    expect(req.moduleKey).toBe("finance");
    expect(req.entityKey).toBe("sales_invoice");
    expect(req.lines).toHaveLength(1);
    expect(req.lines[0]).toMatchObject({ description: "خدمة صيانة", quantity: 1, unitPriceExclTax: 100, isTaxable: true, taxCode: "VAT_STANDARD" });
    // no raw INSERT into journal_entries / journal_entry_lines from the processor layer.
    expect(captured.updateCalls.every((c: any) => !/journal_entr/i.test(c.sql))).toBe(true);
  });
});
