// #1945 item 5 — direction-aware voucher (صرف=مصروف / قبض=إيراد) on the live
// head-of-main DB. assertOperationValid rule (4) must reject a counter
// account whose chart TYPE contradicts the voucher direction/operation —
// previously a سند قبض crediting an EXPENSE account posted silently and
// flipped the P&L. Asserts against the REAL chart types of the seeded
// company, and proves a valid combination still posts the exact JE lines.
// Activates only when DATABASE_URL points at the test cluster.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY = 2;
const BRANCH = 2;
const BY = 2;
// Real seeded chart types (verified postable): revenue / expense / asset(AR) / liability
const REVENUE = "4910";   // فوائد ومرابحات بنكية
const EXPENSE = "5390";   // مصروفات وعمولات بنكية
const AR = "1131";        // عملاء محليون
const LIABILITY = "2170"; // تأمينات وضمانات من العملاء
const CASH = "1111";      // الصندوق الرئيسي
const REF_PREFIX = "test-item5-";

const baseCtx = (direction: "receipt" | "payment", operationKey: string | null, counter: string) => ({
  operationType: direction,
  companyId: COMPANY,
  branchId: BRANCH,
  counterAccount: { accountCode: counter, operationKey, direction },
  allocationTarget: "none" as const,
  dimensions: {},
  operationalEffect: { kind: "none" as const },
});

d("item 5 — direction-aware voucher counter account (live DB)", () => {
  let assertOperationValid: typeof import("../../src/lib/financeOperationContext.js").assertOperationValid;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;

  beforeAll(async () => {
    ({ assertOperationValid } = await import("../../src/lib/financeOperationContext.js"));
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    ({ reverseAccountBalances } = await import("../../src/lib/businessHelpers.js"));
  });

  async function cleanup() {
    if (!rawExecute) return;
    const jes = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref LIKE $2`, [COMPANY, REF_PREFIX + "%"]);
    for (const je of jes) {
      try { await reverseAccountBalances(COMPANY, je.id); } catch { /* not applied */ }
      await rawExecute(`DELETE FROM journal_lines WHERE "journalId"=$1`, [je.id]);
      await rawExecute(`DELETE FROM journal_entries WHERE id=$1`, [je.id]);
    }
  }
  afterAll(cleanup);

  it("rejects a سند قبض onto an EXPENSE account (general receipt expects revenue)", async () => {
    await expect(assertOperationValid(baseCtx("receipt", "receipt", EXPENSE) as any))
      .rejects.toThrow(/يتوقع حساب إيراد/);
  });

  it("rejects a سند صرف onto a REVENUE account (general payment expects expense)", async () => {
    await expect(assertOperationValid(baseCtx("payment", "payment", REVENUE) as any))
      .rejects.toThrow(/يتوقع حساب مصروف/);
  });

  it("accepts the correct general directions: قبض→إيراد، صرف→مصروف", async () => {
    await expect(assertOperationValid(baseCtx("receipt", "receipt", REVENUE) as any)).resolves.toBeUndefined();
    await expect(assertOperationValid(baseCtx("payment", "payment", EXPENSE) as any)).resolves.toBeUndefined();
  });

  it("operation-specific types: invoice_payment→ذمم (asset)، deposit→التزام، advance→أصل", async () => {
    await expect(assertOperationValid(baseCtx("receipt", "invoice_payment", AR) as any)).resolves.toBeUndefined();
    await expect(assertOperationValid(baseCtx("receipt", "deposit", LIABILITY) as any)).resolves.toBeUndefined();
    await expect(assertOperationValid(baseCtx("payment", "advance", AR) as any)).resolves.toBeUndefined();
    // and the wrong type for a specific operation still fails
    await expect(assertOperationValid(baseCtx("receipt", "invoice_payment", REVENUE) as any))
      .rejects.toThrow(/يتوقع حساب أصول/);
  });

  it("unknown operationType falls back to the direction invariant only", async () => {
    // قبض على مصروف ممنوع حتى بدون نوع عملية معروف
    await expect(assertOperationValid(baseCtx("receipt", "some_legacy_op", EXPENSE) as any))
      .rejects.toThrow(/سند قبض لا يُقيَّد على حساب مصروف/);
    // صرف على إيراد ممنوع
    await expect(assertOperationValid(baseCtx("payment", null, REVENUE) as any))
      .rejects.toThrow(/سند صرف لا يُقيَّد على حساب إيراد/);
    // لكن قبض على ذمم/التزامات مسموح في الوضع العام (تسويات مشروعة)
    await expect(assertOperationValid(baseCtx("receipt", "some_legacy_op", AR) as any)).resolves.toBeUndefined();
  });

  it("a valid direction posts the exact voucher JE lines (قبض: مدين صندوق / دائن إيراد)", async () => {
    const ctx = baseCtx("receipt", "receipt", REVENUE);
    await assertOperationValid(ctx as any);

    const { financialEngine } = await import("../../src/lib/engines/index.js");
    const { journalId } = await financialEngine.postJournalEntry({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY,
      ref: REF_PREFIX + "rv", description: "direction-aware receipt pin",
      sourceType: "voucher", sourceId: 0, sourceKey: REF_PREFIX + "rv",
      lines: [
        { accountCode: CASH, debit: 90, credit: 0 },
        { accountCode: REVENUE, debit: 0, credit: 90 },
      ],
      deferBalances: true, // FIN-007 — vouchers defer balances until approval
    });

    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit::text, credit::text FROM journal_lines WHERE "journalId"=$1 ORDER BY debit DESC`,
      [journalId],
    );
    expect(lines.map((l) => [l.accountCode, Number(l.debit), Number(l.credit)])).toEqual([
      [CASH, 90, 0],
      [REVENUE, 0, 90],
    ]);
  });
});
