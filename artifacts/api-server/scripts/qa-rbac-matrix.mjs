// Ghaith Exhaustive System Test — Phase 7 (RBAC read matrix) + Phase 8 (tenant isolation) harness.
// Seeds ONE disposable QA user per role_key (company 1 = full role catalog; company 2 = subset for
// tenant-isolation), then probes every parameter-free GET endpoint (from /api/_routes) as each
// principal + a no-session baseline, recording the raw HTTP status. Empirical only — no PASS/FAIL
// claims are fabricated; the JSON records exactly what the server returned.
//
// Run from artifacts/api-server so pg + bcryptjs resolve:
//   node scripts/qa-rbac-matrix.mjs            (seed + probe + write results)
//   node scripts/qa-rbac-matrix.mjs --teardown (remove all qa.*@qa.test seed data)
import pg from "pg";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const { Pool } = pg;
const BASE = process.env.QA_BASE || "http://localhost:80";
const PW = "Qa!23456";
const HASH = bcrypt.hashSync(PW, 10);
const OUT_DIR = path.resolve(process.cwd(), "../../docs/testing/generated");
const CONCURRENCY = 8;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);

// company 1 = the full role catalog present; company 2 = subset for tenant isolation
const C1_ROLES = [
  "owner", "general_manager", "finance_manager", "hr_manager", "payroll_officer",
  "fleet_manager", "warehouse_manager", "legal_manager", "support_manager", "crm_manager",
  "projects_manager", "property_manager", "bi_manager", "branch_manager", "department_manager",
  "discipline_officer", "performance_reviewer", "attendance_officer", "driver", "employee",
];
const C2_ROLES = ["owner", "warehouse_manager", "finance_manager"];

