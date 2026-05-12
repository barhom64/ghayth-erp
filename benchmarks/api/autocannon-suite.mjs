#!/usr/bin/env node
// Autocannon micro-benchmark suite — runs short bursts against a fixed list
// of endpoints and prints a per-endpoint p50/p95/p99 + RPS table. Cheaper to
// run than k6 (no separate binary) and good for quick CI smoke checks.
//
// Usage:
//   node benchmarks/api/autocannon-suite.mjs
//
// Honors env: API_BASE_URL, BENCH_USER_EMAIL, BENCH_USER_PASSWORD.

import autocannon from "autocannon";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:5000";
const EMAIL = process.env.BENCH_USER_EMAIL || "bench@example.com";
const PASSWORD = process.env.BENCH_USER_PASSWORD || "ChangeMe123!";

const DURATION = Number(process.env.BENCH_DURATION || 15); // seconds per endpoint
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS || 25);

async function loginAndGetAuth() {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }
  const cookieHeader = res.headers.get("set-cookie") || "";
  const body = await res.json().catch(() => ({}));
  return {
    cookie: cookieHeader.split(";")[0] || null,
    token: body.accessToken || body.token || null,
  };
}

function buildHeaders(auth) {
  const h = { "Content-Type": "application/json" };
  if (auth.token) h["Authorization"] = `Bearer ${auth.token}`;
  if (auth.cookie) h["Cookie"] = auth.cookie;
  return h;
}

const ENDPOINTS = [
  { name: "healthz",                method: "GET",  path: "/healthz",                  auth: false },
  { name: "auth.me",                method: "GET",  path: "/auth/me",                  auth: true  },
  { name: "dashboard.summary",      method: "GET",  path: "/dashboard/summary",        auth: true  },
  { name: "employees.list",         method: "GET",  path: "/employees?limit=50",       auth: true  },
  { name: "clients.list",           method: "GET",  path: "/clients?limit=50",         auth: true  },
  { name: "notifications.list",     method: "GET",  path: "/notifications?limit=20",   auth: true  },
  { name: "tasks.list",             method: "GET",  path: "/tasks?limit=20",           auth: true  },
  { name: "finance.invoices.list",  method: "GET",  path: "/finance/invoices?limit=20", auth: true },
];

function runOne(endpoint, auth) {
  return new Promise((resolve, reject) => {
    const inst = autocannon(
      {
        url: `${BASE_URL}${endpoint.path}`,
        method: endpoint.method,
        connections: CONNECTIONS,
        duration: DURATION,
        headers: endpoint.auth ? buildHeaders(auth) : { "Content-Type": "application/json" },
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    autocannon.track(inst, { renderProgressBar: false, renderResultsTable: false });
  });
}

function row(name, r) {
  const lat = r.latency || {};
  const req = r.requests || {};
  return {
    endpoint: name,
    p50_ms: lat.p50,
    p95_ms: lat.p97_5 ?? lat.p99 ?? lat.p95,
    p99_ms: lat.p99,
    rps_avg: req.average,
    "2xx": r["2xx"],
    non2xx: r.non2xx,
    errors: r.errors,
    timeouts: r.timeouts,
  };
}

async function main() {
  console.log(`Ghayth ERP — autocannon suite`);
  console.log(`base url: ${BASE_URL}`);
  console.log(`per endpoint: ${CONNECTIONS} connections × ${DURATION}s\n`);

  const auth = await loginAndGetAuth();
  const rows = [];

  for (const ep of ENDPOINTS) {
    process.stdout.write(`▶ ${ep.method} ${ep.path} … `);
    const r = await runOne(ep, auth);
    const summary = row(ep.name, r);
    rows.push(summary);
    console.log(`p95 ${summary.p95_ms} ms · ${Math.round(summary.rps_avg)} rps · ${summary.non2xx} non-2xx`);
  }

  console.table(rows);

  const out = path.resolve("benchmarks/results", `autocannon-${Date.now()}.json`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ baseUrl: BASE_URL, connections: CONNECTIONS, duration: DURATION, rows }, null, 2));
  console.log(`\nResults: ${out}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
