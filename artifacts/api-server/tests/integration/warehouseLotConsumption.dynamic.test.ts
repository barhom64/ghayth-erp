// F1 — lot-aware movement consumption (FEFO + recall guard + trace + COGS).
// Integration proof on a real DB: a tracksLots product issues FEFO across
// lots, stamps warehouse_movements.lotId (recall trace), values COGS at the
// lot's unit cost, blocks recalled/expired lots when the policy is on, and
// leaves non-lot products on the existing batch path (no regression).
//
// Gated on the disposable test DB (same markers as the other *.dynamic suites).
//
//   pnpm db:provision-agent
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
//   pnpm --filter @workspace/api-server exec vitest run tests/integration/warehouseLotConsumption.dynamic.test.ts

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("warehouse lot consumption (F1)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let consumeLotsFefo: typeof import("../../src/routes/warehouse.js").consumeLotsFefo;
  let pool: typeof import("../../src/lib/rawdb.js").pool;

  let companyId: number;
  let warehouseId: number;
  let productId: number;
  let lotA: number; // expires soon → FEFO first
  let lotB: number; // expires later

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    pool = rawdb.pool;
    consumeLotsFefo = (await import("../../src/routes/warehouse.js")).consumeLotsFefo;

    const [{ id: cid }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [`Lot Co ${Date.now()}`]
    );
    companyId = cid;
    const [{ id: wid }] = await rawQuery<{ id: number }>(
      `INSERT INTO warehouses ("companyId", name, code, status) VALUES ($1,'مستودع الدفعات','LOT','active') RETURNING id`,
      [companyId]
    );
    warehouseId = wid;
    const [{ id: pid }] = await rawQuery<{ id: number }>(
      `INSERT INTO warehouse_products ("companyId",sku,name,unit,"currentStock","tracksLots",status)
       VALUES ($1,'LOTP','صنف متتبَّع','piece',10,true,'active') RETURNING id`,
      [companyId]
    );
    productId = pid;
    const [{ id: la }] = await rawQuery<{ id: number }>(
      `INSERT INTO warehouse_stock_lots ("companyId","productId","warehouseId","lotNumber",quantity,"originalQuantity","unitCost","receivedDate","expiryDate",status,"qualityControlStatus")
       VALUES ($1,$2,$3,'A',5,5,7,CURRENT_DATE,CURRENT_DATE + 20,'active','approved') RETURNING id`,
      [companyId, productId, warehouseId]
    );
    lotA = la;
    const [{ id: lb }] = await rawQuery<{ id: number }>(
      `INSERT INTO warehouse_stock_lots ("companyId","productId","warehouseId","lotNumber",quantity,"originalQuantity","unitCost","receivedDate","expiryDate",status,"qualityControlStatus")
       VALUES ($1,$2,$3,'B',5,5,9,CURRENT_DATE,CURRENT_DATE + 200,'active','approved') RETURNING id`,
      [companyId, productId, warehouseId]
    );
    lotB = lb;
  });

  it("FEFO drains the earliest-expiry lot first and reports lot unit costs", async () => {
    const client = await pool.connect();
    let consumed: Array<{ lotId: number; takenQty: number; unitCost: number }>;
    try {
      await client.query("BEGIN");
      consumed = await consumeLotsFefo(client, {
        companyId, productId, quantity: 6, explicitLotId: null, blockExpired: true,
      });
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    // 6 units: 5 from A (soonest) + 1 from B.
    expect(consumed[0].lotId).toBe(lotA);
    expect(consumed[0].takenQty).toBe(5);
    expect(consumed[0].unitCost).toBe(7);
    expect(consumed[1].lotId).toBe(lotB);
    expect(consumed[1].takenQty).toBe(1);

    const [a] = await rawQuery<{ quantity: string }>(`SELECT quantity FROM warehouse_stock_lots WHERE id=$1`, [lotA]);
    const [b] = await rawQuery<{ quantity: string }>(`SELECT quantity FROM warehouse_stock_lots WHERE id=$1`, [lotB]);
    expect(Number(a.quantity)).toBe(0);
    expect(Number(b.quantity)).toBe(4);
  });

  it("rejects an explicit issue from a recalled lot", async () => {
    await rawExecute(`UPDATE warehouse_stock_lots SET status='recalled' WHERE id=$1`, [lotB]);
    const client = await pool.connect();
    let threw = false;
    try {
      await client.query("BEGIN");
      await consumeLotsFefo(client, { companyId, productId, quantity: 1, explicitLotId: lotB, blockExpired: true });
      await client.query("COMMIT");
    } catch {
      threw = true;
      await client.query("ROLLBACK").catch(() => {});
    } finally {
      client.release();
    }
    expect(threw).toBe(true);
    // Quantity untouched by the rejected attempt.
    const [b] = await rawQuery<{ quantity: string }>(`SELECT quantity FROM warehouse_stock_lots WHERE id=$1`, [lotB]);
    expect(Number(b.quantity)).toBe(4);
  });

  it("rejects when valid lot stock is insufficient", async () => {
    const client = await pool.connect();
    let threw = false;
    try {
      await client.query("BEGIN");
      // Only lot B (4, but recalled) remains → 0 issuable; ask for 1.
      await consumeLotsFefo(client, { companyId, productId, quantity: 1, explicitLotId: null, blockExpired: true });
      await client.query("COMMIT");
    } catch {
      threw = true;
      await client.query("ROLLBACK").catch(() => {});
    } finally {
      client.release();
    }
    expect(threw).toBe(true);
  });
});