async function seedUserForRole(companyId, roleKey) {
  const roles = await q(`SELECT id FROM rbac_roles WHERE "companyId"=$1 AND role_key=$2 LIMIT 1`, [companyId, roleKey]);
  if (!roles.length) return { roleKey, companyId, skipped: "no rbac_role row" };
  const roleId = roles[0].id;
  const br = await q(`SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id LIMIT 1`, [companyId]);
  if (!br.length) return { roleKey, companyId, skipped: "no branch" };
  const branchId = br[0].id;
  const email = `qa.${roleKey}.c${companyId}@qa.test`;

  let u = await q(`SELECT id, "employeeId" FROM users WHERE email=$1`, [email]);
  let userId, employeeId;
  if (u.length) {
    userId = u[0].id; employeeId = u[0].employeeId;
    await q(`UPDATE users SET "passwordHash"=$2, role=$3, "isActive"=true WHERE id=$1`, [userId, HASH, roleKey]);
  } else {
    const emp = await q(
      `INSERT INTO employees (name, "companyId", "branchId", status, email) VALUES ($1,$2,$3,'active',$4) RETURNING id`,
      [`QA ${roleKey} C${companyId}`, companyId, branchId, email]
    );
    employeeId = emp[0].id;
    const usr = await q(
      `INSERT INTO users (email, "passwordHash", "employeeId", role, "isActive") VALUES ($1,$2,$3,$4,true) RETURNING id`,
      [email, HASH, employeeId, roleKey]
    );
    userId = usr[0].id;
  }

  const asg = await q(`SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2`, [employeeId, companyId]);
  if (!asg.length) {
    await q(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,status,"isPrimary")
       VALUES ($1,$2,$3,$4,$5,'active',true)`,
      [employeeId, companyId, branchId, `QA ${roleKey}`, roleKey]
    );
  } else {
    await q(`UPDATE employee_assignments SET status='active', role=$2 WHERE id=$1`, [asg[0].id, roleKey]);
  }

  const ur = await q(`SELECT id FROM rbac_user_roles WHERE "userId"=$1 AND role_id=$2`, [userId, roleId]);
  if (!ur.length) {
    await q(
      `INSERT INTO rbac_user_roles ("userId","companyId",role_id,"branchId",is_primary) VALUES ($1,$2,$3,$4,true)`,
      [userId, companyId, roleId, branchId]
    );
  }
  return { roleKey, companyId, email, userId, employeeId, branchId, roleId };
}

function parseCookies(setCookieArr) {
  const jar = {};
  for (const c of setCookieArr || []) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return jar;
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(email, pw = PW) {
  let last = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-E2E-Test": "1" },
      body: JSON.stringify({ email, password: pw }),
    });
    last = res.status;
    if (res.status === 403 || res.status === 429) { await sleep(2500); continue; }
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    const jar = parseCookies(set);
    return { status: res.status, jar, hasAccess: !!jar.erp_access };
  }
  return { status: last, jar: {}, hasAccess: false };
}

async function probe(principal, paths) {
  const results = {};
  let i = 0;
  async function worker() {
    while (i < paths.length) {
      const idx = i++;
      const p = paths[idx];
      try {
        const headers = principal.jar ? { Cookie: cookieHeader(principal.jar) } : {};
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 15000);
        let res;
        try {
          res = await fetch(`${BASE}${p}`, { method: "GET", headers, redirect: "manual", signal: ac.signal });
        } finally { clearTimeout(t); }
        let bodySnippet = "";
        if (res.status >= 500) {
          try { bodySnippet = (await res.text()).slice(0, 180); } catch { /* ignore */ }
        }
        results[p] = bodySnippet ? { s: res.status, b: bodySnippet } : { s: res.status };
      } catch (e) {
        results[p] = { s: 0, b: (e && e.name === "AbortError" ? "TIMEOUT_15s" : String(e).slice(0, 120)) };
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

async function teardown() {
  const users = await q(`SELECT id, "employeeId" FROM users WHERE email LIKE 'qa.%@qa.test'`, []);
  const userIds = users.map((u) => u.id);
  const empIds = users.map((u) => u.employeeId).filter(Boolean);
  if (userIds.length) {
    await q(`DELETE FROM rbac_user_roles WHERE "userId" = ANY($1::int[])`, [userIds]);
  }
  if (empIds.length) {
    await q(`DELETE FROM employee_assignments WHERE "employeeId" = ANY($1::int[])`, [empIds]);
  }
  await q(`DELETE FROM users WHERE email LIKE 'qa.%@qa.test'`, []);
  if (empIds.length) {
    await q(`DELETE FROM employees WHERE id = ANY($1::int[])`, [empIds]);
  }
  console.log(`[teardown] removed ${userIds.length} qa users + ${empIds.length} employees`);
}

async function main() {
  if (process.argv.includes("--teardown")) { await teardown(); await pool.end(); return; }

  // route list — use the RECONSTRUCTED full GET path list (file->mount-prefix join,
  // owner-validated non-404). The /api/_routes scanner truncates multi-segment /
  // middleware-wrapped mounts (e.g. /api/finance/accounts -> /api/accounts) and is
  // NOT a trustworthy path source. Build it fresh via qa-build-paths.mjs if missing.
  const admin = await login("admin@ghayth.com", process.env.QA_ADMIN_PW || "Admin@123456");
  if (!admin.hasAccess) throw new Error(`admin login failed status=${admin.status}`);
  const pathFile = path.join(OUT_DIR, "backend-getpaths.json");
  if (!fs.existsSync(pathFile)) {
    throw new Error(`missing ${pathFile} — run: node scripts/qa-build-paths.mjs first`);
  }
  const seen = new Set();
  const paths = [];
  for (let p of JSON.parse(fs.readFileSync(pathFile, "utf8"))) {
    p = p.replace(/\/+$/, "");
    if (p === "/api" || p === "" || p.includes(":") || p.includes("*")) continue;
    if (seen.has(p)) continue;
    seen.add(p); paths.push(p);
  }
  paths.sort();
  console.log(`[routes] ${paths.length} distinct reconstructed param-free GET endpoints`);

  // seed
  const seeded = [];
  for (const r of C1_ROLES) seeded.push(await seedUserForRole(1, r));
  for (const r of C2_ROLES) seeded.push(await seedUserForRole(2, r));
  const ok = seeded.filter((s) => s.email);
  console.log(`[seed] ${ok.length}/${seeded.length} role users ready (${seeded.filter((s) => s.skipped).length} skipped)`);

  // principal DESCRIPTORS (login happens per-principal at probe time so long runs
  // never use stale JWTs, and the run is RESUMABLE: each principal's result is
  // checkpointed to a part file; a killed run resumes by skipping existing parts).
  const descriptors = [{ name: "NO_SESSION", role: "(none)", company: null, email: null, pw: null }];
  descriptors.push({ name: "admin@ghayth.com", role: "owner(existing)", company: 1, email: "admin@ghayth.com", pw: process.env.QA_ADMIN_PW || "Admin@123456" });
  for (const s of ok.filter((x) => x.companyId === 1)) {
    descriptors.push({ name: s.email, role: s.roleKey, company: 1, email: s.email, pw: PW });
  }

  const partsDir = path.join(OUT_DIR, ".rbac-parts");
  fs.mkdirSync(partsDir, { recursive: true });
  for (const d of descriptors) {
    const partFile = path.join(partsDir, d.name.replace(/[^\w.@-]/g, "_") + ".json");
    if (fs.existsSync(partFile)) { console.log(`[skip] ${d.name} (part exists)`); continue; }
    let jar = null, loginStatus = null, loginOk = true;
    if (d.email) {
      const lg = await login(d.email, d.pw);
      jar = lg.hasAccess ? lg.jar : null; loginStatus = lg.status; loginOk = lg.hasAccess;
    }
    const res = await probe({ jar }, paths);
    const counts = {};
    for (const p of paths) { const s = res[p].s; counts[s] = (counts[s] || 0) + 1; }
    fs.writeFileSync(partFile, JSON.stringify({ name: d.name, role: d.role, company: d.company, loginOk, loginStatus, counts, res }));
    console.log(`[probe] ${d.name} (${d.role}): ${JSON.stringify(counts)}`);
  }

  // merge all parts -> matrix + summary
  const matrix = {};
  const summary = {};
  const principals = [];
  for (const d of descriptors) {
    const partFile = path.join(partsDir, d.name.replace(/[^\w.@-]/g, "_") + ".json");
    if (!fs.existsSync(partFile)) { console.log(`[merge] MISSING part for ${d.name} — rerun to complete`); continue; }
    const part = JSON.parse(fs.readFileSync(partFile, "utf8"));
    matrix[part.name] = part.res;
    summary[part.name] = { role: part.role, company: part.company, loginOk: part.loginOk, counts: part.counts };
    principals.push({ name: part.name, role: part.role, company: part.company, loginOk: part.loginOk, loginStatus: part.loginStatus });
  }

  // anomalies: any 5xx is a server-error candidate (blocker)
  const errors = [];
  for (const [name, res] of Object.entries(matrix)) {
    for (const [p, v] of Object.entries(res)) {
      if (v.s >= 500 || v.s === 0) errors.push({ principal: name, path: p, status: v.s, body: v.b || "" });
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, "rbac-read-matrix.json");
  fs.writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    base: BASE,
    endpointCount: paths.length,
    principals: principals.map((p) => ({ name: p.name, role: p.role, company: p.company, loginOk: p.loginOk ?? true, loginStatus: p.loginStatus })),
    seeded: seeded,
    summary,
    serverErrors: errors,
    matrix,
  }, null, 2));
  console.log(`\n[done] wrote ${outFile}`);
  console.log(`[errors] ${errors.length} server-error (5xx/0) responses across all principals`);
  if (errors.length) {
    const byPath = {};
    for (const e of errors) byPath[e.path] = (byPath[e.path] || 0) + 1;
    console.log("[errors] distinct error paths:", Object.keys(byPath).length);
    Object.entries(byPath).slice(0, 40).forEach(([p, n]) => console.log(`   ${n}x ${p}`));
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
