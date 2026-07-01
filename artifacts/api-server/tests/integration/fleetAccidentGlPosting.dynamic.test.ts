// Accident assessment → GL by costBearer — ledger assertion (الدفعة C2).
//
// Constitution rule 3 (absolute): an accident posting that touches the ledger
// ships WITH assertion tests on the journal LINES. This exercises
// fleetEngine.postAccidentGL against a real Postgres and asserts, per
// costBearer, that the entry is BALANCED and routes to the right side:
//   • company  → DEBIT vehicle/expense account, CREDIT cash.
//   • insurance → DEBIT receivable, CREDIT cash (company funds the repair and
//     recovers from the third party — no expense on the company). Only the
//     DEBIT flips (fix 2026-07-01, Ibrahim-approved).
//
// Activation: gated on the disposable test DB (port 54329 / *_test marker),
// same as the other *.dynamic suites. Skips (not fails) without it.
//
//   pnpm db:provision-agent
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
//   pnpm --filter @workspace/api-server test tests/integration/fleetAccidentGlPosting.dynamic.test.ts

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("Fleet accident assessment posts a balanced GL routed by costBearer", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let fleetEngine: typeof import("../../src/lib/engines/fleetEngine.js").fleetEngine;

  let companyId: number;
  let branchId: number;
  const vehicleId = 990001; // tag only — postAccidentGL needs no real row.

  async function linesFor(accidentId: number) {
    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "sourceKey"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [`fleet:accident:${accidentId}`, companyId]);
    expect(je, "journal entry not posted").toBeTruthy();
    return rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit, credit FROM journal_lines WHERE "journalId"=$1`, [je.id]);
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    fleetEngine = (await import("../../src/lib/engines/fleetEngine.js")).fleetEngine;
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");

    const [{ id: cid }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [`Accident GL Co ${Date.now()}`]);
    companyId = cid;
    await bootstrapCompany(companyId, "Accident GL Co");
    const [{ id: bid }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    branchId = bid;
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'فترة الاختبار', '2020-01-01', '2035-12-31', 'open')`, [companyId]);
  });

  it("company-borne accident: balanced, DEBIT expense / CREDIT cash", async () => {
    const accidentId = 700001;
    await fleetEngine.postAccidentGL(
      { companyId, branchId, createdBy: 0 },
      { id: accidentId, vehicleId, cost: 1000, costBearer: "company" });

    const lines = await linesFor(accidentId);
    const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(1000, 2);
    expect(credit).toBeCloseTo(1000, 2);
    const debitLeg = lines.find((l) => Number(l.debit) > 0)!;
    const creditLeg = lines.find((l) => Number(l.credit) > 0)!;
    expect(debitLeg.accountCode).not.toBe(creditLeg.accountCode);
  });

  it("insurance-borne accident: balanced, DEBIT receivable / CREDIT cash (no expense on the company)", async () => {
    const companyAccidentId = 700002;
    await fleetEngine.postAccidentGL(
      { companyId, branchId, createdBy: 0 },
      { id: companyAccidentId, vehicleId, cost: 800, costBearer: "company" });
    const companyLines = await linesFor(companyAccidentId);
    const companyDebit = companyLines.find((l) => Number(l.debit) > 0)!.accountCode;   // expense
    const companyCredit = companyLines.find((l) => Number(l.credit) > 0)!.accountCode; // cash

    const insAccidentId = 700003;
    await fleetEngine.postAccidentGL(
      { companyId, branchId, createdBy: 0 },
      { id: insAccidentId, vehicleId, cost: 500, costBearer: "insurance" });
    const insLines = await linesFor(insAccidentId);

    const debit = insLines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = insLines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(500, 2);
    expect(credit).toBeCloseTo(500, 2);

    const insDebitLeg = insLines.find((l) => Number(l.debit) > 0)!;
    const insCreditLeg = insLines.find((l) => Number(l.credit) > 0)!;
    // Fix (2026-07-01): only the DEBIT flips — the expense that was DEBITED for
    // the company case becomes a receivable (recovered from insurance), while
    // the CREDIT stays cash (the company funds the repair). The expense account
    // is never CREDITED, so it can't go negative and overstate profit.
    expect(insCreditLeg.accountCode).toBe(companyCredit);    // credit = cash (not the expense)
    expect(insCreditLeg.accountCode).not.toBe(companyDebit); // not the expense account
    expect(insDebitLeg.accountCode).not.toBe(companyDebit);  // debit is a receivable, not expense
    expect(insDebitLeg.accountCode).not.toBe(companyCredit); // and not cash
  });

  it("re-assessment REVERSES the prior entry and re-posts the corrected one (no ledger freeze)", async () => {
    const accidentId = 700004;
    // التقييم الأول: شركة، 1000.
    const first = await fleetEngine.postAccidentGL(
      { companyId, branchId, createdBy: 0 },
      { id: accidentId, vehicleId, cost: 1000, costBearer: "company" });
    expect((first as any).reversedJournalId).toBeFalsy();
    const firstJournalId = (first as any).journalId;

    // إعادة التقييم: تأمين، 500.
    const second = await fleetEngine.postAccidentGL(
      { companyId, branchId, createdBy: 0 },
      { id: accidentId, vehicleId, cost: 500, costBearer: "insurance" });
    expect((second as any).reversedJournalId).toBe(firstJournalId);

    // القيد الأول صار معكوسًا (deletedAt مضبوط).
    const [oldJe] = await rawQuery<{ deletedAt: string | null }>(
      `SELECT "deletedAt" FROM journal_entries WHERE id=$1`, [firstJournalId]);
    expect(oldJe.deletedAt).toBeTruthy();

    // القيد النشط الوحيد بنفس sourceKey هو المصحّح (500، مسار التأمين).
    const active = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL`,
      [companyId, `fleet:accident:${accidentId}`]);
    expect(active.length).toBe(1);
    const lines = await linesFor(accidentId);
    const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(500, 2);
    expect(credit).toBeCloseTo(500, 2);
  });
});
