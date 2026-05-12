import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const CSRF_SRC = readFileSync(resolve(__dirname, "../../src/middlewares/csrfMiddleware.ts"), "utf-8");
const AUTH_SRC = readFileSync(resolve(__dirname, "../../src/routes/auth.ts"), "utf-8");
const INDEX_SRC = readFileSync(resolve(__dirname, "../../src/routes/index.ts"), "utf-8");
const API_SRC = readFileSync(resolve(__dirname, "../../../ghayth-erp/src/lib/api.ts"), "utf-8");

describe("CSRF middleware — defense-in-depth layer", () => {
  it("middleware file exports csrfMiddleware and setCsrfCookie", () => {
    expect(CSRF_SRC).toContain("export function csrfMiddleware");
    expect(CSRF_SRC).toContain("export function setCsrfCookie");
  });

  it("uses double-submit cookie pattern (non-httpOnly cookie vs header)", () => {
    expect(CSRF_SRC).toContain("httpOnly: false");
    expect(CSRF_SRC).toContain('x-csrf-token');
  });

  it("skips safe HTTP methods (GET, HEAD, OPTIONS)", () => {
    expect(CSRF_SRC).toContain('"GET"');
    expect(CSRF_SRC).toContain('"HEAD"');
    expect(CSRF_SRC).toContain('"OPTIONS"');
  });

  it("exempts login, register, refresh, and public endpoints", () => {
    expect(CSRF_SRC).toContain("/api/auth/login");
    expect(CSRF_SRC).toContain("/api/auth/register");
    expect(CSRF_SRC).toContain("/api/auth/refresh");
    expect(CSRF_SRC).toContain("/api/public/");
  });

  it("returns 403 with CSRF_INVALID code on mismatch", () => {
    expect(CSRF_SRC).toContain("CSRF_INVALID");
    expect(CSRF_SRC).toContain("403");
  });

  it("uses crypto.randomBytes for token generation", () => {
    expect(CSRF_SRC).toContain("crypto.randomBytes");
  });

  it("cookie uses sameSite strict + secure in production", () => {
    expect(CSRF_SRC).toContain('sameSite: "strict"');
    expect(CSRF_SRC).toContain("secure: isProduction");
  });
});

describe("CSRF integration wiring", () => {
  it("auth.ts sets CSRF cookie on login", () => {
    expect(AUTH_SRC).toContain("setCsrfCookie");
    const loginIdx = AUTH_SRC.indexOf('"/login"');
    const loginEnd = AUTH_SRC.indexOf('"/refresh"');
    const loginSection = AUTH_SRC.slice(loginIdx, loginEnd);
    expect(loginSection).toContain("setCsrfCookie");
  });

  it("auth.ts sets CSRF cookie on token refresh", () => {
    const refreshIdx = AUTH_SRC.indexOf('"/refresh"');
    const refreshEnd = AUTH_SRC.indexOf('"/logout"');
    const refreshSection = AUTH_SRC.slice(refreshIdx, refreshEnd);
    expect(refreshSection).toContain("setCsrfCookie");
  });

  it("routes/index.ts mounts csrfMiddleware after authMiddleware", () => {
    const authIdx = INDEX_SRC.indexOf("router.use(authMiddleware)");
    const csrfIdx = INDEX_SRC.indexOf("router.use(csrfMiddleware)");
    expect(authIdx).toBeGreaterThan(-1);
    expect(csrfIdx).toBeGreaterThan(-1);
    expect(csrfIdx).toBeGreaterThan(authIdx);
  });

  it("frontend apiFetch sends x-csrf-token header on mutations", () => {
    expect(API_SRC).toContain("x-csrf-token");
    expect(API_SRC).toContain("getCsrfToken");
    expect(API_SRC).toContain("erp_csrf");
  });
});
