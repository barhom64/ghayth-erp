// Ramp-up load test — gradually increases concurrent users from 0 to 500
// over 10 min, then ramps down. Goal: find the point where p95 latency or
// error rate breach SLO and identify the practical capacity.
//
//   k6 run --out json=benchmarks/results/k6-ramp.json benchmarks/load/k6-ramp.js
//
// Reproducibility note: run on a quiet machine with no other heavy
// processes. Results vary 20-30% between cold and warm DB caches.

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";
import { BASE_URL, login, authedHeaders } from "../api/_helpers.js";

const latency = new Trend("latency_all", true);
const errs = new Rate("errs_all");

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 50 },
        { duration: "2m", target: 150 },
        { duration: "3m", target: 300 },
        { duration: "2m", target: 500 },
        { duration: "1m", target: 500 }, // hold at peak
        { duration: "1m", target: 0 },   // ramp down
      ],
      gracefulRampDown: "20s",
    },
  },
  thresholds: {
    "latency_all": ["p(95)<800"],
    "errs_all": ["rate<0.05"],
  },
};

export function setup() {
  return login();
}

const PATHS = [
  "/dashboard/summary",
  "/employees?limit=50",
  "/clients?limit=50",
  "/notifications?limit=20",
  "/tasks?limit=20",
];

export default function (session) {
  const headers = authedHeaders(session);
  const path = PATHS[Math.floor(Math.random() * PATHS.length)];
  const res = http.get(`${BASE_URL}${path}`, { headers, tags: { name: path.split("?")[0] } });
  latency.add(res.timings.duration);
  const ok = check(res, { "2xx": r => r.status >= 200 && r.status < 300 });
  errs.add(!ok);
  sleep(Math.random() * 0.3);
}
