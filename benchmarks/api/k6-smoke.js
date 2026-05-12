// Smoke test — minimal traffic to verify endpoints work and the test rig is
// wired up correctly. Run BEFORE any heavier test.
//
//   k6 run benchmarks/api/k6-smoke.js
//
// Goal: confirm /healthz, /auth/login and a handful of read endpoints respond
// 2xx with reasonable latency. Failures here mean the env, not the system,
// is the problem.

import http from "k6/http";
import { check, sleep, group } from "k6";
import { BASE_URL, login, authedHeaders } from "./_helpers.js";

export const options = {
  vus: 1,
  iterations: 5,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

export function setup() {
  // Anonymous health probe — no auth needed.
  const h = http.get(`${BASE_URL}/healthz`);
  check(h, { "healthz 200": r => r.status === 200 });
  return login();
}

export default function (session) {
  const headers = authedHeaders(session);

  group("read endpoints", () => {
    const endpoints = [
      "/auth/me",
      "/dashboard/summary",
      "/employees?limit=20",
      "/clients?limit=20",
      "/notifications?limit=10",
    ];
    for (const path of endpoints) {
      const res = http.get(`${BASE_URL}${path}`, { headers, tags: { name: path.split("?")[0] } });
      check(res, {
        [`${path} status 2xx`]: r => r.status >= 200 && r.status < 300,
      });
    }
  });

  sleep(0.5);
}
