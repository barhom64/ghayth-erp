// م١-ب — integration assertion on the ACTUAL journal_lines a unified financial
// document posts (constitution rule 3: لا تغيير قيد بلا اختبار assertion على سطور
// القيد). Reuses the seeded test fixture (company/branch/user = 2) like the other
// finance .dynamic tests. Activates only when DATABASE_URL points at the test
// cluster; skips otherwise. Reference: docs/finance-audit/25 §٢/§٦ ; issue #2994.
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
const CASH = "1121"; // postable bank on the seeded chart (as in bankAdjustmentPosting)
const EXP_A = "5110"; // COGS — postable expense leaf
const EXP_B = "5120"; // cost of services — postable expense leaf
const REF = "TEST-M1B-DOC";
const SOURCE_KEY = "test:fin-m1b:doc-1";

d("م١-ب — postFinancialDocument posts a balanced JE + persists the 3 tables (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let postFinancialDocument: typeof import("../../src/lib/financeDocumentService.js").postFinancialDocument;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    ({ postFinancialDocument } = await import("../../src/lib/financeDocumentService.js"));
    await cleanup();
  });

  afterAll(async () => { await cleanup(); });

  async function cleanup() {
    if (!rawExecute) return;
    const jes = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries
        WHERE "companyId"=$1 AND "sourceType"='voucher' AND ref LIKE $2`,
      [COMPANY, REF + "%"],
    );
    const ids = jes.map((j) => j.id);
    if (ids.length > 0) {
      // financial_document_lines has no FK from journal_entries (polymorphic
      // documentId) — delete it explicitly; allocations + line-level
      // attachments cascade via their composite FKs to the line.
      await rawExecute(
        `DELETE FROM financial_attachments WHERE "companyId"=$1 AND "documentKind"='voucher' AND "documentId" = ANY($2::int[])`,
        [COMPANY, ids],
      );
      await rawExecute(
        `DELETE FROM financial_document_lines WHERE "companyId"=$1 AND "documentKind"='voucher' AND "documentId" = ANY($2::int[])`,
        [COMPANY, ids],
      );
      await rawExecute(`DELETE FROM journal_lines WHERE "journalId" = ANY($1::int[])`, [ids]);
      await rawExecute(`DELETE FROM journal_entries WHERE id = ANY($1::int[])`, [ids]);
    }
  }

  it("posts a balanced multi-line صرف and stores 2 document lines (documentId = journalId)", async () => {
    const res = await postFinancialDocument({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY,
      documentKind: "voucher", direction: "payment",
      cashAccountCode: CASH, ref: REF + "-1", description: "صرف متعدد البنود (اختبار)",
      sourceKey: SOURCE_KEY,
      rawLines: [
        { lineNo: 1, itemName: "بند أ", quantity: 10, unitPrice: 100, counterAccountCode: EXP_A }, // 1000
        { lineNo: 2, itemName: "بند ب", quantity: 4, unitPrice: 250, counterAccountCode: EXP_B },   // 1000
      ],
    });
    expect(res.alreadyExists).toBe(false);
    expect(res.documentLineIds).toHaveLength(2);

    // ASSERTION on journal_lines: balanced, cash credited the full 2000.
    const legs = await rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit, credit FROM journal_lines WHERE "journalId"=$1`,
      [res.journalId],
    );
    const sum = (k: "debit" | "credit") => legs.reduce((s, l) => s + Number(l[k]), 0);
    expect(sum("debit")).toBeCloseTo(sum("credit"), 2);
    expect(sum("debit")).toBeCloseTo(2000, 2);
    const cash = legs.find((l) => l.accountCode === CASH)!;
    expect(Number(cash.credit)).toBeCloseTo(2000, 2);
    expect(Number(cash.debit)).toBeCloseTo(0, 2);

    // document lines persisted, linked to the journal entry.
    const lines = await rawQuery<{ documentId: number; lineTotal: string; accountCode: string }>(
      `SELECT "documentId", "lineTotal", "accountCode" FROM financial_document_lines
        WHERE "companyId"=$1 AND "documentKind"='voucher' AND "documentId"=$2 ORDER BY "lineNo"`,
      [COMPANY, res.journalId],
    );
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.documentId === res.journalId)).toBe(true);
    expect(Number(lines[0].lineTotal)).toBeCloseTo(1000, 2);
  });

  it("is idempotent — replay with the same sourceKey returns the journal, no duplicate lines", async () => {
    const res = await postFinancialDocument({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY,
      documentKind: "voucher", direction: "payment",
      cashAccountCode: CASH, ref: REF + "-1", description: "صرف متعدد البنود (اختبار)",
      sourceKey: SOURCE_KEY,
      rawLines: [
        { lineNo: 1, itemName: "بند أ", quantity: 10, unitPrice: 100, counterAccountCode: EXP_A },
        { lineNo: 2, itemName: "بند ب", quantity: 4, unitPrice: 250, counterAccountCode: EXP_B },
      ],
    });
    expect(res.alreadyExists).toBe(true);
    const [{ count }] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM financial_document_lines
        WHERE "companyId"=$1 AND "documentKind"='voucher' AND "documentId"=$2`,
      [COMPANY, res.journalId],
    );
    expect(Number(count)).toBe(2); // not 4 — no duplicate insert on replay
  });
});
