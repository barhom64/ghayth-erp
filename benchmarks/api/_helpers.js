// Shared helpers for k6 scripts.
// k6 runs in its own JS runtime — no Node APIs available, only ESM imports
// from k6/* and __ENV.* for environment variables.

import http from "k6/http";
import { check, fail } from "k6";

export const BASE_URL = __ENV.API_BASE_URL || "http://localhost:5000";
export const EMAIL = __ENV.BENCH_USER_EMAIL || "bench@example.com";
export const PASSWORD = __ENV.BENCH_USER_PASSWORD || "ChangeMe123!";

export function login() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "auth/login" } },
  );
  const ok = check(res, {
    "login 200": r => r.status === 200,
    "has token cookie or body": r =>
      r.cookies?.access_token || (r.json() && r.json().accessToken),
  });
  if (!ok) {
    fail(`login failed: ${res.status} ${res.body?.slice?.(0, 200)}`);
  }
  // Backend may use httpOnly cookie OR JSON token — handle both.
  const body = res.json() || {};
  return {
    token: body.accessToken || body.token || null,
    cookies: res.cookies || {},
  };
}

export function authedHeaders(session) {
  const h = { "Content-Type": "application/json" };
  if (session.token) h["Authorization"] = `Bearer ${session.token}`;
  return h;
}
