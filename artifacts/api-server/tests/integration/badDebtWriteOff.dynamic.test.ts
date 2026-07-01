// Constitution Rule 3 — assertion on the ACTUAL journal_lines the bad-debt
// WRITE-OFF posts. Standard allowance-method write-off WITH ZATCA VAT bad-debt
// relief (Art. 40): DR bad_debt_allowance (net) + DR invoice_vat_payable (VAT,
// reversed) / CR invoice_ar (outstanding gross, clientId). The invoice is marked
// `written_off` (drops out of AR aging → the monthly provision releases its share
// next run, no double count). Idempotent per invoice via sourceKey + terminal
// status. Zero-VAT ⇒ 2 lines (no VAT leg). Partial payment ⇒ VAT pro-rated on the
// outstanding. Live test DB only; skips otherwise.
import { describe, it, expect, beforeAll } from "vitest";

const M = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  M.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;
const d = dbReady ? describe : describe.skip;

d("bad-debt write-off — posts the right journal_lines + reverses output VAT (live DB)", () => {
  let rawQuery: any;
  let postBadDebtWriteOff: any;
  let companyId: number;
  let branchId: number;
  let clientId: number;
  let allowanceCode: string;
  let arCode: string;
  let vatCode: string;
  let invId1: number;

  async function linesFor(invoiceId: number): Promise<Array<{ accountCode: string; debit: number; credit: number }>> {
    const [je] = await rawQuery(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [companyId, `WRITEOFF-INV-${invoiceId}`],
    );
    if (!je) return [];
    return rawQuery(
      `SELECT "accountCode", debit::float8 AS debit, credit::float8 AS credit
         FROM journal_lines WHERE "journalId"=$1 ORDER BY debit DESC, credit DESC`,
      [je.id],
    );
  }

  async function invoiceStatus(id: number): Promise<string> {
    const [r] = await rawQuery(`SELECT status FROM invoices WHERE id=$1`, [id]);
    return r?.status;
  }

  async function mkInvoice(ref: string, total: number, vatAmount: number, opts?: { paidAmount?: number; vatRate?: number }): Promise<number> {
    const [r] = await rawQuery(
      `INSERT INTO invoices ("companyId","branchId","clientId",ref,total,"vatAmount","vatRate","paidAmount",status,"createdAt","dueDate")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sent','2026-01-01T00:00:00Z','2026-01-01') RETURNING id`,
      [companyId, branchId, clientId, ref, total, vatAmount, opts?.vatRate ?? 15, opts?.paidAmount ?? 0],
    );
    return r.id;
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    const rawExecute = rawdb.rawExecute;
    ({ postBadDebtWriteOff } = await import("../../src/lib/finance/badDebtWriteOff.js"));
    const { financialEngine } = await import("../../src/lib/engines/index.js");
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");

    const [{ id }] = await rawQuery(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`,
      [`WriteOff Co ${Date.now()}`],
    );
    companyId = id;
    await bootstrapCompany(companyId, "WriteOff Co");
    const [{ id: b }] = await rawQuery(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`,
      [companyId],
    );
    branchId = b;
    await rawExecute(
      `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status)
       VALUES ($1,'فترة الاختبار','2020-01-01','2035-12-31','open')`,
      [companyId],
    );
    const [{ id: cl }] = await rawQuery(
      `INSERT INTO clients ("companyId", name) VALUES ($1,$2) RETURNING id`,
      [companyId, "WriteOff Client"],
    );
    clientId = cl;

    // Resolve the exact posted codes the way the write-off engine does, so the
    // assertions hold regardless of the seeded chart-of-accounts leaf codes.
    [allowanceCode, arCode, vatCode] = await Promise.all([
      financialEngine.resolveAccountCode(companyId, "bad_debt_allowance", "debit", "1135"),
      financialEngine.resolveAccountCode(companyId, "invoice_ar", "credit", "1131"),
      financialEngine.resolveAccountCode(companyId, "invoice_vat_payable", "debit", "2131"),
    ]);
  }, 90_000);

  it("VAT invoice: DR allowance(net) + DR vat(reversed) / CR AR(gross), balanced, status→written_off", async () => {
    invId1 = await mkInvoice("WO-INV-1", 1150, 150); // 1000 net + 150 VAT
    const r = await postBadDebtWriteOff({ companyId, branchId, invoiceId: invId1, createdBy: 0 });
    expect(r.posted).toBe(true);
    expect(r.outstanding).toBe(1150);
    expect(r.net).toBe(1000);
    expect(r.vat).toBe(150);
    expect(await linesFor(invId1)).toEqual([
      { accountCode: allowanceCode, debit: 1000, credit: 0 },
      { accountCode: vatCode, debit: 150, credit: 0 },
      { accountCode: arCode, debit: 0, credit: 1150 },
    ]);
    expect(await invoiceStatus(invId1)).toBe("written_off");
  });

  it("is idempotent — re-run is a no-op, still exactly the one 3-line entry", async () => {
    const r = await postBadDebtWriteOff({ companyId, branchId, invoiceId: invId1, createdBy: 0 });
    expect(r.posted).toBe(false);
    expect(r.reason).toBe("already_written_off");
    expect((await linesFor(invId1)).length).toBe(3);
    expect(await invoiceStatus(invId1)).toBe("written_off");
  });

  it("zero-VAT invoice → 2 lines, NO VAT leg", async () => {
    const id = await mkInvoice("WO-INV-3", 500, 0, { vatRate: 0 });
    const r = await postBadDebtWriteOff({ companyId, branchId, invoiceId: id, createdBy: 0 });
    expect(r.posted).toBe(true);
    expect(r.net).toBe(500);
    expect(r.vat).toBe(0);
    expect(await linesFor(id)).toEqual([
      { accountCode: allowanceCode, debit: 500, credit: 0 },
      { accountCode: arCode, debit: 0, credit: 500 },
    ]);
  });

  it("partial payment → VAT pro-rated on the OUTSTANDING (not the full invoice)", async () => {
    const id = await mkInvoice("WO-INV-4", 1150, 150, { paidAmount: 150 }); // outstanding 1000
    const r = await postBadDebtWriteOff({ companyId, branchId, invoiceId: id, createdBy: 0 });
    expect(r.posted).toBe(true);
    expect(r.outstanding).toBe(1000);
    expect(r.vat).toBe(130.43); // 1000 × 150/1150
    expect(r.net).toBe(869.57);
    expect(await linesFor(id)).toEqual([
      { accountCode: allowanceCode, debit: 869.57, credit: 0 },
      { accountCode: vatCode, debit: 130.43, credit: 0 },
      { accountCode: arCode, debit: 0, credit: 1000 },
    ]);
  });
});
