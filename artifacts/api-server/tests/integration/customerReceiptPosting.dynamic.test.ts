// #1945 FIN-03 — integration proof for the customer receipt service on the
// live head-of-main DB. The receipt must route its GL accounts through the
// accounting engine (resolveAccountCode), never the old FE hardcodes
// (1200 / 1220 / 2110 — non-postable header / furniture / vendors header on
// the seeded SOCPA tree). Asserts the ACTUAL journal_lines (account / debit /
// credit), the invoice paidAmount/status advancement, the leftover advance
// row, end-to-end idempotency on receiptKey, and over-application rejection.
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

// Al-Diyaa (seeded contracting company) — SOCPA chart where the legacy
// hardcodes are non-postable, so engine routing is observable.
const COMPANY = 2;
const BRANCH = 2;
const BY = 2;
const PFX = "test-fin03-";

d("FIN-03 — customer receipt routes accounts via the engine (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;
  let postCustomerReceipt: typeof import("../../src/lib/customerReceiptService.js").postCustomerReceipt;
  let resolveAccountCode: (op: string, side: "debit" | "credit", fb: string) => Promise<string>;

  let clientId: number;
  let inv1: number; // total 100, fully applied
  let inv2: number; // total 80, partially applied (50)
  let cashCode: string;
  let arCode: string;
  let advCode: string;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const h = await import("../../src/lib/businessHelpers.js");
    reverseAccountBalances = h.reverseAccountBalances;
    ({ postCustomerReceipt } = await import("../../src/lib/customerReceiptService.js"));
    const { financialEngine } = await import("../../src/lib/engines/index.js");
    resolveAccountCode = (op, side, fb) => financialEngine.resolveAccountCode(COMPANY, op, side, fb);

    await cleanup();

    const [c] = await rawQuery<{ id: number }>(
      `INSERT INTO clients ("companyId", name) VALUES ($1, $2) RETURNING id`,
      [COMPANY, PFX + "client"],
    );
    clientId = c.id;
    const mkInvoice = async (ref: string, total: number) => {
      const [r] = await rawQuery<{ id: number }>(
        `INSERT INTO invoices ("companyId","branchId","clientId",ref,total,"paidAmount",status)
         VALUES ($1,$2,$3,$4,$5,0,'sent') RETURNING id`,
        [COMPANY, BRANCH, clientId, PFX + ref, total],
      );
      return r.id;
    };
    inv1 = await mkInvoice("inv1", 100);
    inv2 = await mkInvoice("inv2", 80);

    // What the engine resolves is the test's expectation — the contract is
    // "routed via the engine", not a specific code. But it MUST be postable.
    [cashCode, arCode, advCode] = await Promise.all([
      resolveAccountCode("invoice_payment_cash", "debit", "1110"),
      resolveAccountCode("invoice_payment_ar", "credit", "1200"),
      resolveAccountCode("customer_advance_liability", "credit", "2400"),
    ]);
  });

  async function cleanup() {
    if (!rawExecute) return;
    // rewind balances of any test journals, then delete bottom-up
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

  it("engine resolves postable accounts that are NOT the legacy hardcodes", async () => {
    for (const code of [cashCode, arCode, advCode]) {
      const [acc] = await rawQuery<{ allowPosting: boolean }>(
        `SELECT "allowPosting" FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2 AND "deletedAt" IS NULL`,
        [COMPANY, code],
      );
      expect(acc, `account ${code} must exist`).toBeTruthy();
      expect(acc.allowPosting, `account ${code} must be postable`).toBe(true);
    }
    // the precise FIN-03 regression: the legacy FE hardcodes must not appear
    expect(arCode).not.toBe("1220");
    expect(arCode).not.toBe("1200");
    expect(advCode).not.toBe("2110");
  });

  it("posts ONE balanced JE with exact engine-resolved lines + applies invoices + records the leftover advance", async () => {
    const res = await postCustomerReceipt({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY,
      clientId, amount: 180, method: "bank_transfer",
      receiptKey: PFX + "main",
      applications: [
        { invoiceId: inv1, amount: 100 },
        { invoiceId: inv2, amount: 50 },
      ],
      advanceRef: PFX + "adv-main",
    });
    expect(res.alreadyExists).toBe(false);
    expect(res.leftover).toBe(30);
    expect(res.advanceId).toBeTruthy();

    // ── the actual journal lines (مدين/دائن/الحسابات)
    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string; sourceLineId: number | null }>(
      `SELECT "accountCode", debit::text, credit::text, "sourceLineId"
         FROM journal_lines WHERE "journalId"=$1 ORDER BY debit DESC, credit ASC, "sourceLineId" ASC NULLS LAST`,
      [res.journalId],
    );
    expect(lines.length).toBe(4);
    // DR cash 180
    expect(lines[0].accountCode).toBe(cashCode);
    expect(Number(lines[0].debit)).toBe(180);
    // CR AR 100 back-linked to inv1, CR AR 50 back-linked to inv2
    const arLines = lines.filter((l) => l.accountCode === arCode);
    expect(arLines.map((l) => [Number(l.credit), l.sourceLineId])).toEqual([[100, inv1], [50, inv2]]);
    // CR advance 30
    const advLine = lines.find((l) => l.accountCode === advCode);
    expect(advLine).toBeTruthy();
    expect(Number(advLine!.credit)).toBe(30);
    // balanced
    const [sums] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [res.journalId]);
    expect(Number(sums.d)).toBe(180);
    expect(Number(sums.c)).toBe(180);

    // ── invoice application
    const [i1] = await rawQuery<{ paidAmount: string; status: string; paidAt: string | null }>(
      `SELECT "paidAmount"::text, status, "paidAt" FROM invoices WHERE id=$1`, [inv1]);
    expect(Number(i1.paidAmount)).toBe(100);
    expect(i1.status).toBe("paid");
    expect(i1.paidAt).toBeTruthy();
    const [i2] = await rawQuery<{ paidAmount: string; status: string }>(
      `SELECT "paidAmount"::text, status FROM invoices WHERE id=$1`, [inv2]);
    expect(Number(i2.paidAmount)).toBe(50);
    expect(i2.status).toBe("partial");

    // ── leftover advance row linked to the receipt JE
    const [adv] = await rawQuery<{ amount: string; status: string; journalId: number }>(
      `SELECT amount::text, status, "journalId" FROM customer_advances WHERE id=$1`, [res.advanceId]);
    expect(Number(adv.amount)).toBe(30);
    expect(adv.status).toBe("open");
    expect(adv.journalId).toBe(res.journalId);
  });

  it("is idempotent end-to-end on receiptKey — replay returns the same JE and does NOT re-apply invoices", async () => {
    const replay = await postCustomerReceipt({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY,
      clientId, amount: 180, method: "bank_transfer",
      receiptKey: PFX + "main",
      applications: [{ invoiceId: inv2, amount: 30 }],
      advanceRef: PFX + "adv-replay",
    });
    expect(replay.alreadyExists).toBe(true);

    const [i2] = await rawQuery<{ paidAmount: string }>(`SELECT "paidAmount"::text FROM invoices WHERE id=$1`, [inv2]);
    expect(Number(i2.paidAmount)).toBe(50); // unchanged
    const [{ n }] = await rawQuery<{ n: number }>(
      `SELECT count(*)::int n FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL`,
      [COMPANY, `finance:customer_receipt:${COMPANY}:${PFX}main`]);
    expect(n).toBe(1);
    const [{ a }] = await rawQuery<{ a: number }>(
      `SELECT count(*)::int a FROM customer_advances WHERE "companyId"=$1 AND ref=$2`,
      [COMPANY, PFX + "adv-replay"]);
    expect(a).toBe(0); // no second advance row
  });

  it("rejects over-application beyond the invoice's outstanding and leaves nothing behind", async () => {
    await expect(postCustomerReceipt({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY,
      clientId, amount: 500, method: "cash",
      receiptKey: PFX + "over",
      applications: [{ invoiceId: inv2, amount: 500 }], // outstanding is 30
    })).rejects.toThrow(/يتجاوز المتبقي/);

    const [i2] = await rawQuery<{ paidAmount: string }>(`SELECT "paidAmount"::text FROM invoices WHERE id=$1`, [inv2]);
    expect(Number(i2.paidAmount)).toBe(50); // rolled back
    const [{ n }] = await rawQuery<{ n: number }>(
      `SELECT count(*)::int n FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL`,
      [COMPANY, `finance:customer_receipt:${COMPANY}:${PFX}over`]);
    expect(n).toBe(0);
  });

  it("rejects applying to another client's invoice", async () => {
    const [other] = await rawQuery<{ id: number }>(
      `INSERT INTO clients ("companyId", name) VALUES ($1, $2) RETURNING id`,
      [COMPANY, PFX + "other-client"],
    );
    await expect(postCustomerReceipt({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY,
      clientId: other.id, amount: 10, method: "cash",
      receiptKey: PFX + "wrongclient",
      applications: [{ invoiceId: inv1, amount: 10 }],
    })).rejects.toThrow(/لا تخص هذا العميل/);
  });
});
