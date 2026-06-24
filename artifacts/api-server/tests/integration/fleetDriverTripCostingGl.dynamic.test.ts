// Driver-completed trip costing → GL (review follow-up, ledger gap).
//
// Constitution rule 3: a trip-completion GL change ships WITH assertion tests
// on the journal LINES. A trip completed via POST /me/trips/:id/complete never
// reached the costing the manager route does; now fleetEngine.computeAndPostTripGL
// (invoked by the fleet.trip.completed consumer) posts it. This proves the
// engine method produces a BALANCED entry from trip distance + default rates,
// idempotently (a second call is a no-op via sourceKey fleet:trip:<id>).
//
// Activation: disposable test DB (port 54329 / *_test). Skips without it.

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady = !!dbUrl && TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET && (process.env.JWT_SECRET ?? "").length >= 32;
const d = dbReady ? describe : describe.skip;

d("computeAndPostTripGL posts a balanced trip GL for a (driver-)completed trip", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let fleetEngine: typeof import("../../src/lib/engines/fleetEngine.js").fleetEngine;
  let companyId: number; let branchId: number; let vehicleId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery; rawExecute = rawdb.rawExecute;
    fleetEngine = (await import("../../src/lib/engines/fleetEngine.js")).fleetEngine;
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");

    const [{ id: cid }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`, [`Trip GL Co ${Date.now()}`]);
    companyId = cid;
    await bootstrapCompany(companyId, "Trip GL Co");
    const [{ id: bid }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    branchId = bid;
    await rawExecute(
      `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status)
       VALUES ($1,'فترة الاختبار','2020-01-01','2035-12-31','open')`, [companyId]);
    const [{ id: vid }] = await rawQuery<{ id: number }>(
      `INSERT INTO fleet_vehicles ("companyId","branchId","plateNumber",make,model,year,status,"vehicleType","fuelType",
            "validForPassengers","validForCargo","registrationExpiry","insuranceExpiry","nextInspectionDate","createdAt")
       VALUES ($1,$2,$3,'TestVeh','M',2024,'available','sedan','diesel',true,false,'2099-12-31','2099-12-31','2099-12-31',NOW())
       RETURNING id`, [companyId, branchId, `TRIP-${Date.now()}`]);
    vehicleId = vid;
  });

  it("posts DR cost / CR cash, balanced, and is idempotent on re-run", async () => {
    // distance 100km @ defaults: fuel 100/10*2.5=25, fare 100*0.5=50, dep 100*0.15=15 → total 90.
    const [{ id: tripId }] = await rawQuery<{ id: number }>(
      `INSERT INTO fleet_trips ("companyId","vehicleId","fromLocation","toLocation",distance,status,"startTime")
       VALUES ($1,$2,'A','B',100,'in_progress',NOW()) RETURNING id`, [companyId, vehicleId]);

    const res = await fleetEngine.computeAndPostTripGL({ companyId, branchId, createdBy: 0 }, tripId);
    expect(res?.journalId, "no journal posted").toBeTruthy();

    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit, credit FROM journal_lines WHERE "journalId"=$1`, [res!.journalId]);
    const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(90, 2);
    expect(credit).toBeCloseTo(90, 2);
    expect(debit).toBeCloseTo(credit, 2);

    // Idempotent: second call returns the SAME journal (sourceKey guard) — no double post.
    const again = await fleetEngine.computeAndPostTripGL({ companyId, branchId, createdBy: 0 }, tripId);
    expect(again?.journalId).toBe(res!.journalId);
    const [{ n }] = await rawQuery<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL`,
      [companyId, `fleet:trip:${tripId}`]);
    expect(Number(n)).toBe(1);
  });
});
