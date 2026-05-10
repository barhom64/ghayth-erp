#!/usr/bin/env node
/**
 * Smoke test for the Umrah cron jobs + event listeners.
 *
 * Doesn't wait for cron — invokes the handlers directly (same as
 * `runJob()` would) so we can assert the side-effects deterministically.
 */
process.env.DATABASE_URL ??= "postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp";

import { pool, rawQuery, rawExecute } from "../src/lib/rawdb.ts";
import {
  umrahDailyOverstayScan,
  umrahDailyAbsconderScan,
  umrahDailyOverdueAgentInvoices,
  umrahWeeklyAgentPerformance,
  umrahDailyVisaExpiryAlert,
  umrahMonthlyFinancialSummary,
} from "../src/lib/umrahCronJobs.ts";
import { registerUmrahEventListeners } from "../src/lib/umrahEventListeners.ts";
import { emitEvent } from "../src/lib/businessHelpers.ts";

function assert(cond, msg) {
  if (!cond) {
    console.error("✗", msg);
    process.exit(1);
  }
  console.log("  ✓", msg);
}

async function reset() {
  await rawExecute(`DELETE FROM umrah_import_changes WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM umrah_import_batches WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM umrah_violations WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM umrah_nusk_invoices WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM umrah_mutamers WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM umrah_groups WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM umrah_sub_agents WHERE "companyId"=1`);
  await rawExecute(
    `DELETE FROM umrah_agents
      WHERE "companyId"=1 AND "nuskAgentNumber" LIKE 'CRON-%'`
  );
  // Drop fake settings if any.
  await rawExecute(
    `UPDATE system_settings SET value='2000'
      WHERE key='umrah.absconder_penalty' AND "companyId" IS NULL AND "branchId" IS NULL`
  );
}

async function setupFixture() {
  // Seed: 1 agent + 1 sub-agent + 1 group + 3 mutamers
  // - overstayed mutamer (12 stay, 5 program)
  // - absconded mutamer
  // - mutamer about to expire (entryDate today, program 1 day → expires tomorrow)
  const seasonRows = await rawQuery(
    `SELECT id FROM umrah_seasons WHERE "companyId"=1 AND "hijriYear"=1447 LIMIT 1`
  );
  const seasonId = seasonRows[0]?.id;
  const agent = await rawExecute(
    `INSERT INTO umrah_agents
       ("companyId","branchId",name,country,"nuskAgentNumber","seasonId","isActive")
     VALUES (1,1,'وكيل CRON','كمبوديا','CRON-AGENT-1',$1,true) RETURNING id`,
    [seasonId]
  );
  const sub = await rawExecute(
    `INSERT INTO umrah_sub_agents
       ("companyId","branchId",name,"nuskCode","agentId","paymentTerms","isActive")
     VALUES (1,1,'وكالة CRON الفرعية','CRON-SUB-1',$1,'postpaid',true) RETURNING id`,
    [agent.insertId]
  );
  const group = await rawExecute(
    `INSERT INTO umrah_groups
       ("companyId","branchId","nuskGroupNumber",name,"agentId","subAgentId","seasonId",
        "mutamerCount","programDuration",status)
     VALUES (1,1,'CRON-GRP-1','مجموعة CRON',$1,$2,$3,3,5,'active') RETURNING id`,
    [agent.insertId, sub.insertId, seasonId]
  );
  // Mutamer 1: overstayed
  await rawExecute(
    `INSERT INTO umrah_mutamers
       ("companyId","branchId","nuskNumber",name,nationality,gender,
        "passportNumber","groupId","entryDate","actualStayDays","programDuration",
        status,"isInsideKingdom")
     VALUES (1,1,'CRON-M-1','معتمر متجاوز','كمبودي','male','CRON-PP-1',$1,
             NOW() - INTERVAL '12 days',12,5,'inside_kingdom',true)`,
    [group.insertId]
  );
  // Mutamer 2: absconded
  await rawExecute(
    `INSERT INTO umrah_mutamers
       ("companyId","branchId","nuskNumber",name,nationality,gender,
        "passportNumber","groupId","entryDate","actualStayDays","programDuration",
        status,"isInsideKingdom")
     VALUES (1,1,'CRON-M-2','معتمر متغيب','كمبودي','male','CRON-PP-2',$1,
             NOW() - INTERVAL '10 days',10,7,'absconded',true)`,
    [group.insertId]
  );
  // Mutamer 3: visa expiring within 3 days (entry today + 1-day program)
  await rawExecute(
    `INSERT INTO umrah_mutamers
       ("companyId","branchId","nuskNumber",name,nationality,gender,
        "passportNumber","groupId","entryDate","actualStayDays","programDuration",
        status,"isInsideKingdom")
     VALUES (1,1,'CRON-M-3','معتمر تأشيرته على وشك','كمبودي','male','CRON-PP-3',$1,
             NOW() - INTERVAL '1 day',1,2,'inside_kingdom',true)`,
    [group.insertId]
  );
  return { agentId: agent.insertId, subId: sub.insertId, groupId: group.insertId };
}

