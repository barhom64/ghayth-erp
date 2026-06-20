/**
 * CSRF middleware — Bearer (native app) exemption. The Capacitor app
 * authenticates with `Authorization: Bearer` and carries NO cookies, so the
 * cookie-pair CSRF check would 403 every write. Bearer auth isn't a CSRF
 * vector (the browser never auto-attaches an Authorization header), so the
 * middleware must call next() for a pure-Bearer write — while still rejecting
 * a cookie-auth write that lacks the token.
 */
import { describe, it, expect, vi } from "vitest";
import { csrfMiddleware } from "../../src/middlewares/csrfMiddleware.js";

function run(req: any) {
  const res: any = {
    statusCode: 0,
    body: null,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
    cookie() { return this; },
  };
  const next = vi.fn();
  csrfMiddleware(req as any, res as any, next as any);
  return { res, next };
}

describe("csrfMiddleware — Bearer exemption", () => {
  it("a pure-Bearer POST (no cookies) passes — native app writes work", () => {
    const { res, next } = run({
      method: "POST", baseUrl: "/api", path: "/hr/leave-requests",
      headers: { authorization: "Bearer abc.def.ghi" }, cookies: {},
    });
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it("a cookie-auth POST without a CSRF token is still REJECTED (web stays protected)", () => {
    const { res, next } = run({
      method: "POST", baseUrl: "/api", path: "/hr/leave-requests",
      headers: {}, cookies: { erp_access: "jwt" },
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body?.code).toBe("CSRF_INVALID");
  });

  it("a request carrying BOTH a Bearer header AND an auth cookie still needs CSRF (cookie path wins)", () => {
    const { next } = run({
      method: "POST", baseUrl: "/api", path: "/hr/leave-requests",
      headers: { authorization: "Bearer abc", "x-csrf-token": "t" },
      cookies: { erp_access: "jwt", erp_csrf: "t" },
    });
    expect(next).toHaveBeenCalledOnce(); // tokens match → passes via the normal path
  });

  it("GET is always safe regardless of auth", () => {
    const { next } = run({ method: "GET", baseUrl: "/api", path: "/hr/employees", headers: {}, cookies: {} });
    expect(next).toHaveBeenCalledOnce();
  });
});
