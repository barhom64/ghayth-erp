// م٣ — integration assertion on the ACTUAL journal_lines a «قبض» collection posts
// (constitution rule 3: لا تغيير قيد بلا اختبار assertion على سطور القيد). Proves
// the NEW part of م٣: postCollection computes FIFO server-side over the customer's
// open invoices (oldest first) and posts via the approved postCustomerReceipt
// engine (DR cash / CR AR per invoice + CR advance for the leftover). Mirrors the
// fixture of customerReceiptPosting.dynamic.test.ts. Activates only when
// DATABASE_URL points at the test cluster; skips otherwise. docs/25 §٧.٣ + §٩.٣.
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
const PFX = "test-m3-collect-";

d("م٣ — postCollection: server-side FIFO over open invoices + balanced JE (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;
  let postCollection: typeof import("../../src/lib/financeCollectionService.js").postCollection;

  let clientId: number;
  let inv1: number; // older — total 100
  let inv2: number; // newer — total 80

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    ({ reverseAccountBalances } = await import("../../src/lib/businessHelpers.js"));
    ({ postCollection } = await import("../../src/lib/financeCollectionService.js"));

    await cleanup();

    const [c] = await rawQuery<{ id: number }>(
      `INSERT INTO clients ("companyId", name) VALUES ($1, $2) RETURNING id`,
      [COMPANY, PFX + "client"],
    );
    clientId = c.id;
    const mkInvoice = async (ref: string, total: number, createdAt: string) => {
      const [r] = await rawQuery<{ id: number }>(
        `INSERT INTO invoices ("companyId","branchId","clientId",ref,total,"paidAmount",status,"createdAt")
         VALUES ($1,$2,$3,$4,$5,0,'sent',$6) RETURNING id`,
        [COMPANY, BRANCH, clientId, PFX + ref, total, createdAt],
      );
      return r.id;
    };
    // inv1 older than inv2 → FIFO must clear inv1 first regardless of insert/id order.
    inv1 = await mkInvoice("inv1", 100, "2026-01-01T00:00:00Z");
    inv2 = await mkInvoice("inv2", 80, "2026-02-01T00:00:00Z");
  });

  async function cleanup() {
    if (!rawExecute) return;
    const jes = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND "sourceKey" LIKE $2`,
      [COMPANY, `finance:customer_receipt:${COMPANY}:${PFX}%`],
    );
    for (const je of jes) {
      try { await reverseAccountBalances(COMPANY, je.id); } catch { /* already reversed */ }
      await rawExecute(`DELETE FROM journal_lines WHERE "journalId"=$1`, [je.id]);
      await rawExecute(`DELETE FROM journal_entries WHERE id=$1`, [je.id]);
    }
    await rawExecute(`DELETE FROM customer_advances WHERE "companyId"=$1 AND ref LIKE $2`, [COMPANY, PFX + "%"]);
    await rawExecute(
      `DELETE FROM event_logs WHERE "companyId"=$1 AND entity='invoices' AND "entityId"::text IN
         (SELECT id::text FROM invoices WHERE "companyId"=$1 AND ref LIKE $2)`,
      [COMPANY, PFX + "%"],
    );
    await rawExecute(`DELETE FROM invoices WHERE "companyId"=$1 AND ref LIKE $2`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM clients WHERE "companyId"=$1 AND name LIKE $2`, [COMPANY, PFX + "%"]);
  }
  afterAll(cleanup);

  it("FIFO (no applications): 150 clears the oldest (100) then partially the next (50), balanced JE", async () => {
    const res = await postCollection({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY,
      clientId, amount: 150, method: "bank_transfer", receiptKey: PFX + "fifo",
    });
    expect(res.alreadyExists).toBe(false);

    // ── server-side FIFO allocation is the new م٣ guarantee (oldest first).
    expect(res.allocation.applications).toEqual([
      { invoiceId: inv1, amount: 100 },
      { invoiceId: inv2, amount: 50 },
    ]);
    expect(res.leftover).toBe(0);

    // ── balanced JE, DR cash = 150.
    const [sums] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`,
      [res.journalId],
    );
    expect(Number(sums.d)).toBe(150);
    expect(Number(sums.c)).toBe(150);

    // ── invoice application: inv1 fully paid, inv2 partial.
    const [i1] = await rawQuery<{ paidAmount: string; status: string }>(
      `SELECT "paidAmount"::text, status FROM invoices WHERE id=$1`, [inv1]);
    expect(Number(i1.paidAmount)).toBe(100);
    expect(i1.status).toBe("paid");
    const [i2] = await rawQuery<{ paidAmount: string; status: string }>(
      `SELECT "paidAmount"::text, status FROM invoices WHERE id=$1`, [inv2]);
    expect(Number(i2.paidAmount)).toBe(50);
    expect(i2.status).toBe("partial");

    // ── §٧.٥ إثبات إلغاء مهام التحصيل: الإنذار/التقادم مدفوعٌ بحالة الفاتورة
    //    (status NOT paid AND المتبقي>0). تحصيل «قبض» يحدّث الحالة، فالفاتورة
    //    المدفوعة بالكامل تسقط تلقائيًا من مجموعة الإنذار بلا مهمة إلغاء منفصلة،
    //    بينما الجزئية تبقى للمتبقّي. (نفس فلتر aging في finance-invoices.ts.)
    const dunnable = await rawQuery<{ id: number }>(
      `SELECT id FROM invoices
        WHERE "companyId"=$1 AND "clientId"=$2 AND "deletedAt" IS NULL
          AND status NOT IN ('draft','cancelled','paid','rejected','returned')
          AND (total - COALESCE("paidAmount",0)) > 0.01`,
      [COMPANY, clientId],
    );
    const dunnableIds = dunnable.map((r) => r.id);
    expect(dunnableIds).not.toContain(inv1); // مدفوعة بالكامل → خارج الإنذار
    expect(dunnableIds).toContain(inv2);     // جزئية → تبقى للمتبقّي
  });

  it("excess → advance: collecting 50 now clears inv2 (30 outstanding) + records a 20 leftover advance", async () => {
    const res = await postCollection({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY,
      clientId, amount: 50, method: "cash", receiptKey: PFX + "excess",
    });
    expect(res.alreadyExists).toBe(false);
    expect(res.allocation.applications).toEqual([{ invoiceId: inv2, amount: 30 }]);
    expect(res.leftover).toBe(20);
    expect(res.advanceId).toBeTruthy();

    const [i2] = await rawQuery<{ paidAmount: string; status: string }>(
      `SELECT "paidAmount"::text, status FROM invoices WHERE id=$1`, [inv2]);
    expect(Number(i2.paidAmount)).toBe(80);
    expect(i2.status).toBe("paid");

    const [adv] = await rawQuery<{ amount: string; status: string; journalId: number }>(
      `SELECT amount::text, status, "journalId" FROM customer_advances WHERE id=$1`, [res.advanceId]);
    expect(Number(adv.amount)).toBe(20);
    expect(adv.journalId).toBe(res.journalId);
  });

  it("is idempotent on receiptKey — replaying the first collection returns the same JE", async () => {
    const replay = await postCollection({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY,
      clientId, amount: 150, method: "bank_transfer", receiptKey: PFX + "fifo",
    });
    expect(replay.alreadyExists).toBe(true);
    const [{ n }] = await rawQuery<{ n: number }>(
      `SELECT count(*)::int n FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL`,
      [COMPANY, `finance:customer_receipt:${COMPANY}:${PFX}fifo`]);
    expect(n).toBe(1);
  });
});