async function main() {
  await reset();
  await setupFixture();
  registerUmrahEventListeners();

  console.log("\n[1] C27 — overstay scan");
  const r1 = await umrahDailyOverstayScan();
  console.log("  result:", r1);
  const overstayRows = await rawQuery(
    `SELECT COUNT(*)::int AS c FROM umrah_violations WHERE "companyId"=1 AND type='overstay'`
  );
  assert(overstayRows[0].c >= 1, `overstay violation created (got ${overstayRows[0].c})`);

  // Re-run → idempotent (no double rows)
  const r1b = await umrahDailyOverstayScan();
  const overstayRows2 = await rawQuery(
    `SELECT COUNT(*)::int AS c FROM umrah_violations WHERE "companyId"=1 AND type='overstay'`
  );
  assert(overstayRows2[0].c === overstayRows[0].c, "re-run is idempotent — no duplicate overstay rows");

  console.log("\n[2] C28 — absconder scan");
  const r2 = await umrahDailyAbsconderScan();
  console.log("  result:", r2);
  const absconderRows = await rawQuery(
    `SELECT "penaltyAmount" FROM umrah_violations WHERE "companyId"=1 AND type='absconded'`
  );
  assert(absconderRows.length >= 1, `absconder violation created (got ${absconderRows.length})`);
  assert(Number(absconderRows[0].penaltyAmount) === 2000, `absconder penalty = 2000 SAR (got ${absconderRows[0].penaltyAmount})`);

  console.log("\n[3] C29 — overdue agent invoices (no overdue rows → 0 alerts)");
  const r3 = await umrahDailyOverdueAgentInvoices();
  console.log("  result:", r3);
  assert(typeof r3 === "string", "returns descriptive string");

  console.log("\n[4] C30 — weekly agent performance");
  const r4 = await umrahWeeklyAgentPerformance();
  console.log("  result:", r4);
  assert(r4.startsWith("Sent"), "weekly report ran (notification queued or skipped)");

  console.log("\n[5] C31 — visa expiry alert (mutamer M-3 expires soon)");
  const r5 = await umrahDailyVisaExpiryAlert();
  console.log("  result:", r5);
  assert(r5.includes("Alerted on"), "visa expiry scan ran");

  console.log("\n[6] C32 — monthly financial summary");
  const r6 = await umrahMonthlyFinancialSummary();
  console.log("  result:", r6);
  assert(r6.startsWith("Sent"), "monthly summary ran");

  console.log("\n[7] Event listener — emit umrah.commission.calculated");
  // The listener writes to event_logs + audit_logs. Count rows before / after.
  const beforeLogs = await rawQuery(
    `SELECT COUNT(*)::int AS c FROM event_logs WHERE action='umrah.commission.calculated'`
  );
  await emitEvent({
    companyId: 1, branchId: 1, userId: 1,
    action: "umrah.commission.calculated",
    entity: "employee_commission_calculations",
    entityId: 999,
    details: JSON.stringify({ employeeId: 1, hijri: { month: 1, year: 1447 }, finalAmount: 1500, conditionMet: true }),
  });
  // give the async listener a tick
  await new Promise((r) => setTimeout(r, 200));
  const afterLogs = await rawQuery(
    `SELECT COUNT(*)::int AS c FROM event_logs WHERE action='umrah.commission.calculated'`
  );
  assert(afterLogs[0].c > beforeLogs[0].c, "event_logs row inserted by listener");

  // Cleanup
  await reset();

  console.log("\n✅ All cron + listener smoke checks passed.\n");
  await pool.end();
}

main().catch((err) => {
  console.error("\n✗ Smoke failed:", err);
  pool.end().finally(() => process.exit(1));
});
