// Soak test — 100 concurrent users for 30 minutes. Goal: catch memory leaks,
// connection-pool exhaustion, slow GC pauses, and any issues that only show
// up after sustained traffic.
//
//   k6 run --out json=benchmarks/results/k6-soak.json benchmarks/load/k6-soak.js
//
// What to watch DURING the run (not just at end):
//   * Node process RSS — should plateau, not grow.
//   * pg pool wait time — should stay near 0.
//   * latency p95 — should be flat across the 30 min window.

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";
import { BASE_URL, login, authedHeaders } from "../api/_helpers.js";

const latency = new Trend("soak_latency", true);
const errs = new Rate("soak_errs");

export const options = {
  scenarios: {
    soak: {
      executor: "constant-vus",
      vus: 100,
      duration: "30m",
    },
  },
  thresholds: {
    "soak_latency": ["p(95)<400"],
    "soak_errs": ["rate<0.01"],
  },
};

export function setup() {
  return login();
}

const READS = [
  "/dashboard/summary",
  "/employees?limit=50",
  "/clients?limit=50",
  "/notifications?limit=20",
  "/tasks?limit=20",
  "/finance/invoices?limit=20",
];

export default function (session) {
  const headers = authedHeaders(session);
  const path = READS[Math.floor(Math.random() * READS.length)];
  const res = http.get(`${BASE_URL}${path}`, { headers, tags: { name: path.split("?")[0] } });
  latency.add(res.timings.duration);
  const ok = check(res, { "2xx": r => r.status >= 200 && r.status < 300 });
  errs.add(!ok);
  sleep(0.5 + Math.random()); // ~1.5s think time
}
