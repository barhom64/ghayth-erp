// #1945 FIN-18 — integration proof for the bank reconciliation adjustment on
// the live head-of-main DB. A statement row with no journal counterpart
// (bank fee / interest) gets a REAL adjustment JE — accounts resolved via the
// accounting engine — and the row is matched to the freshly-posted bank line
// atomically. Asserts the ACTUAL journal_lines (account / debit / credit),
// the posting date = statement date, idempotency, and the crash self-heal.
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
const BANK = "1121"; // بنك الراجحي — postable bank account on the seeded chart
const BATCH = "test-fin18";

d("FIN-18 — bank adjustment posts a real clearing JE (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;
  let todayISO: typeof import("../../src/lib/businessHelpers.js").todayISO;
  let postBankAdjustment: typeof import("../../src/lib/bankReconciliationService.js").postBankAdjustment;

  let feeCode: string;
  let intCode: string;
  let feeRow: number;     // outflow (type=debit) → fee
  let intRow: number;     // inflow (type=credit) → interest

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const h = await import("../../src/lib/businessHelpers.js");
    reverseAccountBalances = h.reverseAccountBalances;
    todayISO = h.todayISO;
    ({ postBankAdjustment } = await import("../../src/lib/bankReconciliationService.js"));
    const { financialEngine } = await import("../../src/lib/engines/index.js");

    await cleanup();

    const mkRow = async (type: "debit" | "credit", amount: number, descr: string) => {
      const [r] = await rawQuery<{ id: number }>(
        `INSERT INTO bank_statements ("companyId","branchId","accountCode","statementDate",reference,description,amount,type,"matchStatus","importBatchId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unmatched',$9) RETURNING id`,
        [COMPANY, BRANCH, BANK, todayISO(), BATCH + "-" + type, descr, amount, type, BATCH],
      );
      return r.id;
    };
    feeRow = await mkRow("debit", 35, "رسوم إدارة حساب");
    intRow = await mkRow("credit", 12.5, "عوائد مرابحة");

    [feeCode, intCode] = await Promise.all([
      financialEngine.resolveAccountCode(COMPANY, "bank_fee_expense", "debit", "5390"),
      financialEngine.resolveAccountCode(COMPANY, "bank_interest_income", "credit", "4910"),
    ]);
  });

  async function cleanup() {
    if (!rawExecute) return;
    const jes = await rawQuery<{ id: number }>(
      `SELECT je.id FROM journal_entries je
        WHERE je."companyId"=$1 AND je."sourceType"='bank_statement'
          AND je."sourceId" IN (SELECT id FROM bank_statements WHERE "companyId"=$1 AND "importBatchId"=$2)`,
      [COMPANY, BATCH],
    );
    // unlink first (FK matchedJournalLineId → journal_lines)
    await rawExecute(
      `UPDATE bank_statements SET "matchedJournalLineId"=NULL, "matchStatus"='unmatched' WHERE "companyId"=$1 AND "importBatchId"=$2`,
      [COMPANY, BATCH],
    );
    for (const je of jes) {
      try { await reverseAccountBalances(COMPANY, je.id); } catch { /* already reversed */ }
      await rawExecute(`DELETE FROM journal_lines WHERE "journalId"=$1`, [je.id]);
      await rawExecute(`DELETE FROM journal_entries WHERE id=$1`, [je.id]);
    }
    await rawExecute(`DELETE FROM bank_statements WHERE "companyId"=$1 AND "importBatchId"=$2`, [COMPANY, BATCH]);
  }
  afterAll(cleanup);

  it("outflow row posts DR fee-expense / CR bank with engine-resolved account and matches the row", async () => {
    const res = await postBankAdjustment({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY, bankStatementId: feeRow,
    });
    expect(res.alreadyExists).toBe(false);
    expect(res.direction).toBe("fee");
    expect(res.counterAccountCode).toBe(feeCode);

    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit::text, credit::text FROM journal_lines WHERE "journalId"=$1 ORDER BY debit DESC`,
      [res.journalId],
    );
    expect(lines.length).toBe(2);
    expect(lines[0].accountCode).toBe(feeCode);
    expect(Number(lines[0].debit)).toBe(35);
    expect(lines[1].accountCode).toBe(BANK);
    expect(Number(lines[1].credit)).toBe(35);

    // posting date = statement date (same financial period as the bank move)
    const [je] = await rawQuery<{ d: string }>(
      `SELECT "createdAt"::date::text d FROM journal_entries WHERE id=$1`, [res.journalId]);
    expect(je.d).toBe(todayISO());

    // the statement row is matched to the JE's BANK line
    const [bs] = await rawQuery<{ matchStatus: string; matchedJournalLineId: number }>(
      `SELECT "matchStatus", "matchedJournalLineId" FROM bank_statements WHERE id=$1`, [feeRow]);
    expect(bs.matchStatus).toBe("matched");
    expect(bs.matchedJournalLineId).toBe(res.matchedJournalLineId);
    const [bankLine] = await rawQuery<{ accountCode: string }>(
      `SELECT "accountCode" FROM journal_lines WHERE id=$1`, [bs.matchedJournalLineId]);
    expect(bankLine.accountCode).toBe(BANK);
  });

  it("inflow row posts DR bank / CR interest-income", async () => {
    const res = await postBankAdjustment({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY, bankStatementId: intRow,
    });
    expect(res.direction).toBe("interest");
    expect(res.counterAccountCode).toBe(intCode);

    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit::text, credit::text FROM journal_lines WHERE "journalId"=$1 ORDER BY debit DESC`,
      [res.journalId],
    );
    expect(lines.length).toBe(2);
    expect(lines[0].accountCode).toBe(BANK);
    expect(Number(lines[0].debit)).toBe(12.5);
    expect(lines[1].accountCode).toBe(intCode);
    expect(Number(lines[1].credit)).toBe(12.5);
  });

  it("is idempotent — replay returns the same JE, no duplicate", async () => {
    const replay = await postBankAdjustment({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY, bankStatementId: feeRow,
    });
    expect(replay.alreadyExists).toBe(true);
    const [{ n }] = await rawQuery<{ n: number }>(
      `SELECT count(*)::int n FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL`,
      [COMPANY, `finance:bank_adjustment:${COMPANY}:${feeRow}`]);
    expect(n).toBe(1);
  });

  it("self-heals a crash window — JE exists but row left unmatched gets re-linked", async () => {
    await rawExecute(
      `UPDATE bank_statements SET "matchStatus"='unmatched', "matchedJournalLineId"=NULL WHERE id=$1`, [feeRow]);
    const res = await postBankAdjustment({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY, bankStatementId: feeRow,
    });
    expect(res.alreadyExists).toBe(true);
    const [bs] = await rawQuery<{ matchStatus: string; matchedJournalLineId: number | null }>(
      `SELECT "matchStatus", "matchedJournalLineId" FROM bank_statements WHERE id=$1`, [feeRow]);
    expect(bs.matchStatus).toBe("matched");
    expect(bs.matchedJournalLineId).toBeTruthy();
  });

  it("rejects a row already matched to a pre-existing line (no JE) — no double-count", async () => {
    const [r] = await rawQuery<{ id: number }>(
      `INSERT INTO bank_statements ("companyId","branchId","accountCode","statementDate",amount,type,"matchStatus","importBatchId")
       VALUES ($1,$2,$3,$4,9,'debit','matched',$5) RETURNING id`,
      [COMPANY, BRANCH, BANK, todayISO(), BATCH],
    );
    await expect(postBankAdjustment({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY, bankStatementId: r.id,
    })).rejects.toThrow(/تمت مطابقته مسبقًا/);
  });
});
