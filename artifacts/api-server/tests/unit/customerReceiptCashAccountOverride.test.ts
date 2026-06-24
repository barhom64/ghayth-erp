/**
 * #2698 — خزنة/بنك سند القبض: تأكيد سطور القيد (assertion) بلا قاعدة بيانات.
 *
 * يمسّ الدفتر: السطر المدين (النقد/البنك) لقيد سند القبض يجب أن يقع على
 * الحساب الذي اختاره الموظف صراحةً (cashAccountCode) — لا الحلّ الآلي بالطريقة.
 * عند غياب الاختيار يبقى السلوك القديم حرفيًا (resolveAccountCode بالطريقة).
 *
 * يُحاكى المحرك + rawdb (نمط deferredRevenueAccountMisuse) فيُلتقط
 * postJournalEntry.lines ويُؤكَّد عليها محليًا — البوابة التكاملية على DB
 * (customerReceiptPosting.dynamic) تؤكّد السلوك الكامل في CI.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveAccountCodeMock, postJournalEntryMock, rawQueryMock } = vi.hoisted(() => ({
  // يعيد المحرّك القيمة الافتراضية (الوسيط الرابع) حرفيًا ليعكس الأكواد الحقيقية.
  resolveAccountCodeMock: vi.fn(async (_c: number, _op: string, _side: string, fallback: string) => fallback),
  postJournalEntryMock: vi.fn(async () => ({ journalId: 7, ref: "REC-x", alreadyExists: false })),
  rawQueryMock: vi.fn(),
}));

vi.mock("../../src/lib/engines/index.js", () => ({
  financialEngine: { resolveAccountCode: resolveAccountCodeMock, postJournalEntry: postJournalEntryMock },
}));

vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: rawQueryMock,
  withTransaction: async (cb: (tx: any) => Promise<void>) => cb({
    query: async (sql: string) => {
      if (/FOR UPDATE/.test(sql)) {
        return { rows: [{ id: 55, total: 100, paidAmount: 0, status: "sent", ref: "INV-1", clientId: 9, branchId: 1 }] };
      }
      return { rows: [] };
    },
  }),
}));

vi.mock("../../src/lib/businessHelpers.js", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, checkFinancialPeriodOpen: vi.fn(async () => ({ open: true })) };
});

// التحقق من تطابق التصنيف مع الطريقة (نفس قاعدة السندات) — مُحاكى ليُمرّر بلا DB.
const assertPaymentSourceAllowedMock = vi.fn(async () => {});
vi.mock("../../src/lib/financePostingPolicy.js", () => ({
  assertPaymentSourceAllowed: assertPaymentSourceAllowedMock,
}));

function baseParams() {
  return {
    companyId: 2, branchId: 1, createdBy: 100, clientId: 9,
    amount: 100, method: "cash", receiptKey: "abcd1234efgh",
    applications: [{ invoiceId: 55, amount: 100 }],
  };
}

describe("#2698 — customer receipt cash/bank account override (JE lines)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rawQueryMock.mockImplementation(async (sql: string) => {
      if (/FROM clients/.test(sql)) return [{ id: 9 }];
      if (/FROM chart_of_accounts/.test(sql)) return [{ code: "1102", allowPosting: true }];
      if (/FROM journal_entries/.test(sql)) return []; // no idempotency dup
      return [];
    });
  });

  it("DEBIT cash leg uses the operator-selected account when cashAccountCode is set", async () => {
    const { postCustomerReceipt } = await import("../../src/lib/customerReceiptService.js");
    await postCustomerReceipt({ ...baseParams(), cashAccountCode: "1102" } as any);

    expect(assertPaymentSourceAllowedMock).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 2, accountCode: "1102", paymentMethod: "cash" }),
    );
    const lines = postJournalEntryMock.mock.calls[0]![0]!.lines as Array<{ accountCode: string; debit: number; credit: number }>;
    const debitLeg = lines.find((l) => l.debit > 0)!;
    expect(debitLeg.accountCode).toBe("1102");          // ← الخزنة المختارة، لا الافتراضي
    expect(debitLeg.debit).toBe(100);
    // القيد متوازن
    const dr = lines.reduce((s, l) => s + l.debit, 0);
    const cr = lines.reduce((s, l) => s + l.credit, 0);
    expect(dr).toBeCloseTo(cr, 5);
  });

  it("falls back to the engine-resolved account when cashAccountCode is absent (legacy behaviour)", async () => {
    const { postCustomerReceipt } = await import("../../src/lib/customerReceiptService.js");
    await postCustomerReceipt(baseParams() as any);

    expect(assertPaymentSourceAllowedMock).not.toHaveBeenCalled();
    const lines = postJournalEntryMock.mock.calls[0]![0]!.lines as Array<{ accountCode: string; debit: number }>;
    const debitLeg = lines.find((l) => l.debit > 0)!;
    expect(debitLeg.accountCode).toBe("1111");          // ← fallback الطريقة النقدية
  });

  it("rejects a cashAccountCode that does not exist for the company", async () => {
    rawQueryMock.mockImplementation(async (sql: string) => {
      if (/FROM clients/.test(sql)) return [{ id: 9 }];
      if (/FROM chart_of_accounts/.test(sql)) return []; // الحساب غير موجود
      return [];
    });
    const { postCustomerReceipt } = await import("../../src/lib/customerReceiptService.js");
    await expect(postCustomerReceipt({ ...baseParams(), cashAccountCode: "9999" } as any))
      .rejects.toThrow(/غير موجود/);
    expect(postJournalEntryMock).not.toHaveBeenCalled();
  });

  it("rejects a non-postable (header) cashAccountCode", async () => {
    rawQueryMock.mockImplementation(async (sql: string) => {
      if (/FROM clients/.test(sql)) return [{ id: 9 }];
      if (/FROM chart_of_accounts/.test(sql)) return [{ code: "1100", allowPosting: false }];
      return [];
    });
    const { postCustomerReceipt } = await import("../../src/lib/customerReceiptService.js");
    await expect(postCustomerReceipt({ ...baseParams(), cashAccountCode: "1100" } as any))
      .rejects.toThrow(/غير قابل للترحيل/);
    expect(postJournalEntryMock).not.toHaveBeenCalled();
  });
});
