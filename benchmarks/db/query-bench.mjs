#!/usr/bin/env node
// Workload-shaped query benchmark — exercises the kinds of SELECT/JOIN
// patterns that Ghayth ERP actually issues from rawdb.ts. Each query is run
// N times sequentially; we record p50/p95/p99 wall-clock latency.
//
// Usage:
//   DATABASE_URL=postgresql://... node benchmarks/db/query-bench.mjs
//
// The queries reference tables that DO exist (companies, employees, clients,
// notifications, audit_logs). If a table is absent the script reports it as
// "skipped" rather than failing — useful when running against a fresh schema.

import pg from "pg";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const ITERATIONS = Number(process.env.QUERY_ITERATIONS || 200);
const WARMUP = Number(process.env.QUERY_WARMUP || 20);

const QUERIES = [
  {
    name: "select_one_row",
    sql: "SELECT 1",
  },
  {
    name: "companies_list",
    sql: "SELECT id, name FROM companies LIMIT 50",
  },
  {
    name: "employees_paginated",
    sql: `
      SELECT id, first_name, last_name, email, status
      FROM employees
      ORDER BY created_at DESC NULLS LAST
      LIMIT 50 OFFSET 0
    `,
  },
  {
    name: "employees_by_company_join",
    sql: `
      SELECT e.id, e.first_name, e.last_name, c.name AS company
      FROM employees e
      LEFT JOIN companies c ON c.id = e.company_id
      ORDER BY e.id DESC
      LIMIT 100
    `,
  },
  {
    name: "clients_search_ilike",
    sql: `
      SELECT id, name, status
      FROM clients
      WHERE name ILIKE '%a%'
      ORDER BY id DESC
      LIMIT 50
    `,
  },
  {
    name: "notifications_for_user",
    sql: `
      SELECT id, title, body, created_at
      FROM notifications
      ORDER BY created_at DESC NULLS LAST
      LIMIT 20
    `,
  },
  {
    name: "audit_logs_recent",
    sql: `
      SELECT id, actor_id, action, entity_type, created_at
      FROM audit_logs
      ORDER BY created_at DESC NULLS LAST
      LIMIT 50
    `,
  },
  {
    name: "agg_count_by_status",
    sql: `
      SELECT status, COUNT(*)::int AS n
      FROM employees
      GROUP BY status
      ORDER BY n DESC
    `,
  },
];

function pct(sorted, p) {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

async function tableExists(pool, sql) {
  // Cheap probe: parse first FROM-target out of the SQL and check pg_class.
  const m = sql.match(/FROM\s+([a-z_][a-z0-9_]*)/i);
  if (!m) return true;
  const r = await pool.query("SELECT to_regclass($1) AS oid", [m[1]]);
  return r.rows[0].oid !== null;
}

async function timeQuery(pool, sql, iterations) {
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await pool.query(sql);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return {
    n: samples.length,
    p50_ms: pct(samples, 50),
    p95_ms: pct(samples, 95),
    p99_ms: pct(samples, 99),
    avg_ms: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  console.log(`Ghayth ERP — query benchmark (${ITERATIONS} iter, ${WARMUP} warmup)\n`);

  const rows = [];
  for (const q of QUERIES) {
    const exists = await tableExists(pool, q.sql).catch(() => true);
    if (!exists) {
      console.log(`✗ ${q.name}: skipped (table missing)`);
      rows.push({ query: q.name, status: "skipped" });
      continue;
    }
    try {
      // Warmup is important: first-run plan caching skews p50 dramatically.
      await timeQuery(pool, q.sql, WARMUP);
      const m = await timeQuery(pool, q.sql, ITERATIONS);
      const fmt = n => n.toFixed(2);
      console.log(
        `✓ ${q.name.padEnd(28)} avg=${fmt(m.avg_ms)}ms p50=${fmt(m.p50_ms)}ms p95=${fmt(m.p95_ms)}ms p99=${fmt(m.p99_ms)}ms`,
      );
      rows.push({ query: q.name, status: "ok", ...m });
    } catch (err) {
      console.log(`✗ ${q.name}: ${err.message}`);
      rows.push({ query: q.name, status: "error", error: err.message });
    }
  }

  await pool.end();

  const out = path.resolve("benchmarks/results", `query-bench-${Date.now()}.json`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ iterations: ITERATIONS, rows }, null, 2));
  console.log(`\nResults: ${out}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
