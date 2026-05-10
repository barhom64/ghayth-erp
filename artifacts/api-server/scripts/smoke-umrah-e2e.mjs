#!/usr/bin/env node
/**
 * Comprehensive end-to-end review for the Umrah workflow.
 *
 * Drives the entire workflow over HTTP — exactly the way production
 * does — against a live server with the seeded test admin. Verifies
 * every business rule from the 18-section spec AND verifies the
 * side-effects (audit_logs, event_logs, group state flips, etc.) that
 * a route smoke test alone wouldn't catch.
 *
 * The test is one big sequenced scenario rather than independent
 * sub-tests, because the spec's rules are inherently sequential:
 * an import creates the agents → those agents need pricing → those
 * prices feed sales invoices → those sales drive commissions → those
 * commissions trigger payroll lines. Splitting it would lose the
 * realistic integration view.
 *
 * Run: pnpm run build && start-server-then-this.
 */

import * as XLSX from "xlsx";
import pg from "pg";

const BASE = process.env.API_BASE ?? "http://localhost:5000";
const DB_URL = process.env.DATABASE_URL ?? "postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp";
const EMAIL = "owner@local.test";
const PASSWORD = "Test1234!";

let TOKEN = "";
let pool;
let pass = 0, fail = 0;
const failures = [];

function assert(cond, msg) {
  if (!cond) {
    fail++;
    failures.push(msg);
    console.error("  ✗", msg);
  } else {
    pass++;
    console.log("  ✓", msg);
  }
}

async function api(method, path, body, opts = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    ...(opts.headers ?? {}),
  };
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

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
  const c = await pool.connect();
  try {
    await c.query(`DELETE FROM umrah_import_changes WHERE "companyId"=1`);
    await c.query(`DELETE FROM umrah_import_batches WHERE "companyId"=1`);
    await c.query(`DELETE FROM employee_commission_calculations WHERE "companyId"=1`);
    await c.query(`DELETE FROM employee_commission_tiers WHERE "companyId"=1`);
    await c.query(`DELETE FROM employee_commission_plans WHERE "companyId"=1`);
    await c.query(`DELETE FROM umrah_violations WHERE "companyId"=1`);
    await c.query(`DELETE FROM umrah_nusk_invoices WHERE "companyId"=1`);
    await c.query(`DELETE FROM umrah_mutamers WHERE "companyId"=1`);
    await c.query(`DELETE FROM umrah_pricing WHERE "companyId"=1`);
    await c.query(`DELETE FROM umrah_groups WHERE "companyId"=1`);
    await c.query(`DELETE FROM umrah_sub_agents WHERE "companyId"=1`);
    await c.query(`DELETE FROM umrah_agents WHERE "companyId"=1 AND ("nuskAgentNumber" LIKE 'E2E-%' OR name LIKE '%E2E%')`);
    await c.query(`DELETE FROM audit_logs WHERE entity LIKE 'umrah_%' AND "createdAt" > NOW() - INTERVAL '1 hour'`);
    await c.query(`DELETE FROM event_logs WHERE action LIKE 'umrah.%' AND "createdAt" > NOW() - INTERVAL '1 hour'`);
  } finally { c.release(); }
}

