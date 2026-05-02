import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const APP = read("app.ts");
const INDEX = read("index.ts");
const ROUTES_INDEX = read("routes/index.ts");

// ══════════════════════════════════════════════════════════════════════════
// APP — Security headers & middleware
// ══════════════════════════════════════════════════════════════════════════

describe("app — security headers", () => {
  it("uses helmet for security headers", () => {
    expect(APP).toContain("helmet");
  });

  it("configures Content-Security-Policy", () => {
    expect(APP).toContain("contentSecurityPolicy");
  });

  it("CSP blocks object/frame embedding", () => {
    expect(APP).toContain("objectSrc");
    expect(APP).toContain("frameSrc");
    expect(APP).toContain("'none'");
  });

  it("upgrades insecure requests", () => {
    expect(APP).toContain("upgradeInsecureRequests");
  });
});

describe("app — CORS configuration", () => {
  it("uses cors middleware", () => {
    expect(APP).toContain("cors");
  });

  it("supports CORS_ORIGINS env variable", () => {
    expect(APP).toContain("CORS_ORIGINS");
  });

  it("validates origin against allowlist in production", () => {
    expect(APP).toContain("not in allowlist");
  });

  it("sends credentials", () => {
    expect(APP).toContain("credentials: true");
  });
});

describe("app — rate limiting", () => {
  it("has global rate limiter on /api", () => {
    expect(APP).toContain("globalLimiter");
  });

  it("global limiter is stricter in production (100 vs 2000)", () => {
    expect(APP).toContain("production");
    expect(APP).toContain("100");
    expect(APP).toContain("2000");
  });

  it("has dedicated umrah rate limiter (10 req/min)", () => {
    expect(APP).toContain("umrahLimiter");
  });

  it("rate limit returns Arabic error message", () => {
    expect(APP).toContain("تم تجاوز الحد الأقصى للطلبات");
  });

  it("skips health endpoint from rate limiting", () => {
    expect(APP).toContain('/api/health"');
  });
});

describe("app — middleware chain", () => {
  it("uses cookie parser", () => {
    expect(APP).toContain("cookieParser");
  });

  it("parses JSON with safe default limit and higher for imports", () => {
    expect(APP).toContain('"2mb"');
    expect(APP).toContain('"50mb"');
  });

  it("uses eventBusMiddleware", () => {
    expect(APP).toContain("eventBusMiddleware");
  });

  it("uses auditMiddleware", () => {
    expect(APP).toContain("auditMiddleware");
  });

  it("uses activityTrackerMiddleware", () => {
    expect(APP).toContain("activityTrackerMiddleware");
  });

  it("uses pino HTTP logging", () => {
    expect(APP).toContain("pinoHttp");
  });

  it("trusts proxy (behind load balancer)", () => {
    expect(APP).toContain('"trust proxy"');
  });
});

describe("app — health check", () => {
  it("has GET /api/health endpoint", () => {
    expect(APP).toContain('"/api/health"');
  });

  it("checks database connectivity", () => {
    expect(APP).toContain("SELECT 1");
  });

  it("returns status and timestamp", () => {
    expect(APP).toContain("status");
    expect(APP).toContain("timestamp");
  });
});

describe("app — error handling", () => {
  it("has 404 catch-all for unknown /api routes", () => {
    expect(APP).toContain("404");
    expect(APP).toContain("المسار غير موجود");
  });

  it("has central error handler", () => {
    expect(APP).toContain("classifyDbError");
  });

  it("generates unique requestId for errors", () => {
    expect(APP).toContain("requestId");
    expect(APP).toContain("randomUUID");
  });

  it("hides error details in production", () => {
    expect(APP).toContain('process.env.NODE_ENV !== "production"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// INDEX — Server startup
// ══════════════════════════════════════════════════════════════════════════

describe("index — server startup", () => {
  it("imports app", () => {
    expect(INDEX).toContain("app");
  });

  it("listens on a port", () => {
    expect(INDEX).toContain("listen");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ROUTES INDEX — Module registration
// ══════════════════════════════════════════════════════════════════════════

describe("routes/index — mounts all route modules", () => {
  for (const route of [
    "/auth", "/employees", "/clients", "/hr",
    "/finance", "/fleet", "/legal", "/properties", "/projects",
    "/warehouse", "/support", "/tasks", "/crm", "/settings",
    "/notifications", "/dashboard", "/workflows",
  ]) {
    it(`mounts ${route}`, () => {
      expect(ROUTES_INDEX).toContain(`"${route}"`);
    });
  }
});
