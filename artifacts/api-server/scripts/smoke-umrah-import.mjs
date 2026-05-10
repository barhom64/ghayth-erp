#!/usr/bin/env node
/**
 * Smoke test for umrahImportEngine — builds a synthetic NUSK workbook with
 * Arabic headers, parses it, previews + confirms the import, then asserts
 * that the resulting umrah_mutamers / umrah_groups / umrah_violations rows
 * make sense. Idempotency is also verified by re-running confirm twice on
 * the second batch (cumulative-file behaviour).
 */
process.env.DATABASE_URL ??= "postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp";

import * as XLSX from "xlsx";
import { pool, rawQuery, rawExecute } from "../src/lib/rawdb.ts";
import {
  parseMutamersWorkbook,
  parseVouchersWorkbook,
  previewMutamersImport,
  previewVouchersImport,
  confirmImport,
} from "../src/lib/umrahImportEngine.ts";

function buildMutamersWorkbook(rows) {
  const headers = [
    "رقم الوكيل","اسم الوكيل","كود الوكيل الفرعي","الوكيل الفرعي","دولة الوكيل",
    "رقم المجموعة","اسم المجموعة","اسم المعتمر","رقم المعتمر في النظام",
    "الجنسية","النوع","رقم الجواز","تاريخ انتهاء الجواز",
    "تاريخ الدخول","منفذ الدخول","رحلة الوصول",
    "تاريخ الخروج","منفذ الخروج","رحلة المغادرة",
    "عدد ايام الاقامة","مدة البرنامج","رقم الحدود","رقم التأشيرة","رقم الموفا",
    "حالة المعتمر","متواجد داخل المملكة",
  ];
  const aoa = [headers, ...rows.map((r) => [
    r.nuskAgentNumber, r.agentName, r.nuskCode, r.subAgentName, r.country,
    r.nuskGroupNumber, r.groupName, r.name, r.nuskNumber,
    r.nationality, r.gender, r.passportNumber, r.passportExpiry,
    r.entryDate, r.entryPort, r.entryFlight,
    r.exitDate, r.exitPort, r.exitFlight,
    r.actualStayDays, r.programDuration, r.borderNumber, r.visaNumber, r.mofaNumber,
    r.status, r.isInsideKingdom,
  ])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "تقرير المعتمرين");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function buildVouchersWorkbook(rows) {
  const headers = [
    "رقم الفاتورة","اسم الوكيل","كود الوكيل الفرعي","الوكيل الفرعي","رقم المجموعة",
    "عدد المعتمرين","حالة الفاتورة",
    "اجمالي الخدمات الارضية","رسوم الخدمات الالكترونية","رسوم التأشيرة","اجمالي خدمات التامين",
    "الخدمات الإثرائية","الخدمات الإضافية","النقل","الفنادق",
    "المبلغ المرتجع لشركة العمرة","المبلغ الاجمالي","تاريخ الإصدار","مدة البرنامج",
  ];
  const aoa = [headers, ...rows.map((r) => [
    r.nuskInvoiceNumber, r.agentName, r.nuskCode, r.subAgentName, r.nuskGroupNumber,
    r.mutamerCount, r.nuskStatus,
    r.groundServices, r.electronicFees, r.visaFees, r.insuranceFees,
    r.enrichmentServices, r.additionalServices, r.transportTotal, r.hotelTotal,
    r.refundAmount, r.totalAmount, r.issueDate, r.programDuration,
  ])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "قائمة الفواتير");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function reset() {
  // Clean previous smoke runs (everything created by this script is on
  // company 1 with the special agentNumber 'SMK-AGENT-1').
  await rawExecute(`DELETE FROM umrah_import_changes WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM umrah_import_batches WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM umrah_violations WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM umrah_nusk_invoices WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM umrah_mutamers WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM umrah_groups WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM umrah_sub_agents WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM umrah_agents WHERE "companyId"=1 AND "nuskAgentNumber"='SMK-AGENT-1'`);
}

function assert(cond, msg) {
  if (!cond) {
    console.error("✗", msg);
    process.exit(1);
  }
  console.log("  ✓", msg);
}

async function main() {
  await reset();

  const seasonRows = await rawQuery(`SELECT id FROM umrah_seasons WHERE "companyId"=1 AND "hijriYear"=1447 LIMIT 1`);
  const seasonId = seasonRows[0]?.id;
  if (!seasonId) {
    console.error("Season 1447 missing — run migration 067 first.");
    process.exit(1);
  }
  const scope = { companyId: 1, branchId: 1, userId: 1, seasonId };

  // -------- Day 1 mutamer file: 5 new pilgrims --------
  console.log("\n[1] Day-1 mutamer file (5 new rows)");
  const day1Rows = [
    { nuskAgentNumber:"SMK-AGENT-1", agentName:"مؤسسة الدور - كمبوديا", nuskCode:"SMK-SUB-1",
      subAgentName:"وكالة سمكي", country:"كمبوديا",
      nuskGroupNumber:"GRP-1", groupName:"مجموعة كمبوديا", name:"عمران سمان", nuskNumber:"NUSK-1001",
      nationality:"كمبودي", gender:"ذكر", passportNumber:"P-001", passportExpiry:"2030-01-01",
      entryDate:"2026-01-10", entryPort:"جدة", entryFlight:"SV101",
      exitDate:null, exitPort:null, exitFlight:null,
      actualStayDays:5, programDuration:14, borderNumber:"B-1", visaNumber:"V-1", mofaNumber:"M-1",
      status:"داخل المملكة", isInsideKingdom:"نعم" },
    { nuskAgentNumber:"SMK-AGENT-1", agentName:"مؤسسة الدور - كمبوديا", nuskCode:"SMK-SUB-1",
      subAgentName:"وكالة سمكي", country:"كمبوديا",
      nuskGroupNumber:"GRP-1", groupName:"مجموعة كمبوديا", name:"خالد علي", nuskNumber:"NUSK-1002",
      nationality:"كمبودي", gender:"ذكر", passportNumber:"P-002", passportExpiry:"2030-01-01",
      entryDate:"2026-01-10", entryPort:"جدة", entryFlight:"SV101",
      exitDate:null, exitPort:null, exitFlight:null,
      actualStayDays:5, programDuration:14, borderNumber:"B-2", visaNumber:"V-2", mofaNumber:"M-2",
      status:"داخل المملكة", isInsideKingdom:"نعم" },
    { nuskAgentNumber:"SMK-AGENT-1", agentName:"مؤسسة الدور - كمبوديا", nuskCode:"SMK-SUB-1",
      subAgentName:"وكالة سمكي", country:"كمبوديا",
      nuskGroupNumber:"GRP-1", groupName:"مجموعة كمبوديا", name:"سارة محمد", nuskNumber:"NUSK-1003",
      nationality:"كمبودية", gender:"أنثى", passportNumber:"P-003", passportExpiry:"2030-01-01",
      entryDate:"2026-01-10", entryPort:"جدة", entryFlight:"SV101",
      exitDate:null, exitPort:null, exitFlight:null,
      actualStayDays:5, programDuration:14, borderNumber:"B-3", visaNumber:"V-3", mofaNumber:"M-3",
      status:"داخل المملكة", isInsideKingdom:"نعم" },
    { nuskAgentNumber:"SMK-AGENT-1", agentName:"مؤسسة الدور - كمبوديا", nuskCode:"SMK-SUB-2",
      subAgentName:"وكالة راضي ترافل", country:"كمبوديا",
      nuskGroupNumber:"GRP-2", groupName:"مجموعة راضي 1", name:"يوسف ابراهيم", nuskNumber:"NUSK-2001",
      nationality:"كمبودي", gender:"ذكر", passportNumber:"P-101", passportExpiry:"2029-06-01",
      entryDate:"2026-01-12", entryPort:"الرياض", entryFlight:"SV202",
      exitDate:null, exitPort:null, exitFlight:null,
      actualStayDays:3, programDuration:10, borderNumber:"B-101", visaNumber:"V-101", mofaNumber:"M-101",
      status:"داخل المملكة", isInsideKingdom:"نعم" },
    { nuskAgentNumber:"SMK-AGENT-1", agentName:"مؤسسة الدور - كمبوديا", nuskCode:"SMK-SUB-2",
      subAgentName:"وكالة راضي ترافل", country:"كمبوديا",
      nuskGroupNumber:"GRP-2", groupName:"مجموعة راضي 1", name:"احمد ياسر", nuskNumber:"NUSK-2002",
      nationality:"كمبودي", gender:"ذكر", passportNumber:"P-102", passportExpiry:"2029-06-01",
      entryDate:"2026-01-12", entryPort:"الرياض", entryFlight:"SV202",
      exitDate:null, exitPort:null, exitFlight:null,
      actualStayDays:3, programDuration:10, borderNumber:"B-102", visaNumber:"V-102", mofaNumber:"M-102",
      status:"داخل المملكة", isInsideKingdom:"نعم" },
  ];
  const buf1 = buildMutamersWorkbook(day1Rows);
  const parsed1 = parseMutamersWorkbook(buf1);
  assert(parsed1.length === 5, `parse: 5 rows (got ${parsed1.length})`);
  assert(parsed1[0].status === "inside_kingdom", "status mapping داخل المملكة → inside_kingdom");
  assert(parsed1[0].gender === "male", "gender mapping ذكر → male");
  assert(parsed1[2].gender === "female", "gender mapping أنثى → female");
  assert(parsed1[0].isInsideKingdom === true, "boolean mapping نعم → true");

  const preview1 = await previewMutamersImport(scope, { fileName:"day1.xlsx", fileSize: buf1.length }, buf1);
  assert(preview1.newCount === 5 && preview1.updatedCount === 0 && preview1.skippedCount === 0,
    `preview1: 5 new, 0 updated, 0 skipped (got ${preview1.newCount}/${preview1.updatedCount}/${preview1.skippedCount})`);
  assert(preview1.newAgents === 1, `preview1: 1 new agent (got ${preview1.newAgents})`);
  assert(preview1.newSubAgents === 2, `preview1: 2 new sub-agents (got ${preview1.newSubAgents})`);
  assert(preview1.newGroups === 2, `preview1: 2 new groups (got ${preview1.newGroups})`);
  assert(preview1.batchId > 0, "preview1: batchId saved");

  const conf1 = await confirmImport(scope, preview1.batchId);
  assert(conf1.applied.inserted === 5, `confirm1: 5 inserted (got ${conf1.applied.inserted})`);
  assert(conf1.applied.agentsCreated === 1, `confirm1: 1 agent created (got ${conf1.applied.agentsCreated})`);
  assert(conf1.applied.subAgentsCreated === 2, `confirm1: 2 sub-agents created (got ${conf1.applied.subAgentsCreated})`);
  assert(conf1.applied.groupsCreated === 2, `confirm1: 2 groups created (got ${conf1.applied.groupsCreated})`);
  assert(conf1.applied.violationsCreated === 0, `confirm1: 0 violations (got ${conf1.applied.violationsCreated})`);

  // -------- Day 2 mutamer file: same 5 + 2 new + status changes --------
  console.log("\n[2] Day-2 cumulative file (5 unchanged + 2 new + 1 overstay + 1 absconder)");
  const day2Rows = [
    // first 3 unchanged
    ...day1Rows.slice(0, 3),
    // pilgrim 4 now overstayed
    { ...day1Rows[3], actualStayDays:15, status:"متجاوز", isInsideKingdom:"نعم" },
    // pilgrim 5 absconded
    { ...day1Rows[4], status:"تم التبليغ" },
    // 2 brand new pilgrims in same group GRP-2
    { nuskAgentNumber:"SMK-AGENT-1", agentName:"مؤسسة الدور - كمبوديا", nuskCode:"SMK-SUB-2",
      subAgentName:"وكالة راضي ترافل", country:"كمبوديا",
      nuskGroupNumber:"GRP-2", groupName:"مجموعة راضي 1", name:"محمد سليم", nuskNumber:"NUSK-2003",
      nationality:"كمبودي", gender:"ذكر", passportNumber:"P-103", passportExpiry:"2029-06-01",
      entryDate:"2026-01-13", entryPort:"الرياض", entryFlight:"SV203",
      exitDate:null, exitPort:null, exitFlight:null,
      actualStayDays:1, programDuration:10, borderNumber:"B-103", visaNumber:"V-103", mofaNumber:"M-103",
      status:"داخل المملكة", isInsideKingdom:"نعم" },
    { nuskAgentNumber:"SMK-AGENT-1", agentName:"مؤسسة الدور - كمبوديا", nuskCode:"SMK-SUB-2",
      subAgentName:"وكالة راضي ترافل", country:"كمبوديا",
      nuskGroupNumber:"GRP-2", groupName:"مجموعة راضي 1", name:"سعد فاضل", nuskNumber:"NUSK-2004",
      nationality:"كمبودي", gender:"ذكر", passportNumber:"P-104", passportExpiry:"2029-06-01",
      entryDate:"2026-01-13", entryPort:"الرياض", entryFlight:"SV203",
      exitDate:null, exitPort:null, exitFlight:null,
      actualStayDays:1, programDuration:10, borderNumber:"B-104", visaNumber:"V-104", mofaNumber:"M-104",
      status:"داخل المملكة", isInsideKingdom:"نعم" },
  ];
  const buf2 = buildMutamersWorkbook(day2Rows);
  const preview2 = await previewMutamersImport(scope, { fileName:"day2.xlsx", fileSize: buf2.length }, buf2);
  assert(preview2.newCount === 2 && preview2.updatedCount === 2 && preview2.skippedCount === 3,
    `preview2: 2 new, 2 updated, 3 skipped (got ${preview2.newCount}/${preview2.updatedCount}/${preview2.skippedCount})`);
  assert(preview2.newOverstays >= 1, `preview2: ≥1 overstay (got ${preview2.newOverstays})`);
  assert(preview2.newAbsconders >= 1, `preview2: ≥1 absconder (got ${preview2.newAbsconders})`);
  assert(preview2.newAgents === 0 && preview2.newSubAgents === 0 && preview2.newGroups === 0,
    "preview2: no new agents / sub-agents / groups");

  const conf2 = await confirmImport(scope, preview2.batchId);
  assert(conf2.applied.inserted === 2, `confirm2: 2 inserted (got ${conf2.applied.inserted})`);
  assert(conf2.applied.updated === 2, `confirm2: 2 updated (got ${conf2.applied.updated})`);
  assert(conf2.applied.skipped === 3, `confirm2: 3 skipped (got ${conf2.applied.skipped})`);
  assert(conf2.applied.violationsCreated === 2, `confirm2: 2 violations (got ${conf2.applied.violationsCreated})`);

  // -------- Verify violations table --------
  const violations = await rawQuery(
    `SELECT type, "referenceNumber", "penaltyAmount", status FROM umrah_violations
       WHERE "companyId"=1 ORDER BY id`
  );
  assert(violations.length === 2, `violations row count = 2 (got ${violations.length})`);
  const absconder = violations.find((v) => v.type === "absconded");
  assert(absconder && Number(absconder.penaltyAmount) === 2000,
    `absconder penalty = 2000 SAR (got ${absconder?.penaltyAmount})`);
  const overstay = violations.find((v) => v.type === "overstay");
  assert(overstay !== undefined, "overstay violation present");

  // -------- Day 3: re-upload same day-2 file → all rows skipped (idempotent) --------
  console.log("\n[3] Day-3 re-upload same data (cumulative idempotency)");
  const buf3 = buildMutamersWorkbook(day2Rows);
  const preview3 = await previewMutamersImport(scope, { fileName:"day3.xlsx", fileSize: buf3.length }, buf3);
  assert(preview3.newCount === 0 && preview3.updatedCount === 0 && preview3.skippedCount === 7,
    `preview3: 0 new, 0 updated, 7 skipped (got ${preview3.newCount}/${preview3.updatedCount}/${preview3.skippedCount})`);
  const conf3 = await confirmImport(scope, preview3.batchId);
  assert(conf3.applied.violationsCreated === 0, `confirm3: 0 new violations (idempotent — got ${conf3.applied.violationsCreated})`);

  // -------- Voucher file: 2 invoices --------
  console.log("\n[4] Voucher file (2 invoices)");
  const vouchers = [
    { nuskInvoiceNumber:"INV-800001", agentName:"مؤسسة الدور - كمبوديا", nuskCode:"SMK-SUB-1",
      subAgentName:"وكالة سمكي", nuskGroupNumber:"GRP-1",
      mutamerCount:3, nuskStatus:"مدفوعة",
      groundServices:1500, electronicFees:300, visaFees:900, insuranceFees:150,
      enrichmentServices:0, additionalServices:0, transportTotal:0, hotelTotal:0,
      refundAmount:0, totalAmount:2850, issueDate:"2026-01-09", programDuration:14 },
    { nuskInvoiceNumber:"INV-800002", agentName:"مؤسسة الدور - كمبوديا", nuskCode:"SMK-SUB-2",
      subAgentName:"وكالة راضي ترافل", nuskGroupNumber:"GRP-2",
      mutamerCount:4, nuskStatus:"مدفوعة",
      groundServices:2000, electronicFees:400, visaFees:1200, insuranceFees:200,
      enrichmentServices:0, additionalServices:0, transportTotal:0, hotelTotal:0,
      refundAmount:0, totalAmount:3800, issueDate:"2026-01-11", programDuration:10 },
  ];
  const vbuf = buildVouchersWorkbook(vouchers);
  const vprev = await previewVouchersImport(scope, { fileName:"vouchers.xlsx", fileSize: vbuf.length }, vbuf);
  assert(vprev.newCount === 2, `vouchers preview: 2 new (got ${vprev.newCount})`);
  const vconf = await confirmImport(scope, vprev.batchId);
  assert(vconf.applied.inserted === 2, `vouchers confirm: 2 inserted (got ${vconf.applied.inserted})`);
  assert(vconf.applied.purchaseInvoicesCreated === 2,
    `vouchers confirm: 2 purchase invoices flagged (got ${vconf.applied.purchaseInvoicesCreated})`);

  // Check netCost computed = total - refund
  const inv = await rawQuery(`SELECT "netCost", "totalAmount", "refundAmount" FROM umrah_nusk_invoices WHERE "nuskInvoiceNumber"='INV-800001'`);
  assert(Number(inv[0].netCost) === 2850, `netCost = totalAmount - refund (got ${inv[0].netCost})`);

  // Re-import same vouchers → all skipped
  const vprev2 = await previewVouchersImport(scope, { fileName:"vouchers2.xlsx", fileSize: vbuf.length }, vbuf);
  assert(vprev2.skippedCount === 2 && vprev2.newCount === 0,
    `vouchers re-import: 2 skipped, 0 new (got ${vprev2.skippedCount}/${vprev2.newCount})`);

  // -------- Final state checks --------
  console.log("\n[5] Final state checks");
  const mutCount = await rawQuery(`SELECT COUNT(*)::int AS c FROM umrah_mutamers WHERE "companyId"=1 AND "deletedAt" IS NULL`);
  assert(mutCount[0].c === 7, `mutamers total = 7 (got ${mutCount[0].c})`);
  const groups = await rawQuery(`SELECT "nuskGroupNumber", "mutamerCount", status FROM umrah_groups WHERE "companyId"=1 AND "deletedAt" IS NULL ORDER BY "nuskGroupNumber"`);
  console.log("  groups:", groups);
  assert(groups.find((g) => g.nuskGroupNumber === "GRP-1").mutamerCount === 3,
    "GRP-1 mutamerCount = 3");
  assert(groups.find((g) => g.nuskGroupNumber === "GRP-2").mutamerCount === 4,
    "GRP-2 mutamerCount = 4");
  assert(groups.find((g) => g.nuskGroupNumber === "GRP-2").status === "has_violations",
    "GRP-2 status = has_violations");

  // Cleanup the smoke data so re-runs start clean.
  await reset();

  console.log("\n✅ All smoke checks passed.\n");
  await pool.end();
}

main().catch((err) => {
  console.error("\n✗ Smoke test failed:", err);
  pool.end().finally(() => process.exit(1));
});