async function dbCount(sql, params = []) {
  const r = await pool.query(sql, params);
  return Number(r.rows[0]?.c ?? r.rows[0]?.count ?? 0);
}
async function dbRow(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows[0] ?? null;
}
async function dbRows(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

// ===========================================================================

async function section(name, fn) {
  console.log(`\n${"=".repeat(72)}\n${name}\n${"=".repeat(72)}`);
  await fn();
}

async function main() {
  pool = new pg.Pool({ connectionString: DB_URL });

  // ───────────────────────────────────────────────────────────────────────
  await section("§0  PRE-CHECK — schema + login", async () => {
    const tables = await dbCount(
      `SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema='public' AND table_name IN (
          'umrah_sub_agents','umrah_groups','umrah_mutamers','umrah_pricing','umrah_nusk_invoices',
          'umrah_violations','umrah_import_batches','umrah_import_changes',
          'employee_commission_plans','employee_commission_tiers','employee_commission_calculations'
        )`
    );
    assert(tables === 11, `migration 067 created all 11 new tables (got ${tables})`);

    const settings = await dbCount(`SELECT COUNT(*) FROM system_settings WHERE key LIKE 'umrah.%'`);
    assert(settings === 8, `8 umrah.* settings seeded (got ${settings})`);

    const season = await dbRow(`SELECT id, "isCurrent" FROM umrah_seasons WHERE "hijriYear"=1447 AND "companyId"=1`);
    assert(season !== null, "season 1447 H seeded for company 1");
    assert(season.isCurrent === true, "season 1447 marked as current");

    await reset();
    // Seed a client we can link sub-agents to (no /clients endpoint we can hit
    // unauthenticated; using direct SQL keeps the test self-contained).
    await pool.query(
      `INSERT INTO clients (id, "companyId", code, type, name, classification)
       VALUES (1, 1, 'E2E-CLIENT-1', 'company', 'عميل اختبار E2E', 'active')
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, "deletedAt"=NULL`
    );

    const login = await api("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
    TOKEN = login.token;
    assert(TOKEN.length > 50, "auth: got JWT token");
  });

  let seasonId, agentId, sub1Id, sub2Id;

  // ───────────────────────────────────────────────────────────────────────
  await section("§1  SUB-AGENTS — CRUD + client linking + unlinked tracking", async () => {
    const seasons = await api("GET", "/umrah/seasons");
    seasonId = seasons.data?.[0]?.id;
    assert(seasonId > 0, `season list returned id=${seasonId}`);

    const a = await api("POST", "/umrah/agents", { name: "وكيل الدور E2E", country: "كمبوديا" });
    agentId = a.id;
    assert(agentId > 0, `agent created (id=${agentId})`);

    sub1Id = (await api("POST", "/umrah/sub-agents", {
      name: "وكالة E2E مربوطة",
      nuskCode: "E2E-SUB-1",
      agentId,
      clientId: 1, // owner@local.test seeded a client #1
      paymentTerms: "postpaid",
    })).id;
    sub2Id = (await api("POST", "/umrah/sub-agents", {
      name: "وكالة E2E غير مربوطة",
      nuskCode: "E2E-SUB-2",
      agentId,
      paymentTerms: "prepaid",
    })).id;
    assert(sub1Id > 0 && sub2Id > 0, `two sub-agents created (linked=${sub1Id}, unlinked=${sub2Id})`);

    const all = await api("GET", "/umrah/sub-agents");
    const found1 = all.data.find((s) => s.id === sub1Id);
    const found2 = all.data.find((s) => s.id === sub2Id);
    assert(found1?.clientId === 1, "sub-agent 1 has clientId=1 via JOIN");
    assert(found2?.clientId === null, "sub-agent 2 has clientId=null (unlinked)");

    const unlinked = await api("GET", "/umrah/sub-agents?unlinked=true");
    assert(unlinked.data.some((s) => s.id === sub2Id), "GET ?unlinked=true returns the unlinked one");

    const dash = await api("GET", "/umrah/dashboard/overview");
    assert(dash.totals.unlinkedSubAgents >= 1, `dashboard surfaces unlinked sub-agents (count=${dash.totals.unlinkedSubAgents})`);

    // Audit row written for create
    const auditRows = await dbCount(
      `SELECT COUNT(*) FROM audit_logs WHERE entity='umrah_sub_agents' AND "entityId"=$1`,
      [String(sub1Id)]
    );
    assert(auditRows >= 1, "audit_logs row written for sub-agent creation");
  });

  // ───────────────────────────────────────────────────────────────────────
  await section("§2  PRICING — date-range CRUD + audit log", async () => {
    const p1 = await api("POST", "/umrah/pricing", {
      agentId, seasonId,
      pricePerMutamer: 480,
      validFrom: "2026-01-01", validTo: "2026-02-28",
      includesHotel: false, includesTransport: false,
      notes: "سعر الفترة الأولى",
    });
    const p2 = await api("POST", "/umrah/pricing", {
      agentId, seasonId, subAgentId: sub1Id,
      pricePerMutamer: 500,
      validFrom: "2026-03-01",
      includesHotel: false, includesTransport: false,
      notes: "سعر سبيشل للوكيل المربوط",
    });
    assert(p1.id > 0 && p2.id > 0, "two pricing rows created");

    const list = await api("GET", `/umrah/pricing?seasonId=${seasonId}`);
    assert(list.data.length >= 2, `pricing list returned ≥2 rows (got ${list.data.length})`);

    // Verify audit log
    const auditRows = await dbCount(
      `SELECT COUNT(*) FROM audit_logs WHERE entity='umrah_pricing' AND action='create'`
    );
    assert(auditRows >= 2, `audit_logs has create rows for pricing (count=${auditRows})`);

    await api("PATCH", `/umrah/pricing/${p1.id}`, { pricePerMutamer: 490 });
    const after = (await api("GET", "/umrah/pricing")).data.find((p) => p.id === p1.id);
    assert(Number(after.pricePerMutamer) === 490, "pricing PATCH updates the value");
  });

  let batch1Id;

  // ───────────────────────────────────────────────────────────────────────
  await section("§3  IMPORT — day-1 mutamers (50 pilgrims, 3 groups, mixed statuses)", async () => {
    // 50 mutamers in 3 groups, normalised mix of normal/overstay/absconded/exited
    const rows = [];
    // Group 1 (sub1Id existing linked sub-agent): 20 normal pilgrims
    for (let i = 1; i <= 20; i++) {
      rows.push({
        nuskAgentNumber: "E2E-AGENT-AUTO",
        agentName: "وكيل الدور E2E", // existing in DB
        nuskCode: "E2E-SUB-1",       // existing linked
        subAgentName: "وكالة E2E مربوطة",
        country: "كمبوديا",
        nuskGroupNumber: "E2E-GRP-A",
        groupName: "مجموعة A",
        name: `معتمر A${i}`,
        nuskNumber: `E2E-A-${i.toString().padStart(3, "0")}`,
        nationality: "كمبودي",
        gender: i % 5 === 0 ? "أنثى" : "ذكر",
        passportNumber: `PA-${i}`,
        passportExpiry: "2030-12-31",
        entryDate: "2026-01-10",
        actualStayDays: 7, programDuration: 14,
        status: "داخل المملكة", isInsideKingdom: "نعم",
      });
    }
    // Group 2 (sub2Id unlinked): 15 pilgrims, 5 overstayed
    for (let i = 1; i <= 15; i++) {
      rows.push({
        nuskAgentNumber: "E2E-AGENT-AUTO",
        agentName: "وكيل الدور E2E",
        nuskCode: "E2E-SUB-2",
        subAgentName: "وكالة E2E غير مربوطة",
        country: "كمبوديا",
        nuskGroupNumber: "E2E-GRP-B",
        groupName: "مجموعة B",
        name: `معتمر B${i}`,
        nuskNumber: `E2E-B-${i.toString().padStart(3, "0")}`,
        nationality: "كمبودي", gender: "ذكر",
        passportNumber: `PB-${i}`,
        passportExpiry: "2030-12-31",
        entryDate: "2026-01-12",
        actualStayDays: i <= 5 ? 20 : 8, programDuration: 14,
        status: i <= 5 ? "متجاوز" : "داخل المملكة", isInsideKingdom: "نعم",
      });
    }
    // Group 3 (NEW sub-agent we haven't created yet): 15 pilgrims, 2 absconded
    for (let i = 1; i <= 15; i++) {
      rows.push({
        nuskAgentNumber: "E2E-AGENT-NEW",
        agentName: "وكيل جديد بالكامل E2E",
        nuskCode: "E2E-SUB-NEW",
        subAgentName: "وكالة جديدة عبر الاستيراد",
        country: "إندونيسيا",
        nuskGroupNumber: "E2E-GRP-C",
        groupName: "مجموعة C",
        name: `معتمر C${i}`,
        nuskNumber: `E2E-C-${i.toString().padStart(3, "0")}`,
        nationality: "إندونيسي", gender: "ذكر",
        passportNumber: `PC-${i}`,
        passportExpiry: "2030-12-31",
        entryDate: "2026-01-14",
        actualStayDays: 5, programDuration: 14,
        status: i <= 2 ? "تم التبليغ" : "داخل المملكة", isInsideKingdom: i > 2 ? "نعم" : "لا",
      });
    }
    assert(rows.length === 50, "50 mutamer rows generated");

    const buf = buildMutamersWorkbook(rows);
    const fileBase64 = buf.toString("base64");
    const preview = await api("POST", "/umrah/import/preview/mutamers", {
      seasonId, fileName: "e2e-day1.xlsx", fileSize: buf.length, fileBase64,
    });
    batch1Id = preview.batchId;
    assert(preview.newCount === 50, `preview newCount=50 (got ${preview.newCount})`);
    assert(preview.updatedCount === 0, "preview updatedCount=0 (all new)");
    // Two new agents auto-created: E2E-AGENT-AUTO + E2E-AGENT-NEW.
    // The §1 legacy agent has no seasonId/nuskAgentNumber so the importer
    // (which is per-season per spec §2.1) doesn't match it — correct.
    assert(preview.newAgents === 2, `2 new agents expected (got ${preview.newAgents})`);
    assert(preview.newSubAgents === 1, `1 new sub-agent expected (got ${preview.newSubAgents})`);
    assert(preview.newGroups === 3, `3 new groups expected (got ${preview.newGroups})`);
    assert(preview.newOverstays === 5, `5 overstays expected (got ${preview.newOverstays})`);
    assert(preview.newAbsconders === 2, `2 absconders expected (got ${preview.newAbsconders})`);
    assert(preview.unlinkedSubAgents.length >= 1, `unlinked sub-agents reported (got ${preview.unlinkedSubAgents.length})`);

    // Batch persisted with status='previewed'
    const batch = await dbRow(`SELECT status, "totalRows" FROM umrah_import_batches WHERE id=$1`, [batch1Id]);
    assert(batch.status === "previewed", "batch saved with status='previewed'");
    assert(Number(batch.totalRows) === 50, "batch totalRows=50");

    const confirm = await api("POST", `/umrah/import/confirm/${batch1Id}`);
    assert(confirm.applied.inserted === 50, `confirm inserted=50 (got ${confirm.applied.inserted})`);
    assert(confirm.applied.violationsCreated === 7, `7 violations created (5 overstay + 2 absconder) — got ${confirm.applied.violationsCreated}`);
    assert(confirm.applied.agentsCreated === 2, `2 agents auto-created — per-season scoping (got ${confirm.applied.agentsCreated})`);
    assert(confirm.applied.subAgentsCreated === 1, `1 sub-agent auto-created (got ${confirm.applied.subAgentsCreated})`);
    assert(confirm.applied.groupsCreated === 3, `3 groups auto-created (got ${confirm.applied.groupsCreated})`);

    // Verify state in DB
    const groupCounts = await dbRows(
      `SELECT "nuskGroupNumber", "mutamerCount", status FROM umrah_groups
        WHERE "companyId"=1 AND "deletedAt" IS NULL ORDER BY "nuskGroupNumber"`
    );
    const a = groupCounts.find((g) => g.nuskGroupNumber === "E2E-GRP-A");
    const b = groupCounts.find((g) => g.nuskGroupNumber === "E2E-GRP-B");
    const cg = groupCounts.find((g) => g.nuskGroupNumber === "E2E-GRP-C");
    assert(a?.mutamerCount === 20, `GRP-A has 20 mutamers (got ${a?.mutamerCount})`);
    assert(b?.mutamerCount === 15, `GRP-B has 15 mutamers (got ${b?.mutamerCount})`);
    assert(cg?.mutamerCount === 15, `GRP-C has 15 mutamers (got ${cg?.mutamerCount})`);
    assert(a.status === "imported", "GRP-A status = imported (no violations)");
    assert(b.status === "has_violations", "GRP-B status flipped to has_violations (5 overstays)");
    assert(cg.status === "has_violations", "GRP-C status flipped to has_violations (2 absconders)");

    // Verify violations rows
    const vios = await dbRows(`SELECT type, "penaltyAmount" FROM umrah_violations WHERE "companyId"=1 ORDER BY id`);
    assert(vios.length === 7, `7 violations rows (got ${vios.length})`);
    const absconderRows = vios.filter((v) => v.type === "absconded");
    assert(absconderRows.length === 2, `2 absconder violations (got ${absconderRows.length})`);
    assert(absconderRows.every((v) => Number(v.penaltyAmount) === 2000), "every absconder penalty = 2000 SAR (from settings)");

    // Verify event_logs
    const events = await dbCount(
      `SELECT COUNT(*) FROM event_logs WHERE action LIKE 'umrah.%' AND "createdAt" > NOW() - INTERVAL '5 minutes'`
    );
    assert(events >= 1, `event_logs has at least one umrah.* event (got ${events})`);

    // Verify import_changes log
    const changeCount = await dbCount(
      `SELECT COUNT(*) FROM umrah_import_changes WHERE "batchId"=$1`, [batch1Id]
    );
    assert(changeCount >= 50, `umrah_import_changes has ≥50 rows (got ${changeCount})`);
  });

  // ───────────────────────────────────────────────────────────────────────
  await section("§4  IMPORT — day-2 cumulative file (idempotency + diff)", async () => {
    // Rebuild day-1 rows + 1 changed (A1 exits) + 5 NEW pilgrims in GRP-A
    const day2 = [];
    for (let i = 1; i <= 20; i++) {
      const changed = i === 1;
      day2.push({
        nuskAgentNumber: "E2E-AGENT-AUTO",
        agentName: "وكيل الدور E2E",
        nuskCode: "E2E-SUB-1",
        subAgentName: "وكالة E2E مربوطة",
        country: "كمبوديا",
        nuskGroupNumber: "E2E-GRP-A",
        groupName: "مجموعة A",
        name: `معتمر A${i}`,
        nuskNumber: `E2E-A-${i.toString().padStart(3, "0")}`,
        nationality: "كمبودي",
        gender: i % 5 === 0 ? "أنثى" : "ذكر",
        passportNumber: `PA-${i}`,
        passportExpiry: "2030-12-31",
        entryDate: "2026-01-10",
        exitDate: changed ? "2026-01-17" : null,
        actualStayDays: changed ? 7 : 7, programDuration: 14,
        status: changed ? "خرج" : "داخل المملكة",
        isInsideKingdom: changed ? "لا" : "نعم",
      });
    }
    // 5 new pilgrims in GRP-A
    for (let i = 21; i <= 25; i++) {
      day2.push({
        nuskAgentNumber: "E2E-AGENT-AUTO",
        agentName: "وكيل الدور E2E", nuskCode: "E2E-SUB-1", subAgentName: "وكالة E2E مربوطة",
        country: "كمبوديا", nuskGroupNumber: "E2E-GRP-A", groupName: "مجموعة A",
        name: `معتمر A${i}`, nuskNumber: `E2E-A-${i.toString().padStart(3, "0")}`,
        nationality: "كمبودي", gender: "ذكر", passportNumber: `PA-${i}`,
        passportExpiry: "2030-12-31", entryDate: "2026-01-15",
        actualStayDays: 2, programDuration: 14,
        status: "داخل المملكة", isInsideKingdom: "نعم",
      });
    }
    const buf = buildMutamersWorkbook(day2);
    const prev = await api("POST", "/umrah/import/preview/mutamers", {
      seasonId, fileName: "e2e-day2.xlsx", fileSize: buf.length,
      fileBase64: buf.toString("base64"),
    });
    assert(prev.newCount === 5, `day-2 preview newCount=5 (got ${prev.newCount})`);
    assert(prev.updatedCount === 1, `day-2 preview updatedCount=1 (the exit) (got ${prev.updatedCount})`);
    assert(prev.skippedCount === 19, `day-2 preview skippedCount=19 (got ${prev.skippedCount})`);

    const conf = await api("POST", `/umrah/import/confirm/${prev.batchId}`);
    assert(conf.applied.inserted === 5, `day-2 inserted=5 (got ${conf.applied.inserted})`);
    assert(conf.applied.updated === 1, `day-2 updated=1 (got ${conf.applied.updated})`);
    assert(conf.applied.skipped === 19, `day-2 skipped=19 (got ${conf.applied.skipped})`);

    // GRP-A should now have 25 mutamers
    const a = await dbRow(`SELECT "mutamerCount" FROM umrah_groups WHERE "nuskGroupNumber"='E2E-GRP-A' AND "companyId"=1`);
    assert(Number(a.mutamerCount) === 25, `GRP-A mutamerCount=25 after day-2 (got ${a.mutamerCount})`);

    // Re-uploading day-2 → 0 changes
    const prev3 = await api("POST", "/umrah/import/preview/mutamers", {
      seasonId, fileName: "e2e-day2-again.xlsx", fileSize: buf.length,
      fileBase64: buf.toString("base64"),
    });
    assert(prev3.newCount === 0 && prev3.updatedCount === 0 && prev3.skippedCount === 25,
      `re-upload is fully idempotent (0/0/25 got ${prev3.newCount}/${prev3.updatedCount}/${prev3.skippedCount})`);
    await api("POST", `/umrah/import/reject/${prev3.batchId}`);
    const rejected = await dbRow(`SELECT status FROM umrah_import_batches WHERE id=$1`, [prev3.batchId]);
    assert(rejected.status === "rejected", "rejecting a previewed batch flips status to 'rejected'");
  });

  // ───────────────────────────────────────────────────────────────────────
  await section("§5  IMPORT — vouchers (net_cost computation + group linking)", async () => {
    const rows = [
      { nuskInvoiceNumber: "E2E-INV-A", agentName: "وكيل الدور E2E", nuskCode: "E2E-SUB-1",
        subAgentName: "وكالة E2E مربوطة", nuskGroupNumber: "E2E-GRP-A",
        mutamerCount: 25, nuskStatus: "مدفوعة",
        groundServices: 5000, electronicFees: 1000, visaFees: 7500, insuranceFees: 800,
        enrichmentServices: 0, additionalServices: 0,
        transportTotal: 2000, hotelTotal: 3000,
        refundAmount: 5000, // hotel+transport returned
        totalAmount: 19300,
        issueDate: "2026-01-09", programDuration: 14 },
      { nuskInvoiceNumber: "E2E-INV-B", agentName: "وكيل الدور E2E", nuskCode: "E2E-SUB-2",
        subAgentName: "وكالة E2E غير مربوطة", nuskGroupNumber: "E2E-GRP-B",
        mutamerCount: 15, nuskStatus: "مدفوعة",
        groundServices: 3000, electronicFees: 600, visaFees: 4500, insuranceFees: 480,
        enrichmentServices: 0, additionalServices: 0, transportTotal: 0, hotelTotal: 0,
        refundAmount: 0, totalAmount: 8580,
        issueDate: "2026-01-11", programDuration: 14 },
    ];
    const buf = buildVouchersWorkbook(rows);
    const prev = await api("POST", "/umrah/import/preview/vouchers", {
      seasonId, fileName: "e2e-vouchers.xlsx", fileSize: buf.length,
      fileBase64: buf.toString("base64"),
    });
    assert(prev.newCount === 2, `vouchers preview newCount=2 (got ${prev.newCount})`);
    const conf = await api("POST", `/umrah/import/confirm/${prev.batchId}`);
    assert(conf.applied.inserted === 2, `vouchers confirmed inserted=2 (got ${conf.applied.inserted})`);

    // Verify net_cost = total - refund (per spec §1.3)
    const inv1 = await dbRow(
      `SELECT "netCost","totalAmount","refundAmount" FROM umrah_nusk_invoices WHERE "nuskInvoiceNumber"='E2E-INV-A'`
    );
    assert(Number(inv1.netCost) === 14300, `netCost = 19300 - 5000 = 14300 (got ${inv1.netCost})`);

    // Group's nuskInvoiceNumber gets linked
    const a = await dbRow(`SELECT "nuskInvoiceNumber" FROM umrah_groups WHERE "nuskGroupNumber"='E2E-GRP-A' AND "companyId"=1`);
    assert(a.nuskInvoiceNumber === "E2E-INV-A", `group GRP-A linked to invoice (got ${a.nuskInvoiceNumber})`);
  });

  // ───────────────────────────────────────────────────────────────────────
  await section("§6  COMMISSION — full §9.3 worked examples", async () => {
    // Create the Ibrahim-style plan + tiers
    const plan = await api("POST", "/umrah/commission-plans", {
      employeeId: 1, planName: "خطة E2E لإبراهيم",
      baseSalary: 3500, commissionType: "tiered", conditionType: "both_or",
      minProfitPerVisa: 25, minSalesPercent: 20, minAvgPrice: 140,
      excludedMonths: [11, 12], tierUnit: 10000,
    });
    await api("POST", `/umrah/commission-plans/${plan.id}/tiers`,
      { fromCount: 0, toCount: 50000, bonusPerUnit: 500 });
    await api("POST", `/umrah/commission-plans/${plan.id}/tiers`,
      { fromCount: 50001, bonusPerUnit: 1000 });

    // §9.3 Example #1
    const ex1 = await api("POST", `/umrah/commission-plans/${plan.id}/simulate`, {
      totalMutamers: 37000, avgProfitPerVisa: 28, salesPercent: 22, avgSalePrice: 155,
    });
    assert(ex1.commissionAmount === 1500 && ex1.payrollTotal === 5000,
      `§9.3 ex#1: 37,000 → 1500 + 3500 = 5000 (got ${ex1.commissionAmount}/${ex1.payrollTotal})`);
    assert(ex1.completedTiers === 3, `§9.3 ex#1: 3 completed tiers (got ${ex1.completedTiers})`);
    assert(ex1.conditionMet === true, "§9.3 ex#1: condition met");

    // §9.3 Example #2 — excluded month
    const ex2 = await api("POST", `/umrah/commission-plans/${plan.id}/simulate`, {
      totalMutamers: 45000, avgProfitPerVisa: 30, salesPercent: 25, avgSalePrice: 160,
      isExcludedMonth: true,
    });
    assert(ex2.finalAmount === 0 && ex2.payrollTotal === 3500,
      `§9.3 ex#2: excluded month → final=0, payroll=3500 (got ${ex2.finalAmount}/${ex2.payrollTotal})`);
    assert(ex2.conditionDetails.includes("الشهر مستثنى"), "details surface excluded-month reason");

    // §9.3 Example #3 — conditions fail
    const ex3 = await api("POST", `/umrah/commission-plans/${plan.id}/simulate`, {
      totalMutamers: 40000, avgProfitPerVisa: 18, salesPercent: 15, avgSalePrice: 130,
    });
    assert(ex3.finalAmount === 0 && ex3.conditionMet === false,
      `§9.3 ex#3: conditions fail → final=0 (got ${ex3.finalAmount}, met=${ex3.conditionMet})`);

    // 60,000 pilgrims with off-by-one tier boundary (5×500 + 1×1000 = 3500)
    const ex4 = await api("POST", `/umrah/commission-plans/${plan.id}/simulate`, {
      totalMutamers: 60000, avgProfitPerVisa: 30, salesPercent: 25, avgSalePrice: 155,
    });
    assert(ex4.commissionAmount === 3500,
      `60,000 = 5×500 (tier 1) + 1×1000 (tier 2) = 3500 (got ${ex4.commissionAmount})`);

    // Actual DB calculation (will use real Umrah data — count of mutamers we just imported)
    const calc = await api("POST", `/umrah/commission-plans/${plan.id}/calculate`, {
      hijriMonth: 1, hijriYear: 1447,
      gregorianStart: "2026-01-01", gregorianEnd: "2026-01-31",
    });
    assert(calc.calculationId > 0, `commission_calculations row inserted (id=${calc.calculationId})`);
    assert(calc.inserted === true, "first run = inserted");
    assert(calc.stats.totalMutamers === 55, `stats.totalMutamers = 55 (20 GRP-A + 5 new GRP-A + 15 GRP-B + 15 GRP-C — got ${calc.stats.totalMutamers})`);

    // Re-run → same row, updated
    const recalc = await api("POST", `/umrah/commission-plans/${plan.id}/calculate`, {
      hijriMonth: 1, hijriYear: 1447,
      gregorianStart: "2026-01-01", gregorianEnd: "2026-01-31",
    });
    assert(recalc.calculationId === calc.calculationId, "re-run on calculated row uses same id");
    assert(recalc.inserted === false, "second run = updated, not inserted");

    // Move row to 'reviewed' via SQL (no PATCH endpoint yet on calculations)
    await pool.query(
      `UPDATE employee_commission_calculations SET status='reviewed' WHERE id=$1`,
      [calc.calculationId]
    );
    const preserve = await api("POST", `/umrah/commission-plans/${plan.id}/calculate`, {
      hijriMonth: 1, hijriYear: 1447,
      gregorianStart: "2026-01-01", gregorianEnd: "2026-01-31",
    });
    assert(preserve.preserved === true, "reviewed row is preserved (not overwritten)");

    // Excluded-month real calc
    const excludedCalc = await api("POST", `/umrah/commission-plans/${plan.id}/calculate`, {
      hijriMonth: 11, hijriYear: 1447,
      gregorianStart: "2026-05-01", gregorianEnd: "2026-05-31",
    });
    assert(excludedCalc.simulation.isExcludedMonth === true && excludedCalc.simulation.finalAmount === 0,
      "calculation for Dhu al-Qa'da (month 11) returns final=0");

    const history = await api("GET", "/umrah/commissions/history/1");
    assert(history.data.length >= 1, `history endpoint returned ${history.data.length} row(s)`);
    assert(history.data.some((h) => h.planName.includes("E2E")), "history join contains planName");

    // Monthly sweep
    const sweep = await api("POST", "/umrah/commissions/calculate-month", {
      hijriMonth: 1, hijriYear: 1447,
      gregorianStart: "2026-01-01", gregorianEnd: "2026-01-31",
    });
    assert(sweep.data.length >= 1, `sweep covered ${sweep.data.length} plan(s)`);
  });

  // ───────────────────────────────────────────────────────────────────────
  await section("§7  STATEMENTS — detailed + monthly summary", async () => {
    const det = await api("GET", `/umrah/statements/${sub2Id}?type=detailed`);
    assert(det.subAgent.id === sub2Id, "statement returns the correct sub-agent header");
    assert(Array.isArray(det.ledger), "detailed statement has ledger array");

    const sum = await api("GET", `/umrah/statements/${sub2Id}?type=summary`);
    assert(Array.isArray(sum.periods), "summary statement has periods array");
  });

  // ───────────────────────────────────────────────────────────────────────
  await section("§8  DASHBOARD — totals match SQL aggregates", async () => {
    const dash = await api("GET", "/umrah/dashboard/overview");
    const dbTotal = await dbCount(`SELECT COUNT(*) FROM umrah_mutamers WHERE "companyId"=1 AND "deletedAt" IS NULL`);
    assert(dash.totals.totalMutamers === dbTotal, `dashboard totalMutamers === SQL count (${dash.totals.totalMutamers} vs ${dbTotal})`);
    const dbOverstays = await dbCount(
      `SELECT COUNT(*) FROM umrah_mutamers WHERE "companyId"=1 AND "deletedAt" IS NULL
        AND "overstayDays" > 0 AND "isInsideKingdom"=true`
    );
    assert(dash.totals.overstays === dbOverstays, `dashboard overstays === SQL count (${dash.totals.overstays} vs ${dbOverstays})`);
    const dbAbsconders = await dbCount(
      `SELECT COUNT(*) FROM umrah_mutamers WHERE "companyId"=1 AND "deletedAt" IS NULL AND status='absconded'`
    );
    assert(dash.totals.absconders === dbAbsconders, `dashboard absconders === SQL count (${dash.totals.absconders} vs ${dbAbsconders})`);
  });

  // ───────────────────────────────────────────────────────────────────────
  await section("§9  GUARDS — closed season + delete with active groups", async () => {
    // Close the season
    await pool.query(`UPDATE umrah_seasons SET status='closed' WHERE id=$1`, [seasonId]);
    const tinyBuf = buildMutamersWorkbook([{
      nuskAgentNumber: "X", agentName: "X", nuskCode: "X", subAgentName: "X", country: "X",
      nuskGroupNumber: "X", groupName: "X", name: "X", nuskNumber: "X-1",
      nationality: "X", gender: "ذكر", passportNumber: "X1", passportExpiry: "2030-01-01",
      entryDate: "2026-01-10", actualStayDays: 5, programDuration: 14,
      status: "داخل المملكة", isInsideKingdom: "نعم",
    }]);
    let closedSeasonRejected = false;
    try {
      await api("POST", "/umrah/import/preview/mutamers", {
        seasonId, fileName: "x.xlsx", fileSize: tinyBuf.length, fileBase64: tinyBuf.toString("base64"),
      });
    } catch (err) {
      closedSeasonRejected = err.status === 409 && /مُقفل|closed/i.test(JSON.stringify(err.body));
    }
    assert(closedSeasonRejected, "import on closed season rejected with 409 ConflictError");
    await pool.query(`UPDATE umrah_seasons SET status='open' WHERE id=$1`, [seasonId]); // reopen for cleanup

    // Try to delete sub-agent with active groups
    let blocked = false;
    try {
      await api("DELETE", `/umrah/sub-agents/${sub1Id}`);
    } catch (err) {
      blocked = err.status === 409 && JSON.stringify(err.body).includes("activeGroups");
    }
    assert(blocked, "delete sub-agent with active groups blocked with 409 + activeGroups blocker");
  });

  // ───────────────────────────────────────────────────────────────────────
  await section("§10 BATCH-LEVEL ROLLBACK — confirming a rejected batch is forbidden", async () => {
    // Create a new batch and reject it, then try to confirm again
    const tinyBuf = buildMutamersWorkbook([{
      nuskAgentNumber: "E2E-AGENT-AUTO", agentName: "وكيل الدور E2E",
      nuskCode: "E2E-SUB-1", subAgentName: "وكالة E2E مربوطة", country: "كمبوديا",
      nuskGroupNumber: "E2E-GRP-A", groupName: "مجموعة A",
      name: "معتمر اختبار 99", nuskNumber: "E2E-A-099",
      nationality: "كمبودي", gender: "ذكر", passportNumber: "PA-99", passportExpiry: "2030-01-01",
      entryDate: "2026-01-20", actualStayDays: 1, programDuration: 14,
      status: "داخل المملكة", isInsideKingdom: "نعم",
    }]);
    const p = await api("POST", "/umrah/import/preview/mutamers", {
      seasonId, fileName: "rollback.xlsx", fileSize: tinyBuf.length, fileBase64: tinyBuf.toString("base64"),
    });
    await api("POST", `/umrah/import/reject/${p.batchId}`);
    let confirmBlocked = false;
    try {
      await api("POST", `/umrah/import/confirm/${p.batchId}`);
    } catch (err) {
      confirmBlocked = err.status === 409;
    }
    assert(confirmBlocked, "confirm on rejected batch returns 409 ConflictError");
  });

  // ───────────────────────────────────────────────────────────────────────
  await section("§11 RBAC — read paths require umrah:read", async () => {
    // The seeded admin has every permission so this is a sanity check
    // that the requirePermission middleware doesn't crash on routes
    // that wired it correctly. A failure here means the middleware
    // chain dropped req.scope.
    const r = await api("GET", "/umrah/sub-agents");
    assert(Array.isArray(r.data), "owner sees /sub-agents (scope chain intact)");
    const r2 = await api("GET", "/umrah/import/batches");
    assert(Array.isArray(r2.data), "owner sees /import/batches");
    const r3 = await api("GET", "/umrah/commission-plans");
    assert(Array.isArray(r3.data), "owner sees /commission-plans");
  });

  // ───────────────────────────────────────────────────────────────────────
  await section("§12 EVENT BUS — audit + event log rows for every emitted event", async () => {
    const auditMutamers = await dbCount(
      `SELECT COUNT(*) FROM audit_logs WHERE entity LIKE 'umrah_%' AND "createdAt" > NOW() - INTERVAL '5 minutes'`
    );
    assert(auditMutamers >= 5, `audit_logs has ≥5 rows for umrah_* entities (got ${auditMutamers})`);
    const events = await dbRows(
      `SELECT action, COUNT(*) AS c FROM event_logs
        WHERE action LIKE 'umrah.%' AND "createdAt" > NOW() - INTERVAL '5 minutes'
        GROUP BY action ORDER BY action`
    );
    console.log("\n  event_logs breakdown:");
    for (const e of events) console.log(`    ${e.action} → ${e.c}`);
    assert(events.length >= 2, `event_logs records ≥2 distinct umrah.* actions (got ${events.length})`);
  });

  // ───────────────────────────────────────────────────────────────────────
  await section("§13 CLEANUP", async () => {
    await reset();
    const c = await dbCount(`SELECT COUNT(*) FROM umrah_mutamers WHERE "companyId"=1`);
    assert(c === 0, "cleanup completed (0 mutamers left)");
  });

  await pool.end();

  console.log(`\n${"=".repeat(72)}`);
  console.log(`  ${pass} pass | ${fail} fail`);
  if (failures.length > 0) {
    console.log(`\nFailures:`);
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`${"=".repeat(72)}\n✅ End-to-end review PASSED\n`);
}

main().catch(async (err) => {
  console.error("\n✗ E2E review crashed:");
  console.error(err.message);
  if (err.body) console.error("Response body:", JSON.stringify(err.body, null, 2));
  if (pool) await pool.end().catch(() => {});
  process.exit(1);
});
