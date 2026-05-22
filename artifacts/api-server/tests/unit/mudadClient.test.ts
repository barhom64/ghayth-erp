import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildMudadUrl,
  mudadBaseUrl,
  MUDAD_SALARY_PATH,
  MUDAD_LEAVE_UNPAID_PATH,
  MUDAD_TERMINATION_PATH,
  MUDAD_STATUS_PATH,
  MUDAD_TOKEN_PATH,
} from "../../src/lib/saudi-compliance/mudad/endpoints.js";
import {
  parseTokenResponse,
  bearerHeader,
  getMudadAccessToken,
  clearMudadTokenCache,
  type CachedToken,
} from "../../src/lib/saudi-compliance/mudad/auth.js";
import { parseMudadResponse } from "../../src/lib/saudi-compliance/mudad/client.js";

// Spec-default Mudad sandbox host (no env override) — see mudad/endpoints.ts.
const DEFAULT_SANDBOX = "https://api-sandbox.mudad.com.sa";

describe("Mudad endpoints — URL building", () => {
  it("returns sandbox vs production base URLs", () => {
    expect(mudadBaseUrl("sandbox")).toMatch(/^https:\/\/[^/]+/);
    expect(mudadBaseUrl("production")).toMatch(/^https:\/\/[^/]+/);
  });

  it("env vars override the spec defaults per environment", async () => {
    // The override is resolved in lib/config.ts at module-load time, so
    // the env vars must be stubbed before the graph is re-imported.
    vi.stubEnv("MUDAD_SANDBOX_URL", "https://sb.example.test/");
    vi.stubEnv("MUDAD_PROD_URL", "https://prod.example.test");
    vi.resetModules();
    const endpoints = await import("../../src/lib/saudi-compliance/mudad/endpoints.js");
    expect(endpoints.mudadBaseUrl("sandbox")).toBe("https://sb.example.test");
    expect(endpoints.mudadBaseUrl("production")).toBe("https://prod.example.test");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("buildMudadUrl joins base + spec-fixed paths correctly", () => {
    expect(buildMudadUrl("sandbox", MUDAD_TOKEN_PATH)).toBe(`${DEFAULT_SANDBOX}/oauth2/token`);
    expect(buildMudadUrl("sandbox", MUDAD_SALARY_PATH)).toContain("/payroll/salary");
    expect(buildMudadUrl("sandbox", MUDAD_LEAVE_UNPAID_PATH)).toContain("/leave/unpaid");
    expect(buildMudadUrl("sandbox", MUDAD_TERMINATION_PATH)).toContain("/contract/termination");
    expect(buildMudadUrl("sandbox", MUDAD_STATUS_PATH)).toContain("/status");
  });

  it("handles paths with or without a leading slash", () => {
    expect(buildMudadUrl("sandbox", "foo/bar")).toBe(`${DEFAULT_SANDBOX}/foo/bar`);
    expect(buildMudadUrl("sandbox", "/foo/bar")).toBe(`${DEFAULT_SANDBOX}/foo/bar`);
  });
});

describe("Mudad auth — token parser", () => {
  it("parses a well-formed token response into the cache shape", () => {
    const json = JSON.stringify({ access_token: "ABC123", expires_in: 3600, token_type: "Bearer" });
    const token = parseTokenResponse(json);
    expect(token.accessToken).toBe("ABC123");
    expect(token.expiresAt).toBeGreaterThan(Date.now());
    expect(token.expiresAt - Date.now()).toBeGreaterThan(3500_000); // ~3600s
    expect(token.expiresAt - Date.now()).toBeLessThan(3700_000);
  });

  it("throws on missing access_token", () => {
    expect(() => parseTokenResponse(JSON.stringify({ expires_in: 3600 }))).toThrow(/access_token/);
  });

  it("throws on missing or invalid expires_in", () => {
    expect(() => parseTokenResponse(JSON.stringify({ access_token: "x" }))).toThrow(/expires_in/);
    expect(() => parseTokenResponse(JSON.stringify({ access_token: "x", expires_in: 0 }))).toThrow();
    expect(() => parseTokenResponse(JSON.stringify({ access_token: "x", expires_in: -1 }))).toThrow();
  });

  it("throws on non-JSON body", () => {
    expect(() => parseTokenResponse("not-json")).toThrow(/JSON/);
  });
});

describe("Mudad auth — bearerHeader", () => {
  it("formats the Authorization header value", () => {
    expect(bearerHeader("token123")).toBe("Bearer token123");
  });

  it("throws on empty token", () => {
    expect(() => bearerHeader("")).toThrow(/empty/);
  });
});

describe("Mudad auth — token cache reuse", () => {
  beforeEach(() => clearMudadTokenCache());

  it("uses the cached token when it has lots of TTL left", async () => {
    let calls = 0;
    const stubFetcher = async (): Promise<CachedToken> => {
      calls += 1;
      return { accessToken: `T-${calls}`, expiresAt: Date.now() + 3600_000 };
    };

    const t1 = await getMudadAccessToken({
      companyId: 1,
      env: "sandbox",
      creds: { clientId: "id", clientSecret: "secret" },
      fetchToken: stubFetcher as any,
    });
    const t2 = await getMudadAccessToken({
      companyId: 1,
      env: "sandbox",
      creds: { clientId: "id", clientSecret: "secret" },
      fetchToken: stubFetcher as any,
    });
    expect(t1).toBe("T-1");
    expect(t2).toBe("T-1"); // same call
    expect(calls).toBe(1);
  });

  it("refetches when the cached token is past the refresh window", async () => {
    let calls = 0;
    const stubFetcher = async (): Promise<CachedToken> => {
      calls += 1;
      return {
        accessToken: `T-${calls}`,
        // First call returns an already-expired token; second
        // call returns a fresh one.
        expiresAt: calls === 1 ? Date.now() - 1000 : Date.now() + 3600_000,
      };
    };

    const t1 = await getMudadAccessToken({
      companyId: 2, env: "sandbox",
      creds: { clientId: "id", clientSecret: "secret" },
      fetchToken: stubFetcher as any,
    });
    const t2 = await getMudadAccessToken({
      companyId: 2, env: "sandbox",
      creds: { clientId: "id", clientSecret: "secret" },
      fetchToken: stubFetcher as any,
    });
    expect(t1).toBe("T-1");
    expect(t2).toBe("T-2"); // refetch happened
    expect(calls).toBe(2);
  });

  it("scopes the cache by (env, companyId)", async () => {
    let calls = 0;
    const stub = async (): Promise<CachedToken> => {
      calls += 1;
      return { accessToken: `T-${calls}`, expiresAt: Date.now() + 3600_000 };
    };

    const a = await getMudadAccessToken({
      companyId: 1, env: "sandbox",
      creds: { clientId: "id", clientSecret: "secret" },
      fetchToken: stub as any,
    });
    const b = await getMudadAccessToken({
      companyId: 1, env: "production",
      creds: { clientId: "id", clientSecret: "secret" },
      fetchToken: stub as any,
    });
    const c = await getMudadAccessToken({
      companyId: 2, env: "sandbox",
      creds: { clientId: "id", clientSecret: "secret" },
      fetchToken: stub as any,
    });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(calls).toBe(3);
  });
});

describe("Mudad client — response parser", () => {
  it("maps acknowledged response with refId", () => {
    const r = parseMudadResponse({ refId: "MD-123", status: "acknowledged" });
    expect(r.refId).toBe("MD-123");
    expect(r.status).toBe("acknowledged");
    expect(r.errors).toEqual([]);
  });

  it("accepts ref_id (snake_case) as an alias", () => {
    const r = parseMudadResponse({ ref_id: "MD-123", status: "ok" } as any);
    expect(r.refId).toBe("MD-123");
    expect(r.status).toBe("acknowledged");
  });

  it("flags rejected with formatted error messages", () => {
    const r = parseMudadResponse({
      refId: null as any,
      status: "rejected",
      errors: [
        { code: "EMP-404", message: "موظف غير موجود في المنشأة" },
        { code: "AMT-001", message: "amount mismatch" },
      ],
    });
    expect(r.status).toBe("rejected");
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toContain("EMP-404");
    expect(r.errors[0]).toContain("موظف غير موجود");
  });

  it("treats unknown status as 'pending' (no silent acknowledge)", () => {
    const r = parseMudadResponse({ refId: "X", status: "WEIRD_STATE" } as any);
    expect(r.status).toBe("pending");
  });

  it("preserves the raw response on the audit trail", () => {
    const body = { refId: "X", status: "submitted", customField: 123 };
    const r = parseMudadResponse(body as any);
    expect(r.rawResponse).toEqual(body);
  });

  it("handles missing arrays without throwing", () => {
    const r = parseMudadResponse({ refId: "X", status: "submitted" });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});
