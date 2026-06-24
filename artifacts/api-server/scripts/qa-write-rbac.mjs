// Ghaith Exhaustive System Test — write-path RBAC probe (Phase 2-6 sample).
// Seeds a disposable employee-role user in company 1, then verifies server-side
// write authorization: a privileged write is rejected (403) while logging the
// raw status of an ordinary write. Empirical only — records exactly what the
// server returned. Teardown: qa-rbac-matrix.mjs --teardown removes qa.*@qa.test.
//   node scripts/qa-write-rbac.mjs
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;
const BASE = process.env.QA_BASE || "http://localhost:80";
const PW = "Qa!23456";
const HASH = bcrypt.hashSync(PW, 10);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseCookies(arr) {
  const jar = {};
  for (const c of arr || []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return jar;
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

async function seedEmployee(companyId, roleKey) {
  const roles = await q(`SELECT id FROM rbac_roles WHERE "companyId"=$1 AND role_key=$2 LIMIT 1`, [companyId, roleKey]);
  if (!roles.length) throw new Error(`no rbac_role ${roleKey}`);
  const roleId = roles[0].id;
  const br = await q(`SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id LIMIT 1`, [companyId]);
  const branchId = br[0].id;
  const email = `qa.${roleKey}.c${companyId}@qa.test`;
  let u = await q(`SELECT id,"employeeId" FROM users WHERE email=$1`, [email]);
  let userId, employeeId;
  if (u.length) {
    userId = u[0].id; employeeId = u[0].employeeId;
    await q(`UPDATE users SET "passwordHash"=$2, role=$3, "isActive"=true WHERE id=$1`, [userId, HASH, roleKey]);
  } else {
    const emp = await q(`INSERT INTO employees (name,"companyId","branchId",status,email) VALUES ($1,$2,$3,'active',$4) RETURNING id`,
      [`QA ${roleKey} C${companyId}`, companyId, branchId, email]);
    employeeId = emp[0].id;
    const usr = await q(`INSERT INTO users (email,"passwordHash","employeeId",role,"isActive") VALUES ($1,$2,$3,$4,true) RETURNING id`,
      [email, HASH, employeeId, roleKey]);
    userId = usr[0].id;
  }
  const asg = await q(`SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2`, [employeeId, companyId]);
  if (!asg.length) {
    await q(`INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,status,"isPrimary") VALUES ($1,$2,$3,$4,$5,'active',true)`,
      [employeeId, companyId, branchId, `QA ${roleKey}`, roleKey]);
  } else {
    await q(`UPDATE employee_assignments SET status='active', role=$2 WHERE id=$1`, [asg[0].id, roleKey]);
  }
  const ur = await q(`SELECT id FROM rbac_user_roles WHERE "userId"=$1 AND role_id=$2`, [userId, roleId]);
  if (!ur.length) {
    await q(`INSERT INTO rbac_user_roles ("userId","companyId",role_id,"branchId",is_primary) VALUES ($1,$2,$3,$4,true)`,
      [userId, companyId, roleId, branchId]);
  }
  return { email, userId, employeeId };
}

async function login(email) {
  for (let a = 0; a < 5; a++) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-E2E-Test": "1" },
      body: JSON.stringify({ email, password: PW }),
    });
    if (res.status === 403 || res.status === 429) { await sleep(2500); continue; }
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    return { status: res.status, jar: parseCookies(set) };
  }
  return { status: 0, jar: {} };
}

async function write(method, path, jar, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-E2E-Test": "1",
      "X-CSRF-Token": jar.erp_csrf || "",
      Cookie: cookieHeader(jar),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let txt = await res.text();
  return { status: res.status, body: txt.slice(0, 160) };
}

async function main() {
  const seeded = await seedEmployee(1, "employee");
  console.log("seeded:", seeded.email, "userId=" + seeded.userId);
  const { status: ls, jar } = await login(seeded.email);
  console.log("login status:", ls, "hasAccess:", !!jar.erp_access);
  if (!jar.erp_access) { console.log("LOGIN FAILED — aborting"); await pool.end(); return; }

  // Privileged writes an ordinary employee must NOT be able to perform (expect 403):
  const privileged = [
    ["POST", "/api/settings/companies", { name: "QA Co" }],
    ["POST", "/api/admin/users", { email: "x@x.test" }],
    ["POST", "/api/finance/journal-entries", { date: "2026-06-18", lines: [] }],
    ["POST", "/api/hr/recruitment/postings", { title: "QA" }],
  ];
  console.log("\n=== employee → privileged writes (expect 403) ===");
  for (const [m, p, b] of privileged) {
    const r = await write(m, p, jar, b);
    console.log(`${r.status}  ${m} ${p} :: ${r.body}`);
  }
  await pool.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
