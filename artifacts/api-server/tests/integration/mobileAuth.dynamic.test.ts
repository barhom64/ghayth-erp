// Mobile (Bearer-token) auth — dynamic harness.
//
// Proves the two-transport contract introduced for native/mobile clients:
//   1. Web cookie login is UNCHANGED — POST /api/auth/login still sets the
//      erp_access + erp_refresh HttpOnly cookies and returns
//      { assignments, userRoles } with NO tokens in the body.
//   2. Mobile login (POST /api/auth/mobile/login) returns the access +
//      refresh tokens in the JSON body, sets NO cookies, and the access
//      token works as a Bearer credential on a protected route.
//   3. Mobile refresh (POST /api/auth/mobile/refresh) rotates the refresh
//      token and issues a fresh, working access token.
//   4. Bad credentials are rejected (403) on the mobile endpoint.
//
// Activation mirrors tenantIsolation.dynamic.test.ts: every scenario is
// gated on `dbReady`, so it skips cleanly when no disposable test Postgres
// is wired up (dev boxes / docker-less CI) and flips on automatically when
// DATABASE_URL points at the test DB and JWT_SECRET is set.
//
// To run locally:
//
//   docker compose -f tests/integration/postgres/docker-compose.yml up -d
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=test-secret-with-at-least-thirty-two-characters-aaaaaaaaaaaaa
//   bash db/bootstrap.sh
//   pnpm --filter @workspace/api-server test tests/integration/mobileAuth.dynamic.test.ts

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

// Helper: collapse a supertest Set-Cookie header (string | string[] | undefined)
// into a single string so we can assert on cookie names regardless of shape.
function cookieHeader(res: any): string {
  const raw = res.headers["set-cookie"];
  if (!raw) return "";
  return Array.isArray(raw) ? raw.join("; ") : String(raw);
}

// Helper: normalise a Set-Cookie response into the `name=value` pairs a client
// would echo back on the next request (drops the attribute segments).
function cookiePairs(res: any): string[] {
  const raw = res.headers["set-cookie"];
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [String(raw)];
  return arr.map((c) => String(c).split(";")[0]);
}

d("Mobile auth — dynamic (real Postgres)", () => {
  // Late-bound to keep the file loadable when the env isn't set up.
  let app: any;
  let request: any;
  let fx: any;
  let email: string;
  const password = "test-password-1234";

  beforeAll(async () => {
    request = (await import("supertest")).default;
    const appModule = await import("../../src/app.js");
    app = appModule.default;
    const { setupTwoCompanyFixture } = await import("./_fixtures/twoCompanies.js");
    fx = await setupTwoCompanyFixture();
    // The fixture seeds users with email `owner-<companyId>@test.local`.
    email = `owner-${fx.companyA.id}@test.local`;
  });

  // ── (1) Web login is untouched: cookies set, no body tokens ──
  it("web /login still sets HttpOnly cookies and returns {assignments,userRoles} with no body tokens", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password });

    expect(res.status).toBe(200);

    const cookies = cookieHeader(res);
    expect(cookies).toContain("erp_access");
    expect(cookies).toContain("erp_refresh");
    // Session cookies MUST stay HttpOnly so browser JS can never read the JWT.
    expect(cookies).toContain("HttpOnly");

    // Web contract: tokens live ONLY in cookies, never the JSON body.
    expect(res.body).toHaveProperty("assignments");
    expect(res.body).toHaveProperty("userRoles");
    expect(res.body).not.toHaveProperty("accessToken");
    expect(res.body).not.toHaveProperty("refreshToken");
    expect(res.body).not.toHaveProperty("token");
    expect(Array.isArray(res.body.assignments)).toBe(true);
    expect(res.body.assignments.length).toBeGreaterThan(0);
  });

  // ── (1b) Web refresh is untouched: rotates cookies, body is {success} ──
  it("web /refresh still rotates HttpOnly cookies and returns {success:true} with no body tokens", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password });
    expect(login.status).toBe(200);

    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookiePairs(login));
    expect(refreshed.status).toBe(200);

    // Web contract: refresh re-issues BOTH session cookies, HttpOnly.
    const cookies = cookieHeader(refreshed);
    expect(cookies).toContain("erp_access");
    expect(cookies).toContain("erp_refresh");
    expect(cookies).toContain("HttpOnly");

    // Body stays the legacy { success: true } — never any tokens.
    expect(refreshed.body).toEqual({ success: true });
    expect(refreshed.body).not.toHaveProperty("accessToken");
    expect(refreshed.body).not.toHaveProperty("refreshToken");
  });

  // ── (2) Mobile login: body tokens, no cookies, Bearer works ──
  it("mobile /mobile/login returns body tokens (no cookies) usable as Bearer on /auth/me", async () => {
    const res = await request(app)
      .post("/api/auth/mobile/login")
      .send({ email, password });

    expect(res.status).toBe(200);

    // Mobile contract: tokens in the body, NOT in cookies.
    expect(cookieHeader(res)).toBe("");
    expect(res.body.tokenType).toBe("Bearer");
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.accessToken.length).toBeGreaterThan(0);
    expect(typeof res.body.refreshToken).toBe("string");
    expect(res.body.refreshToken.length).toBeGreaterThan(0);
    expect(res.body.accessTokenExpiresIn).toBe(900);
    expect(res.body.refreshTokenExpiresIn).toBe(7 * 24 * 60 * 60);
    // Same scope payload as web login.
    expect(Array.isArray(res.body.assignments)).toBe(true);
    expect(res.body.assignments.length).toBeGreaterThan(0);
    expect(res.body).toHaveProperty("userRoles");

    // The access token must authenticate a protected route exactly like
    // the cookie flow — proving identical RBAC/scope reconstruction.
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.companyName).toBeTruthy();
  });

  // ── (3) Mobile refresh: rotates token, new access token works ──
  it("mobile /mobile/refresh issues a new working access token", async () => {
    const login = await request(app)
      .post("/api/auth/mobile/login")
      .send({ email, password });
    expect(login.status).toBe(200);
    const firstRefresh = login.body.refreshToken;

    const refreshed = await request(app)
      .post("/api/auth/mobile/refresh")
      .send({ refreshToken: firstRefresh });

    expect(refreshed.status).toBe(200);
    expect(cookieHeader(refreshed)).toBe("");
    expect(refreshed.body.tokenType).toBe("Bearer");
    expect(typeof refreshed.body.accessToken).toBe("string");
    expect(typeof refreshed.body.refreshToken).toBe("string");
    // Rotation: the new refresh token must differ from the one we sent.
    expect(refreshed.body.refreshToken).not.toBe(firstRefresh);

    // The freshly issued access token authenticates a protected route.
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`);
    expect(me.status).toBe(200);

    // Reuse detection: replaying the now-rotated refresh token is rejected.
    const replay = await request(app)
      .post("/api/auth/mobile/refresh")
      .send({ refreshToken: firstRefresh });
    expect(replay.status).toBe(403);
  });

  // ── (4) Bad credentials rejected on the mobile endpoint ──
  it("mobile /mobile/login rejects a wrong password with 403", async () => {
    const res = await request(app)
      .post("/api/auth/mobile/login")
      .send({ email, password: "definitely-wrong-password" });
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty("accessToken");
  });
});
