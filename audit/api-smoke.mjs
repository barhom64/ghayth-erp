#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.API_BASE || "http://localhost:8080";
const EMAIL = process.env.ADMIN_EMAIL || "admin@ghayth.com";
const PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123456";

const inv = JSON.parse(readFileSync("audit/inventory.json", "utf8"));

console.log(`🔐 Logging in as ${EMAIL}...`);
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) {
  console.error(`Login failed: ${loginRes.status}`);
  process.exit(1);
}
const setCookie = loginRes.headers.getSetCookie?.() || [loginRes.headers.get("set-cookie")].filter(Boolean);
const cookieHeader = setCookie.map(c => c.split(";")[0]).join("; ");
console.log(`✅ Cookie set (${setCookie.length} cookies)`);

const allEndpoints = [];
for (const [file, eps] of Object.entries(inv.api.byFile)) {
  for (const ep of eps) {
    if (ep.method !== "GET") continue;
    let p = ep.fullPath || `/api${ep.path}`;
    if (p.includes(":")) p = p.replace(/:[a-zA-Z]+/g, "1");
    allEndpoints.push({ file, method: ep.method, original: ep.path, mount: ep.mount, testPath: p });
  }
}

console.log(`🧪 Testing ${allEndpoints.length} GET endpoints...\n`);

const results = { ok: [], notFound: [], serverError: [], forbidden: [], unauthorized: [], other: [] };
let i = 0;
const CONCURRENCY = 12;

async function worker(queue) {
  while (queue.length > 0) {
    const ep = queue.shift();
    if (!ep) break;
    i++;
    try {
      const r = await fetch(`${BASE}${ep.testPath}`, {
        headers: { Cookie: cookieHeader },
        signal: AbortSignal.timeout(15000),
        redirect: "manual",
      });
      const entry = { ...ep, status: r.status };
      if (r.status >= 500) {
        let body = "";
        try { body = (await r.text()).slice(0, 600); } catch {}
        entry.body = body;
        results.serverError.push(entry);
        console.log(`❌ ${r.status} ${ep.method} ${ep.testPath} (${ep.file}) :: ${body.slice(0, 120)}`);
      } else if (r.status === 404) {
        results.notFound.push(entry);
      } else if (r.status === 403) {
        results.forbidden.push(entry);
      } else if (r.status === 401) {
        results.unauthorized.push(entry);
      } else if (r.status >= 200 && r.status < 400) {
        results.ok.push(entry);
      } else {
        results.other.push(entry);
      }
    } catch (e) {
      results.serverError.push({ ...ep, error: e.message });
      console.log(`💥 ${ep.method} ${ep.testPath} → ${e.message}`);
    }
    if (i % 50 === 0) console.log(`  progress ${i}/${allEndpoints.length}...`);
  }
}

const queue = [...allEndpoints];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

console.log(`\n📊 RESULTS:`);
console.log(`  ✅ OK (2xx/3xx):    ${results.ok.length}`);
console.log(`  🔒 401 Unauth:      ${results.unauthorized.length}`);
console.log(`  🚫 403 Forbidden:   ${results.forbidden.length}`);
console.log(`  ⚠️  404 Not Found:  ${results.notFound.length}`);
console.log(`  ❌ 5xx Server Err:  ${results.serverError.length}`);
console.log(`  ❓ Other (4xx):     ${results.other.length}`);

const summary = {
  testedAt: new Date().toISOString(),
  total: allEndpoints.length,
  counts: {
    ok: results.ok.length,
    unauthorized: results.unauthorized.length,
    forbidden: results.forbidden.length,
    notFound: results.notFound.length,
    serverError: results.serverError.length,
    other: results.other.length,
  },
  serverErrors: results.serverError,
  notFoundSamples: results.notFound.slice(0, 30),
  otherSamples: results.other.slice(0, 30),
};
writeFileSync("audit/api-smoke-results.json", JSON.stringify(summary, null, 2));

if (results.serverError.length > 0) {
  const errsByFile = {};
  for (const e of results.serverError) errsByFile[e.file] = (errsByFile[e.file] || 0) + 1;
  console.log(`\n💥 Server errors by file:`);
  for (const [f, c] of Object.entries(errsByFile).sort((a,b)=>b[1]-a[1])) {
    console.log(`   ${c}× ${f}`);
  }
}

console.log(`\n📁 Saved → audit/api-smoke-results.json`);
process.exit(0);
