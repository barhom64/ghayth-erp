#!/usr/bin/env node
// Ghaith Exhaustive System Test — Phases 13-20 empirical harness.
// Drives the LIVE api-server through the localhost:80 shared proxy and the
// real Postgres (DATABASE_URL). Captures first-hand evidence for:
//   Phase 14 Upload, Phase 15 Notifications, Phase 16 Rate-limits,
//   Phase 17 Cron, Phase 18 Reports-with-source-data, Phase 19 Workflow states.
// HONESTY: prints raw status codes / counts. No claim is made beyond captured output.
import pg from "pg";

const BASE = process.env.QA_BASE || "http://localhost:80";
const EMAIL = process.env.ADMIN_EMAIL || "admin@ghayth.com";
const PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123456";

const out = { startedAt: new Date().toISOString(), base: BASE, phases: {} };

function parseSetCookie(res) {
  const jar = {};
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return jar;
}
function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login(useE2E = true) {
  const headers = { "Content-Type": "application/json" };
  if (useE2E) headers["X-E2E-Test"] = "1";
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const jar = parseSetCookie(res);
  return { status: res.status, jar };
}

async function api(method, path, { jar, body, e2e = true } = {}) {
  const headers = {};
  if (e2e) headers["X-E2E-Test"] = "1";
  if (jar) headers["Cookie"] = cookieHeader(jar);
  if (jar && jar.erp_csrf && method !== "GET") headers["X-CSRF-Token"] = jar.erp_csrf;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null, text = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) { try { json = await res.json(); } catch { /* */ } }
  else { try { text = (await res.text()).slice(0, 200); } catch { /* */ } }
  return { status: res.status, json, text };
}

function dbCount(client, sql, params = []) {
  return client.query(sql, params).then((r) => Number(r.rows[0]?.c ?? 0)).catch((e) => `ERR:${e.code || e.message}`);
}

