import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * publicBaseUrl resolution (#2137 follow-up — root fix for empty
 * PUBLIC_BASE_URL in production breaking every reset/invitation/activation
 * link email).
 *
 * Precedence under test:
 *   1. PUBLIC_BASE_URL (explicit override)
 *   2. REPLIT_DEPLOYMENT_URL
 *   3. first https CORS origin, else first CORS origin
 *   4. "" (operational gate refuses to email a broken link)
 *
 * The real exported `config` singleton is rebuilt from process.env on
 * import, so each case re-imports the module under a stubbed env.
 */
async function resolvePublicBaseUrl(env: Record<string, string>): Promise<string> {
  vi.resetModules();
  // Minimal valid baseline (only DATABASE_URL + JWT_SECRET are required).
  vi.stubEnv("DATABASE_URL", "postgres://localhost:5432/test");
  vi.stubEnv("JWT_SECRET", "x".repeat(40));
  // Clear every input that feeds publicBaseUrl, then apply the case.
  for (const key of [
    "PUBLIC_BASE_URL",
    "REPLIT_DEPLOYMENT_URL",
    "CORS_ORIGINS",
    "CORS_ORIGIN",
    "REPLIT_DEV_DOMAIN",
  ]) {
    vi.stubEnv(key, env[key] ?? "");
  }
  const mod = await import("../../src/lib/config.js");
  return mod.config.publicBaseUrl;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("config.publicBaseUrl resolution", () => {
  it("uses PUBLIC_BASE_URL when set, over any CORS origin", async () => {
    const v = await resolvePublicBaseUrl({
      PUBLIC_BASE_URL: "https://explicit.example.com",
      CORS_ORIGINS: "https://cors.example.com",
    });
    expect(v).toBe("https://explicit.example.com");
  });

  it("strips a trailing slash from the explicit value", async () => {
    const v = await resolvePublicBaseUrl({ PUBLIC_BASE_URL: "https://x.example.com/" });
    expect(v).toBe("https://x.example.com");
  });

  it("prefers REPLIT_DEPLOYMENT_URL over the CORS fallback", async () => {
    const v = await resolvePublicBaseUrl({
      REPLIT_DEPLOYMENT_URL: "https://repl.example.com",
      CORS_ORIGINS: "https://app.example.com",
    });
    expect(v).toBe("https://repl.example.com");
  });

  it("falls back to the configured CORS origin when no explicit base is set", async () => {
    const v = await resolvePublicBaseUrl({ CORS_ORIGINS: "https://app.example.com" });
    expect(v).toBe("https://app.example.com");
  });

  it("prefers an https CORS origin over an http/localhost one", async () => {
    const v = await resolvePublicBaseUrl({
      CORS_ORIGINS: "http://localhost:3000,https://app.example.com",
    });
    expect(v).toBe("https://app.example.com");
  });

  it("uses the first CORS origin when none are https", async () => {
    const v = await resolvePublicBaseUrl({ CORS_ORIGINS: "http://localhost:3000" });
    expect(v).toBe("http://localhost:3000");
  });

  it("is empty when nothing is configured (operational gate territory)", async () => {
    const v = await resolvePublicBaseUrl({});
    expect(v).toBe("");
  });
});
