// Warehouse plan-scan + lot-expiry crons — integration proof on a real DB.
//
// Covers the two daily handlers added with the cycle-count plans closure:
//   1. warehouseCycleCountPlanScan — a monthly plan with no count in the
//      current month opens ONE pending cycle count with a lines snapshot;
//      a second scan in the same window opens nothing (window idempotency).
//   2. warehouseLotExpiryAlerts — an active lot expiring inside the
//      warehouse's expiryAlertDays thresholds gets one lot_expiry_alerts row
//      per crossed threshold; re-running fires nothing new (UNIQUE gate).
//
// Gated on the disposable test DB (same markers as the other *.dynamic
// suites); skips without it.
//
//   pnpm db:provision-agent
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
//   pnpm --filter @workspace/api-server exec vitest run tests/integration/warehousePlansExpiry.dynamic.test.ts

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("warehouse crons: cycle-count plan scan + lot expiry alerts", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let planScan: typeof import("../../src/lib/cronScheduler.js").warehouseCycleCountPlanScan;
  let expiryScan: typeof import("../../src/lib/cronScheduler.js").warehouseLotExpiryAlerts;

  let companyId: number;
  let warehouseId: number;
  let productId: number;
  let lotId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const cron = await import("../../src/lib/cronScheduler.js");
    planScan = cron.warehouseCycleCountPlanScan;
    expiryScan = cron.warehouseLotExpiryAlerts;

    const [{ id: cid }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [`WH Cron Co ${Date.now()}`]
    );
    companyId = cid;
    const [{ id: wid }] = await rawQuery<{ id: number }>(
      `INSERT INTO warehouses ("companyId", name, code, status) VALUES ($1,'مستودع كرون','CRON','active') RETURNING id`,
      [companyId]
    );
    warehouseId = wid;
    const [{ id: pid }] = await rawQuery<{ id: number }>(
      `INSERT INTO warehouse_products ("companyId",sku,name,unit,"currentStock","minStock","costPrice","sellPrice",status)
       VALUES ($1,'CRON-1','صنف كرون','piece',10,0,5,8,'active') RETURNING id`,
      [companyId]
    );
    productId = pid;
    // Lot expiring in 20 days — inside the default [30,60,90] thresholds.
    const [{ id: lid }] = await rawQuery<{ id: number }>(
      `INSERT INTO warehouse_stock_lots
         ("companyId","productId","warehouseId","lotNumber",quantity,"originalQuantity","receivedDate","expiryDate",status,"qualityControlStatus")
       VALUES ($1,$2,$3,'CRON-LOT',5,5,CURRENT_DATE,CURRENT_DATE + 20,'active','approved') RETURNING id`,
      [companyId, productId, warehouseId]
    );
    lotId = lid;
    await rawExecute(
      `INSERT INTO warehouse_cycle_count_plans ("companyId","warehouseId",period,"planType")
       VALUES ($1,$2,'monthly','full')`,
      [companyId, warehouseId]
    );
  });

  it("plan scan opens ONE pending count with a snapshot, then stays idle in the same window", async () => {
    await planScan();
    const counts = await rawQuery<{ id: number; status: string }>(
      `SELECT id, status FROM warehouse_cycle_counts WHERE "companyId"=$1 AND "warehouseId"=$2`,
      [companyId, warehouseId]
    );
    expect(counts.length).toBe(1);
    expect(counts[0].status).toBe("pending");
    const [lines] = await rawQuery<{ n: string }>(
      `SELECT COUNT(*) AS n FROM warehouse_cycle_count_lines WHERE "cycleCountId"=$1`,
      [counts[0].id]
    );
    expect(Number(lines.n)).toBeGreaterThanOrEqual(1);

    // Same window → nothing new.
    await planScan();
    const again = await rawQuery<{ id: number }>(
      `SELECT id FROM warehouse_cycle_counts WHERE "companyId"=$1 AND "warehouseId"=$2`,
      [companyId, warehouseId]
    );
    expect(again.length).toBe(1);
  });

  it("expiry scan fires one alert per crossed threshold, idempotently", async () => {
    await expiryScan();
    const alerts = await rawQuery<{ thresholdDays: number }>(
      `SELECT "thresholdDays" FROM lot_expiry_alerts WHERE "lotId"=$1 ORDER BY "thresholdDays"`,
      [lotId]
    );
    // 20 days left crosses all three default thresholds (30, 60, 90).
    expect(alerts.map((a) => Number(a.thresholdDays))).toEqual([30, 60, 90]);

    await expiryScan();
    const [count] = await rawQuery<{ n: string }>(
      `SELECT COUNT(*) AS n FROM lot_expiry_alerts WHERE "lotId"=$1`,
      [lotId]
    );
    expect(Number(count.n)).toBe(3);
  });
});
