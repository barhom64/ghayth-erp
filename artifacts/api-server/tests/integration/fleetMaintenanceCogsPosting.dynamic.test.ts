// Fleet/maintenance parts-issue COGS posting — integration regression.
//
// Bug: issuing spare parts on a maintenance order created a REAL stock
// movement (currentStock decremented + a warehouse_movements 'out' row), but
// the cross-domain handler wrote raw SQL that BYPASSED the /warehouse/movements
// path — so it skipped FIFO batch depletion AND COGS GL posting. The part cost
// never reached the GL (DR COGS / CR inventory), so it was missing from the
// maintenance/owner/project P&L. "كل إجراء له أثر" was violated.
//
// Fix: the handler now routes each part through `warehouseEngine.issueStock`,
// which depletes FIFO batches and posts the COGS journal entry. This test
// exercises that engine path against a real Postgres and asserts BOTH effects.
//
// Activation: gated on the disposable test DB (port 54329 / *_test marker),
// same as the other *.dynamic suites. Skips (not fails) without it.
//
//   pnpm db:provision-agent
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
//   pnpm --filter @workspace/api-server test tests/integration/fleetMaintenanceCogsPosting.dynamic.test.ts

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("Fleet/maintenance parts issue posts COGS + depletes FIFO", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let warehouseEngine: typeof import("../../src/lib/engines/warehouseEngine.js").warehouseEngine;

  let companyId: number;
  let branchId: number;
  let productId: number;
  let batchId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    warehouseEngine = (await import("../../src/lib/engines/warehouseEngine.js")).warehouseEngine;
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");

    // Fresh company + full defaults (incl. chart of accounts: 5110 COGS,
    // 1151 inventory) so the COGS journal entry can resolve + post.
    const [{ id: cid }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [`COGS Maint Co ${Date.now()}`]
    );
    companyId = cid;
    await bootstrapCompany(companyId, "COGS Maint Co");
    const [{ id: bid }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`,
      [companyId]
    );
    branchId = bid;

    // An open financial period spanning "now" so GL posting is allowed.
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'فترة الاختبار', '2020-01-01', '2035-12-31', 'open')`,
      [companyId]
    );

    // A stockable product with one FIFO batch of 10 @ 5.00.
    const [{ id: pid }] = await rawQuery<{ id: number }>(
      `INSERT INTO warehouse_products ("companyId","branchId",sku,name,unit,"currentStock","minStock","costPrice","sellPrice",status)
       VALUES ($1,$2,'PART-1','قطعة غيار اختبار','piece',10,0,5,8,'active') RETURNING id`,
      [companyId, branchId]
    );
    productId = pid;
    const [{ id: bbid }] = await rawQuery<{ id: number }>(
      `INSERT INTO warehouse_stock_batches ("productId","batchNumber",quantity,"unitCost","receivedDate")
       VALUES ($1,'BATCH-1',10,5,NOW()) RETURNING id`,
      [productId]
    );
    batchId = bbid;
  });

  it("creates a real 'out' movement, depletes the FIFO batch, and posts a COGS JE", async () => {
    const result = await warehouseEngine.issueStock(
      { companyId, branchId, createdBy: 0 },
      { productId, quantity: 3, unitCost: 5, reference: "MAINT-1", notes: "صيانة مركبة - طلب #1" }
    );

    expect(result.movementId).toBeTruthy();
    expect(result.journalId).toBeTruthy();

    // (1) Real physical movement.
    const [mov] = await rawQuery<{ type: string; quantity: string; reference: string }>(
      `SELECT type, quantity, reference FROM warehouse_movements WHERE id=$1 AND "companyId"=$2`,
      [result.movementId, companyId]
    );
    expect(mov.type).toBe("out");
    expect(Number(mov.quantity)).toBe(3);
    expect(mov.reference).toBe("MAINT-1");

    // (2) FIFO batch depleted 10 → 7.
    const [batch] = await rawQuery<{ quantity: string }>(
      `SELECT quantity FROM warehouse_stock_batches WHERE id=$1`,
      [batchId]
    );
    expect(Number(batch.quantity)).toBe(7);

    // on-hand decremented 10 → 7.
    const [prod] = await rawQuery<{ currentStock: string }>(
      `SELECT "currentStock" FROM warehouse_products WHERE id=$1`,
      [productId]
    );
    expect(Number(prod.currentStock)).toBe(7);

    // (3) COGS JE posted: DR 5110 (COGS) 15 / CR 1151 (inventory) 15.
    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "sourceKey"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [`warehouse:movement:${result.movementId}`, companyId]
    );
    expect(je).toBeTruthy();

    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit, credit FROM journal_lines WHERE "journalId"=$1`,
      [je.id]
    );
    const cogs = lines.find((l) => l.accountCode === "5110");
    const inventory = lines.find((l) => l.accountCode === "1151");
    expect(cogs).toBeTruthy();
    expect(inventory).toBeTruthy();
    expect(Number(cogs!.debit)).toBeCloseTo(15, 2);
    expect(Number(inventory!.credit)).toBeCloseTo(15, 2);

    // The two legs MUST hit distinct accounts (DR COGS ≠ CR inventory).
    // Guards the resolveByIntent cache-by-side regression that collapsed both
    // legs onto 5110, posting a degenerate JE with no inventory relief.
    const debitLeg = lines.find((l) => Number(l.debit) > 0);
    const creditLeg = lines.find((l) => Number(l.credit) > 0);
    expect(debitLeg!.accountCode).not.toBe(creditLeg!.accountCode);
  });
});