async function main() {
  const { Client } = pg;
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  // ---- auth ----
  const { status: loginStatus, jar } = await login(true);
  out.loginStatus = loginStatus;
  if (loginStatus !== 200) { console.error("LOGIN FAILED", loginStatus); }

  // ================= Phase 14: UPLOAD =================
  {
    const phase = { name: "Upload (object storage request-url)", cases: [] };
    // happy path: PDF
    const ok = await api("POST", "/api/storage/uploads/request-url", {
      jar, body: { name: "qa-test.pdf", size: 12345, contentType: "application/pdf" },
    });
    phase.cases.push({ case: "pdf 12KB", status: ok.status, hasUploadURL: !!(ok.json && ok.json.uploadURL), hasObjectPath: !!(ok.json && ok.json.objectPath) });
    // rejected content type
    const bad = await api("POST", "/api/storage/uploads/request-url", {
      jar, body: { name: "x.exe", size: 100, contentType: "application/x-msdownload" },
    });
    phase.cases.push({ case: "disallowed exe", status: bad.status, expected: 400 });
    // oversize
    const big = await api("POST", "/api/storage/uploads/request-url", {
      jar, body: { name: "big.pdf", size: 50 * 1024 * 1024, contentType: "application/pdf" },
    });
    phase.cases.push({ case: "oversize 50MB", status: big.status, expected: "400/422" });
    out.phases.upload = phase;
  }

  // ================= Phase 17: CRON =================
  {
    const phase = { name: "Cron trigger-by-name", triggered: [] };
    const list = await api("GET", "/api/automation/cron-jobs", { jar });
    const jobs = Array.isArray(list.json) ? list.json : (list.json?.data ?? list.json?.jobs ?? []);
    phase.listStatus = list.status;
    phase.totalJobs = Array.isArray(jobs) ? jobs.length : 0;
    // pick a representative cross-module sample (safe, idempotent scan jobs)
    const wanted = [
      "document_expiry_alerts", "contract_expiry_alerts", "fleet_status_check",
      "daily_smart_alert_scan", "daily_self_audit", "daily_kpi_snapshot",
      "leave_escalation_check", "daily_inventory_check", "hourly_workflow_sla_check",
      "vehicle_maintenance_schedule_scan",
    ];
    const cronLogsBefore = await dbCount(db, `SELECT count(*)::int c FROM cron_logs`);
    for (const w of wanted) {
      const job = Array.isArray(jobs) ? jobs.find((j) => j.name === w) : null;
      if (!job) { phase.triggered.push({ name: w, found: false }); continue; }
      const r = await api("POST", `/api/automation/cron-jobs/${job.id}/trigger`, { jar });
      phase.triggered.push({
        name: w, id: job.id, status: r.status,
        success: r.json?.success ?? null,
        result: (r.json?.result ?? r.json?.error ?? "").toString().slice(0, 120),
      });
    }
    const cronLogsAfter = await dbCount(db, `SELECT count(*)::int c FROM cron_logs`);
    phase.cronLogsBefore = cronLogsBefore;
    phase.cronLogsAfter = cronLogsAfter;
    phase.cronLogsDelta = (typeof cronLogsAfter === "number" && typeof cronLogsBefore === "number") ? cronLogsAfter - cronLogsBefore : "n/a";
    out.phases.cron = phase;
  }

  // ================= Phase 15: NOTIFICATIONS =================
  {
    const phase = { name: "Notifications + outbound_queue" };
    phase.notificationsTotal = await dbCount(db, `SELECT count(*)::int c FROM notifications`);
    phase.outboundQueueTotal = await dbCount(db, `SELECT count(*)::int c FROM outbound_queue`).catch(() => "no-table");
    phase.notifLast24h = await dbCount(db, `SELECT count(*)::int c FROM notifications WHERE "createdAt" > NOW() - INTERVAL '24 hours'`);
    // sample channel breakdown of outbound_queue
    try {
      const ch = await db.query(`SELECT channel, status, count(*)::int c FROM outbound_queue GROUP BY channel, status ORDER BY c DESC LIMIT 12`);
      phase.outboundByChannel = ch.rows;
    } catch (e) { phase.outboundByChannel = `ERR:${e.code || e.message}`; }
    out.phases.notifications = phase;
  }

  // ================= Phase 18: REPORTS with source data =================
  {
    const phase = { name: "Reports with source data", reports: [] };
    const reportEndpoints = [
      "/api/bi/dashboard", "/api/bi/kpis", "/api/finance/dashboard",
      "/api/finance/reports/trial-balance", "/api/finance/reports/income-statement",
      "/api/finance/reports/balance-sheet", "/api/hr/dashboard",
      "/api/fleet/dashboard", "/api/warehouse/dashboard", "/api/properties/dashboard",
      "/api/dashboard/overview", "/api/finance/reports/general-ledger",
      "/api/hr/employees-status?page=1&limit=5", "/api/support/tickets?page=1&limit=5",
      "/api/finance/invoices?page=1&limit=5",
    ];
    for (const ep of reportEndpoints) {
      const r = await api("GET", ep, { jar });
      const j = r.json;
      let rows = null;
      if (Array.isArray(j)) rows = j.length;
      else if (Array.isArray(j?.data)) rows = j.data.length;
      else if (Array.isArray(j?.items)) rows = j.items.length;
      else if (j && typeof j === "object") rows = Object.keys(j).length;
      phase.reports.push({ ep, status: r.status, rowsOrKeys: rows });
    }
    out.phases.reports = phase;
  }

  // ================= Phase 19: WORKFLOW STATES =================
  {
    const phase = { name: "Workflow / approval states" };
    try {
      const ar = await db.query(`SELECT status, count(*)::int c FROM approval_requests GROUP BY status ORDER BY c DESC LIMIT 15`);
      phase.approvalRequestsByStatus = ar.rows;
    } catch (e) { phase.approvalRequestsByStatus = `ERR:${e.code || e.message}`; }
    try {
      const lc = await db.query(`SELECT entity_type, state, count(*)::int c FROM lifecycle_states GROUP BY entity_type, state ORDER BY c DESC LIMIT 15`);
      phase.lifecycleStates = lc.rows;
    } catch (e) {
      // fallback: invoices/journal_entries status distribution proves state machines
      try {
        const inv = await db.query(`SELECT status, count(*)::int c FROM invoices GROUP BY status ORDER BY c DESC LIMIT 10`);
        phase.invoiceStates = inv.rows;
      } catch (e2) { phase.invoiceStates = `ERR:${e2.code || e2.message}`; }
      try {
        const je = await db.query(`SELECT status, count(*)::int c FROM journal_entries GROUP BY status ORDER BY c DESC LIMIT 10`);
        phase.journalEntryStates = je.rows;
      } catch (e3) { phase.journalEntryStates = `ERR:${e3.code || e3.message}`; }
    }
    out.phases.workflowStates = phase;
  }

  await db.end();

  // ================= Phase 16: RATE LIMITS (no e2e marker => limiter active) =================
  {
    const phase = { name: "Rate limits under load", probes: [] };
    // /api/auth/login per-IP limiter: windowMs 60s, max 10. Use a BOGUS email so
    // no real account's failedLoginAttempts/lockout is touched. No X-E2E header.
    let got429 = false, firstBlockedAt = null;
    const codes = [];
    for (let i = 1; i <= 16; i++) {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `ratelimit-probe-${Date.now()}@nonexistent.invalid`, password: "x" }),
      });
      codes.push(res.status);
      if (res.status === 429 && !got429) { got429 = true; firstBlockedAt = i; }
    }
    phase.probes.push({ endpoint: "POST /api/auth/login (no-e2e, bogus email)", attempts: 16, codes, got429, firstBlockedAt, limiterMax: 10 });
    out.phases.rateLimits = phase;
  }

  out.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error("HARNESS FATAL", e); process.exit(1); });
