// #1945 FIN-18 — bank reconciliation adjustment posting (التسوية البنكية).
//
// Matching a bank-statement row to a PRE-EXISTING journal line is correctly a
// flag-only operation (posting there would double-count — see the FIN-008
// design note in finance-algorithms.ts). The real gap was the OTHER case:
// a statement row with no journal counterpart at all — bank fees, interest
// income, bank charges. Those rows could never be reconciled: no JE exists,
// none was posted, and the row stayed "unmatched" forever while the GL bank
// balance silently drifted from the real bank balance.
//
// This service posts the missing adjustment JE through the accounting engine
// and matches the row to the freshly-posted bank line, atomically:
//   • outflow (bs.type='debit')  → DR مصروفات وعمولات بنكية / CR البنك
//   • inflow  (bs.type='credit') → DR البنك / CR فوائد ومرابحات بنكية
// The counter account is resolved via resolveAccountCode
// (bank_fee_expense / bank_interest_income), never hardcoded. The JE lands
// on the STATEMENT date (postingDate) so the adjustment hits the same
// period the bank moved the money in. Idempotent on the statement row id —
// a replay returns the existing JE and self-heals the match flag if a crash
// left the row unmatched after the JE committed.
import { rawQuery, withTransaction } from "./rawdb.js";
import { toDateISO } from "./businessHelpers.js";
import { ValidationError, NotFoundError, ConflictError } from "./errorHandler.js";

export interface BankAdjustmentParams {
  companyId: number;
  branchId: number;
  createdBy: number;
  bankStatementId: number;
  notes?: string | null;
}

export interface BankAdjustmentResult {
  journalId: number;
  ref: string;
  alreadyExists: boolean;
  matchedJournalLineId: number;
  direction: "fee" | "interest";
  bankAccountCode: string;
  counterAccountCode: string;
  amount: number;
}

export async function postBankAdjustment(p: BankAdjustmentParams): Promise<BankAdjustmentResult> {
  const [bs] = await rawQuery<{
    id: number; branchId: number | null; accountCode: string; statementDate: string | Date;
    reference: string | null; description: string | null; amount: string; type: string; matchStatus: string;
  }>(
    `SELECT id, "branchId", "accountCode", "statementDate", reference, description, amount, type, "matchStatus"
       FROM bank_statements WHERE id = $1 AND "companyId" = $2`,
    [p.bankStatementId, p.companyId],
  );
  if (!bs) throw new NotFoundError("سطر الكشف البنكي غير موجود");

  const amount = Number(bs.amount);
  if (!(amount > 0)) throw new ValidationError("مبلغ سطر الكشف غير صالح", { field: "amount" });
  if (bs.type !== "debit" && bs.type !== "credit") {
    throw new ValidationError(`نوع سطر كشف غير معروف: ${bs.type}`, { field: "type" });
  }
  // bank "credit" = money INTO the account (DR bank in our books);
  // bank "debit"  = money OUT (CR bank) — same convention as auto-match.
  const direction: "fee" | "interest" = bs.type === "debit" ? "fee" : "interest";

  const sourceKey = `finance:bank_adjustment:${p.companyId}:${bs.id}`;
  const ref = `BNK-ADJ-${bs.id}`;
  const stmtDate = toDateISO(new Date(bs.statementDate as any));

  const { financialEngine } = await import("./engines/index.js");
  const counterCode = direction === "fee"
    ? await financialEngine.resolveAccountCode(p.companyId, "bank_fee_expense", "debit", "5390")
    : await financialEngine.resolveAccountCode(p.companyId, "bank_interest_income", "credit", "4910");

  // Idempotency / crash self-heal: if the JE already exists, re-link the
  // statement row to its bank line if a previous run died in between.
  const [existing] = await rawQuery<{ id: number; ref: string }>(
    `SELECT id, ref FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL LIMIT 1`,
    [p.companyId, sourceKey],
  );
  if (existing) {
    const [bankLine] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_lines WHERE "journalId"=$1 AND "accountCode"=$2 LIMIT 1`,
      [existing.id, bs.accountCode],
    );
    if (bankLine && bs.matchStatus !== "matched") {
      await rawQuery(
        `UPDATE bank_statements SET "matchStatus"='matched', "matchedJournalLineId"=$1 WHERE id=$2 AND "companyId"=$3`,
        [bankLine.id, bs.id, p.companyId],
      );
    }
    return {
      journalId: existing.id, ref: existing.ref, alreadyExists: true,
      matchedJournalLineId: bankLine?.id ?? 0, direction,
      bankAccountCode: bs.accountCode, counterAccountCode: counterCode, amount,
    };
  }

  if (bs.matchStatus !== "unmatched") {
    throw new ConflictError("سطر الكشف تمت مطابقته مسبقًا — لا حاجة لقيد تسوية", { field: "bankStatementId" });
  }

  const desc = direction === "fee"
    ? `تسوية بنكية — رسوم/عمولات: ${bs.description ?? bs.reference ?? bs.id}`
    : `تسوية بنكية — فوائد/عوائد: ${bs.description ?? bs.reference ?? bs.id}`;

  const lines = direction === "fee"
    ? [
        { accountCode: counterCode, debit: amount, credit: 0, description: desc },
        { accountCode: bs.accountCode, debit: 0, credit: amount, description: desc },
      ]
    : [
        { accountCode: bs.accountCode, debit: amount, credit: 0, description: desc },
        { accountCode: counterCode, debit: 0, credit: amount, description: desc },
      ];

  let journalId = 0;
  let matchedLineId = 0;
  await withTransaction(async (tx: any) => {
    // Re-check under lock — a concurrent manual match must not race the post.
    const locked = await tx.query(
      `SELECT "matchStatus" FROM bank_statements WHERE id=$1 AND "companyId"=$2 FOR UPDATE`,
      [bs.id, p.companyId],
    );
    if (locked.rows[0]?.matchStatus !== "unmatched") {
      throw new ConflictError("سطر الكشف تمت مطابقته أثناء المعالجة — أعد التحميل", { field: "bankStatementId" });
    }

    const posted = await financialEngine.postJournalEntry({
      companyId: p.companyId,
      branchId: bs.branchId ?? p.branchId,
      createdBy: p.createdBy,
      ref,
      description: p.notes || desc,
      type: "bank_adjustment",
      sourceType: "bank_statement",
      sourceId: bs.id,
      sourceKey,
      // The adjustment belongs to the period the bank moved the money in.
      postingDate: stmtDate,
      lines,
      headerMeta: { reference: bs.reference ?? null },
    });
    journalId = posted.journalId;

    const lineRes = await tx.query(
      `SELECT id FROM journal_lines WHERE "journalId"=$1 AND "accountCode"=$2 LIMIT 1`,
      [journalId, bs.accountCode],
    );
    matchedLineId = lineRes.rows[0]?.id;
    if (!matchedLineId) throw new Error(`[bankReconciliation] posted JE ${journalId} has no line on ${bs.accountCode}`);

    await tx.query(
      `UPDATE bank_statements SET "matchStatus"='matched', "matchedJournalLineId"=$1 WHERE id=$2 AND "companyId"=$3`,
      [matchedLineId, bs.id, p.companyId],
    );
  });

  return {
    journalId, ref, alreadyExists: false, matchedJournalLineId: matchedLineId,
    direction, bankAccountCode: bs.accountCode, counterAccountCode: counterCode, amount,
  };
}
