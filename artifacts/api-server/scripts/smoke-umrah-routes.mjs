#!/usr/bin/env node
/**
 * HTTP smoke test for the Umrah Phase-4 routes.
 *
 * Spins through every new endpoint in routes/umrah-entities.ts using the
 * baseline test admin (owner@local.test / Test1234!) created by
 * db/seed-admin-user.sql. The server must already be running on
 * http://localhost:5000.
 */

import * as XLSX from "xlsx";

const BASE = process.env.API_BASE ?? "http://localhost:5000";
const EMAIL = "owner@local.test";
const PASSWORD = "Test1234!";

let TOKEN = "";

function assert(cond, msg) {
  if (!cond) {
    console.error("✗", msg);
    process.exit(1);
  }
  console.log("  ✓", msg);
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
    const err = new Error(`${method} ${path} → ${res.status}`);
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
    "تاريخ الدخول","عدد ايام الاقامة","مدة البرنامج","حالة المعتمر","متواجد داخل المملكة",
  ];
  const aoa = [headers, ...rows.map((r) => [
    r.nuskAgentNumber, r.agentName, r.nuskCode, r.subAgentName, r.country,
    r.nuskGroupNumber, r.groupName, r.name, r.nuskNumber,
    r.nationality, r.gender, r.passportNumber, r.passportExpiry,
    r.entryDate, r.actualStayDays, r.programDuration, r.status, r.isInsideKingdom,
  ])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "تقرير المعتمرين");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function main() {
  console.log("\n[0] Login");
  const login = await api("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
  TOKEN = login.token;
  assert(TOKEN.length > 50, "got JWT token");

  // -------------------- SUB-AGENTS --------------------
  console.log("\n[1] Sub-agents CRUD");
  const subAgent = await api("POST", "/umrah/sub-agents", {
    name: "وكالة اختبار HTTP",
    nuskCode: "HTTP-TEST-1",
    paymentTerms: "postpaid",
  });
  assert(subAgent.id > 0, `created sub-agent (id=${subAgent.id})`);

  const subAgentList = await api("GET", "/umrah/sub-agents");
  assert(Array.isArray(subAgentList.data), "list returns array");
  assert(subAgentList.data.find((s) => s.id === subAgent.id), "list contains created sub-agent");

  const detail = await api("GET", `/umrah/sub-agents/${subAgent.id}`);
  assert(detail.name === "وكالة اختبار HTTP", "detail shows correct name");

  await api("PATCH", `/umrah/sub-agents/${subAgent.id}`, { paymentTerms: "prepaid" });
  const updated = await api("GET", `/umrah/sub-agents/${subAgent.id}`);
  assert(updated.paymentTerms === "prepaid", "PATCH updated paymentTerms");

  // -------------------- PRICING --------------------
  console.log("\n[2] Pricing CRUD");
  // We need an agent — pull from seasons
  const seasons = await api("GET", "/umrah/seasons");
  let seasonId = seasons.data?.[0]?.id;
  if (!seasonId) {
    // Create one if missing
    const s = await api("POST", "/umrah/seasons", {
      title: "موسم 1447 هـ",
      startDate: "2025-07-27",
      endDate: "2026-07-16",
    });
    seasonId = s.id;
  }

  // Insert an agent via raw http endpoint (legacy umrah.ts route)
  const agent = await api("POST", "/umrah/agents", {
    name: "وكيل HTTP اختبار",
    country: "كمبوديا",
  });
  assert(agent.id > 0, `created agent (id=${agent.id})`);

  const pricing = await api("POST", "/umrah/pricing", {
    agentId: agent.id,
    seasonId,
    pricePerMutamer: 480,
    validFrom: "2026-01-01",
    validTo: "2026-03-31",
    notes: "سعر اختبار",
  });
  assert(pricing.id > 0, `created pricing (id=${pricing.id})`);

  const pricingList = await api("GET", `/umrah/pricing?seasonId=${seasonId}`);
  assert(pricingList.data.find((p) => p.id === pricing.id), "pricing list contains row");

  await api("PATCH", `/umrah/pricing/${pricing.id}`, { pricePerMutamer: 500 });

  // -------------------- IMPORT --------------------
  console.log("\n[3] Import preview + confirm — mutamers");
  const rows = [
    { nuskAgentNumber:"HTTP-AGENT-1", agentName:"الدور كمبوديا HTTP", nuskCode:"HTTP-SUB-1",
      subAgentName:"وكالة HTTP الفرعية", country:"كمبوديا",
      nuskGroupNumber:"HTTP-GRP-1", groupName:"مجموعة HTTP", name:"معتمر اختبار 1", nuskNumber:"HTTP-1001",
      nationality:"كمبودي", gender:"ذكر", passportNumber:"HP-1", passportExpiry:"2030-01-01",
      entryDate:"2026-01-10", actualStayDays:5, programDuration:14,
      status:"داخل المملكة", isInsideKingdom:"نعم" },
    { nuskAgentNumber:"HTTP-AGENT-1", agentName:"الدور كمبوديا HTTP", nuskCode:"HTTP-SUB-1",
      subAgentName:"وكالة HTTP الفرعية", country:"كمبوديا",
      nuskGroupNumber:"HTTP-GRP-1", groupName:"مجموعة HTTP", name:"معتمر اختبار 2", nuskNumber:"HTTP-1002",
      nationality:"كمبودي", gender:"ذكر", passportNumber:"HP-2", passportExpiry:"2030-01-01",
      entryDate:"2026-01-10", actualStayDays:18, programDuration:14,
      status:"متجاوز", isInsideKingdom:"نعم" },
  ];
  const buf = buildMutamersWorkbook(rows);
  const fileBase64 = buf.toString("base64");

  const preview = await api("POST", "/umrah/import/preview/mutamers", {
    seasonId,
    fileName: "http-test.xlsx",
    fileSize: buf.length,
    fileBase64,
  });
  assert(preview.batchId > 0, `preview created batch ${preview.batchId}`);
  assert(preview.newCount === 2, `preview newCount=2 (got ${preview.newCount})`);
  assert(preview.newOverstays >= 1, `preview newOverstays>=1 (got ${preview.newOverstays})`);

  const confirm = await api("POST", `/umrah/import/confirm/${preview.batchId}`);
  assert(confirm.applied.inserted === 2, `confirm inserted=2 (got ${confirm.applied.inserted})`);
  assert(confirm.applied.violationsCreated >= 1, `confirm created violation`);

  // -------------------- BATCHES --------------------
  console.log("\n[4] Batches list + changes");
  const batches = await api("GET", "/umrah/import/batches");
  assert(batches.data.find((b) => b.id === preview.batchId), "batch in list");
  const batchDetail = await api("GET", `/umrah/import/batches/${preview.batchId}`);
  assert(batchDetail.status === "confirmed", "batch status = confirmed");
  const changes = await api("GET", `/umrah/import/batches/${preview.batchId}/changes`);
  assert(changes.data.length >= 2, `changes log has ≥2 rows (got ${changes.data.length})`);

  // -------------------- VIOLATIONS --------------------
  console.log("\n[5] Violations list + manual create");
  const violations = await api("GET", "/umrah/violations");
  const httpViolations = violations.data.filter((v) =>
    String(v.referenceNumber || "").startsWith("HP-")
  );
  assert(httpViolations.length >= 1, `auto-created violation visible (got ${httpViolations.length})`);

  const manualViolation = await api("POST", "/umrah/violations", {
    type: "other",
    referenceType: "passport",
    referenceNumber: "HP-MANUAL-1",
    description: "غرامة اختبار يدوي",
    penaltyAmount: 500,
  });
  assert(manualViolation.id > 0, "manual violation created");

  // -------------------- COMMISSION PLANS --------------------
  console.log("\n[6] Commission plan + tiers + simulate");
  const plan = await api("POST", "/umrah/commission-plans", {
    employeeId: 1,
    planName: "خطة HTTP الاختبارية",
    baseSalary: 3500,
    commissionType: "tiered",
    conditionType: "both_or",
    minProfitPerVisa: 25,
    minSalesPercent: 20,
    minAvgPrice: 140,
    excludedMonths: [11, 12],
    tierUnit: 10000,
  });
  assert(plan.id > 0, `commission plan created (id=${plan.id})`);

  const tier1 = await api("POST", `/umrah/commission-plans/${plan.id}/tiers`, {
    fromCount: 0, toCount: 50000, bonusPerUnit: 500,
  });
  await api("POST", `/umrah/commission-plans/${plan.id}/tiers`, {
    fromCount: 50001, bonusPerUnit: 1000,
  });
  assert(tier1.id > 0, "tier created");

  const simulation = await api("POST", `/umrah/commission-plans/${plan.id}/simulate`, {
    totalMutamers: 37000, avgProfitPerVisa: 28, salesPercent: 22, avgSalePrice: 155,
  });
  assert(simulation.commissionAmount === 1500, `simulate = 1500 SAR (got ${simulation.commissionAmount})`);
  assert(simulation.payrollTotal === 5000, `payroll total = 5000 (got ${simulation.payrollTotal})`);

  const calc = await api("POST", `/umrah/commission-plans/${plan.id}/calculate`, {
    hijriMonth: 1, hijriYear: 1447,
    gregorianStart: "2026-01-01", gregorianEnd: "2026-01-31",
  });
  assert(calc.calculationId > 0, `calculation row id=${calc.calculationId}`);

  const history = await api("GET", `/umrah/commissions/history/1`);
  assert(history.data.length >= 1, `history returned ${history.data.length} row(s)`);

  // -------------------- STATEMENTS --------------------
  console.log("\n[7] Statement (detailed + summary)");
  const detailed = await api("GET", `/umrah/statements/${subAgent.id}?type=detailed`);
  assert(detailed.subAgent.id === subAgent.id, "statement returned for the right sub-agent");
  assert(Array.isArray(detailed.ledger), "detailed has ledger array");
  const summary = await api("GET", `/umrah/statements/${subAgent.id}?type=summary`);
  assert(Array.isArray(summary.periods), "summary has periods array");

  // -------------------- DASHBOARD --------------------
  console.log("\n[8] Dashboard overview");
  const dash = await api("GET", "/umrah/dashboard/overview");
  assert(typeof dash.totals.totalMutamers === "number", "dashboard totals returned");
  assert(dash.totals.totalMutamers >= 2, `totalMutamers ≥ 2 (got ${dash.totals.totalMutamers})`);

  // -------------------- CLEANUP --------------------
  console.log("\n[9] Cleanup soft-deletes");
  await api("DELETE", `/umrah/commission-plans/${plan.id}`);
  await api("DELETE", `/umrah/pricing/${pricing.id}`);
  // Sub-agent has groups now (auto-created via import) so DELETE should refuse.
  try {
    await api("DELETE", `/umrah/sub-agents/${subAgent.id}`);
    // OK if no groups linked.
    console.log("  ✓ sub-agent deleted (no active groups linked to this one)");
  } catch (err) {
    if (err.status === 409) {
      console.log("  ✓ sub-agent delete refused (active groups) — typed CONFLICT");
    } else {
      throw err;
    }
  }

  console.log("\n✅ All HTTP smoke checks passed.\n");
}

main().catch((err) => {
  console.error("\n✗ Smoke failed:");
  console.error(err.message);
  if (err.body) console.error("Response body:", JSON.stringify(err.body, null, 2));
  process.exit(1);
});
