// Baseline API benchmark — measures p50/p95/p99 latency and throughput at a
// realistic, sustained traffic level (50 virtual users for 2 minutes).
// Compare results in `results/k6-baseline-<date>.json` vs. baseline targets
// declared in benchmarks/README.md §5.
//
//   k6 run --out json=benchmarks/results/k6-baseline.json benchmarks/api/k6-baseline.js
//
// Note: rate-limiting in api-server (express-rate-limit) may throttle us. In
// the test env raise the cap or set RATE_LIMIT_DISABLED=1 there.

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import { BASE_URL, login, authedHeaders } from "./_helpers.js";

const readLatency = new Trend("read_latency", true);
const writeLatency = new Trend("write_latency", true);
const errors = new Rate("biz_errors");
const tx = new Counter("biz_tx");

export const options = {
  scenarios: {
    baseline: {
      executor: "constant-vus",
      vus: 50,
      duration: "2m",
      gracefulStop: "10s",
    },
  },
  thresholds: {
    "http_req_failed{kind:read}": ["rate<0.01"],
    "http_req_failed{kind:write}": ["rate<0.02"],
    "read_latency": ["p(95)<200", "p(99)<400"],
    "write_latency": ["p(95)<400", "p(99)<800"],
    "biz_errors": ["rate<0.01"],
  },
};

export function setup() {
  return login();
}

const READ_PATHS = [
  "/auth/me",
  "/dashboard/summary",
  "/employees?limit=50",
  "/clients?limit=50",
  "/notifications?limit=20",
  "/tasks?limit=20",
  "/finance/invoices?limit=20",
  "/hr/attendance?limit=20",
];

export default function (session) {
  const headers = authedHeaders(session);

  group("reads", () => {
    const path = READ_PATHS[Math.floor(Math.random() * READ_PATHS.length)];
    const res = http.get(`${BASE_URL}${path}`, {
      headers,
      tags: { name: path.split("?")[0], kind: "read" },
    });
    readLatency.add(res.timings.duration);
    const ok = check(res, { "read 2xx": r => r.status >= 200 && r.status < 300 });
    errors.add(!ok);
    tx.add(1);
  });

  // Light write traffic — 1-in-10 ratio mimics realistic ERP usage where
  // most traffic is reads (dashboards, lists) and writes are occasional.
  if (Math.random() < 0.1) {
    group("writes", () => {
      const res = http.post(
        `${BASE_URL}/notifications/mark-read`,
        JSON.stringify({ ids: [] }),
        { headers, tags: { name: "/notifications/mark-read", kind: "write" } },
      );
      writeLatency.add(res.timings.duration);
      const ok = check(res, { "write 2xx": r => r.status >= 200 && r.status < 300 });
      errors.add(!ok);
      tx.add(1);
    });
  }

  sleep(Math.random() * 0.5);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data),
    "benchmarks/results/k6-baseline-summary.json": JSON.stringify(data, null, 2),
  };
}

// Minimal text summary so we don't pull in k6-summary lib (avoids vendoring).
function textSummary(data) {
  const m = data.metrics;
  const fmt = n => (typeof n === "number" ? n.toFixed(2) : String(n));
  return [
    "",
    "=== Ghayth ERP — Baseline API Benchmark ===",
    `iterations: ${m.iterations?.values?.count ?? "n/a"}`,
    `read p95:   ${fmt(m.read_latency?.values?.["p(95)"])} ms`,
    `read p99:   ${fmt(m.read_latency?.values?.["p(99)"])} ms`,
    `write p95:  ${fmt(m.write_latency?.values?.["p(95)"])} ms`,
    `write p99:  ${fmt(m.write_latency?.values?.["p(99)"])} ms`,
    `req/s:      ${fmt(m.http_reqs?.values?.rate)}`,
    `error rate: ${fmt((m.biz_errors?.values?.rate ?? 0) * 100)} %`,
    "",
  ].join("\n");
}
