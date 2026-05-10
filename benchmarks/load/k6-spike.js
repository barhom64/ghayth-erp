// Spike test — sudden burst from 10 → 800 VUs in 30s, hold for 1m, then drop
// back. Goal: see whether the system survives a flash crowd (e.g. payroll
// run kicking off at 9 AM Sunday, all branches hitting the dashboard at the
// same time) and how fast it recovers.
//
//   k6 run --out json=benchmarks/results/k6-spike.json benchmarks/load/k6-spike.js

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";
import { BASE_URL, login, authedHeaders } from "../api/_helpers.js";

const latency = new Trend("spike_latency", true);
const errs = new Rate("spike_errs");

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-vus",
      startVUs: 10,
      stages: [
        { duration: "30s", target: 800 }, // sharp ramp up
        { duration: "1m",  target: 800 }, // hold the spike
        { duration: "30s", target: 10 },  // drop back
        { duration: "1m",  target: 10 },  // observe recovery
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    // During spike, allow degraded latency but error rate must stay bounded.
    "spike_errs": ["rate<0.10"],
    "http_req_failed": ["rate<0.10"],
  },
};

export function setup() {
  return login();
}

export default function (session) {
  const headers = authedHeaders(session);
  const res = http.get(`${BASE_URL}/dashboard/summary`, {
    headers,
    tags: { name: "/dashboard/summary" },
  });
  latency.add(res.timings.duration);
  const ok = check(res, { "2xx": r => r.status >= 200 && r.status < 300 });
  errs.add(!ok);
  sleep(0.2);
}
