// #1945 item 2 — pin the posting engine (createJournalEntry / applyJournalEntry
// Balances / reverseAccountBalances) against the live head-of-main DB. This is
// the foundation FIN-03 (customer receipt) and FIN-18 (bank reconciliation)
// build on, so its contract is locked here by asserting the ACTUAL journal_lines
// (account / debit / credit), balance, postability, idempotency and reversal —
// not mocks. Activates only when DATABASE_URL points at the test cluster.
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

// Al-Diyaa (seeded contracting company) — has a full posting-enabled chart.
const COMPANY = 2;
const BRANCH = 2;
const BY = 2;
const CASH = "1111";        // الصندوق الرئيسي — postable
const SUBCASH = "1112";     // صناديق فرعية — postable
const HEADER = "1100";      // الأصول المتداولة — grouping, NOT postable
const REF_PREFIX = "test-item2-";

d("posting engine pins (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let withTransaction: typeof import("../../src/lib/rawdb.js").withTransaction;
  let createJournalEntry: typeof import("../../src/lib/businessHelpers.js").createJournalEntry;
  let applyJournalEntryBalances: typeof import("../../src/lib/businessHelpers.js").applyJournalEntryBalances;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    withTransaction = rawdb.withTransaction;
    const h = await import("../../src/lib/businessHelpers.js");
    createJournalEntry = h.createJournalEntry;
    applyJournalEntryBalances = h.applyJournalEntryBalances;
    reverseAccountBalances = h.reverseAccountBalances;
  });

  async function cleanup() {
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref LIKE $2)`,
      [COMPANY, REF_PREFIX + "%"],
    );
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1 AND ref LIKE $2`, [COMPANY, REF_PREFIX + "%"]);
  }
  afterEach(cleanup);
  afterAll(cleanup);

  const baseEntry = (ref: string, lines: any[]) => ({
    companyId: COMPANY, branchId: BRANCH, createdBy: BY,
    ref: REF_PREFIX + ref, description: "posting-engine pin " + ref,
    sourceType: "test", sourceKey: REF_PREFIX + ref, lines,
  });

  it("posts a balanced entry and writes the exact journal_lines (account/debit/credit)", async () => {
    const journalId = await createJournalEntry(baseEntry("balanced", [
      { accountCode: CASH, debit: 100, credit: 0, description: "DR cash" },
      { accountCode: SUBCASH, debit: 0, credit: 100, description: "CR sub-cash" },
    ]));
    expect(typeof journalId).toBe("number");

    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit::text, credit::text FROM journal_lines
         WHERE "journalId"=$1 ORDER BY "accountCode"`, [journalId]);
    expect(lines.map((l) => l.accountCode)).toEqual([CASH, SUBCASH]);
    expect(Number(lines[0].debit)).toBe(100);
    expect(Number(lines[0].credit)).toBe(0);
    expect(Number(lines[1].debit)).toBe(0);
    expect(Number(lines[1].credit)).toBe(100);
    // balanced
    const sums = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [journalId]);
    expect(Number(sums[0].d)).toBe(Number(sums[0].c));
  });

  it("rejects an unbalanced entry (debit != credit)", async () => {
    await expect(createJournalEntry(baseEntry("imbalance", [
      { accountCode: CASH, debit: 100, credit: 0 },
      { accountCode: SUBCASH, debit: 0, credit: 50 },
    ]))).rejects.toThrow(/غير متوازن|balance/i);
  });

  it("rejects posting to a grouping (non-postable) account", async () => {
    await expect(createJournalEntry(baseEntry("header", [
      { accountCode: HEADER, debit: 100, credit: 0 },
      { accountCode: SUBCASH, debit: 0, credit: 100 },
    ]))).rejects.toThrow(/تجميعي|الحركة|posting|postable/i);
  });

  it("is idempotent on sourceKey — a replay returns the same entry, no duplicate", async () => {
    const lines = [
      { accountCode: CASH, debit: 25, credit: 0 },
      { accountCode: SUBCASH, debit: 0, credit: 25 },
    ];
    const id1 = await createJournalEntry(baseEntry("idem", lines));
    const id2 = await createJournalEntry(baseEntry("idem", lines));
    expect(id2).toBe(id1);
    const [{ n }] = await rawQuery<{ n: number }>(
      `SELECT count(*)::int n FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL`,
      [COMPANY, REF_PREFIX + "idem"]);
    expect(n).toBe(1);
  });

  it("reverseAccountBalances rewinds an applied entry and is a no-op once reversed", async () => {
    const journalId = await createJournalEntry(baseEntry("reverse", [
      { accountCode: CASH, debit: 70, credit: 0 },
      { accountCode: SUBCASH, debit: 0, credit: 70 },
    ]));
    // apply balances so the entry actually moved chart_of_accounts.currentBalance
    await withTransaction(async (client) => {
      await applyJournalEntryBalances(client, COMPANY, journalId);
    });
    const before = await rawQuery<{ b: string }>(
      `SELECT "currentBalance"::text b FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2`, [COMPANY, CASH]);
    await reverseAccountBalances(COMPANY, journalId);
    const after = await rawQuery<{ b: string; applied: boolean }>(
      `SELECT c."currentBalance"::text b, j."balancesApplied" applied
         FROM chart_of_accounts c, journal_entries j
        WHERE c."companyId"=$1 AND c.code=$2 AND j.id=$3`, [COMPANY, CASH, journalId]);
    // cash balance rewound by the 70 debit; entry marked not-applied
    expect(Number(after[0].b)).toBe(Number(before[0].b) - 70);
    expect(after[0].applied).toBe(false);
    // double reverse is a no-op
    await reverseAccountBalances(COMPANY, journalId);
    const after2 = await rawQuery<{ b: string }>(
      `SELECT "currentBalance"::text b FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2`, [COMPANY, CASH]);
    expect(Number(after2[0].b)).toBe(Number(after[0].b));
  });
});
