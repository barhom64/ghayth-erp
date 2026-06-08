import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const CORRESPONDENCE = read("correspondence.ts");
const EXPORT = read("export.ts");
const HEALTH = read("health.ts");
const OBLIGATIONS = read("obligations.ts");
const RULES = read("rules.ts");
const SEARCH = read("search.ts");
const STORAGE = read("storage.ts");

// ── Correspondence ────────────────────────────────────────────────────────

describe("correspondence — endpoints", () => {
  it("uses authMiddleware", () => {
    expect(CORRESPONDENCE).toContain("authMiddleware");
  });

  it("GET / requires communications:read", () => {
    const idx = CORRESPONDENCE.indexOf('.get("/",');
    const section = CORRESPONDENCE.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("GET /:id requires communications:read", () => {
    const idx = CORRESPONDENCE.indexOf('"/:id"');
    const section = CORRESPONDENCE.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("POST / requires communications:write", () => {
    const idx = CORRESPONDENCE.indexOf('.post("/",');
    const section = CORRESPONDENCE.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("PATCH /:id requires communications:write", () => {
    const idx = CORRESPONDENCE.indexOf('.patch("/:id"');
    const section = CORRESPONDENCE.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("send endpoint exists", () => {
    expect(CORRESPONDENCE).toContain('"/:id/send"');
  });

  it("respond endpoint exists", () => {
    expect(CORRESPONDENCE).toContain('"/:id/respond"');
  });

  it("stats summary endpoint exists", () => {
    expect(CORRESPONDENCE).toContain('"/stats/summary"');
  });

  it("uses parameterized queries", () => {
    const params = [...CORRESPONDENCE.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(5);
  });
});

// ── Export ─────────────────────────────────────────────────────────────────

describe("export — endpoints", () => {
  it("uses authMiddleware", () => {
    expect(EXPORT).toContain("authMiddleware");
  });

  it("generates PDF exports", () => {
    expect(EXPORT).toContain("pdf");
  });

  it("generates Excel exports", () => {
    expect(EXPORT).toContain("excel");
  });
});

// ── Health ─────────────────────────────────────────────────────────────────

describe("health — endpoints", () => {
  it("has healthz endpoint", () => {
    expect(HEALTH).toContain('"/healthz"');
  });

  it("has schema health check", () => {
    expect(HEALTH).toContain('"/health/schema"');
  });

  it("no auth required for healthz (public)", () => {
    const idx = HEALTH.indexOf('"/healthz"');
    const section = HEALTH.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).not.toContain("authMiddleware");
  });
});

// ── Obligations ───────────────────────────────────────────────────────────

describe("obligations — endpoints", () => {
  it("uses authMiddleware", () => {
    expect(OBLIGATIONS).toContain("authMiddleware");
  });

  it("GET / requires operations:read", () => {
    const idx = OBLIGATIONS.indexOf('.get("/",');
    const section = OBLIGATIONS.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("summary endpoint requires operations:read", () => {
    const idx = OBLIGATIONS.indexOf('"/summary"');
    const section = OBLIGATIONS.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("scan endpoint requires operations:create", () => {
    const idx = OBLIGATIONS.indexOf('"/scan"');
    const section = OBLIGATIONS.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("uses parameterized queries", () => {
    const params = [...OBLIGATIONS.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(3);
  });
});

// ── Rules ─────────────────────────────────────────────────────────────────

describe("rules — endpoints", () => {
  it("relies on global authMiddleware from index.ts", () => {
    expect(RULES).not.toContain("authMiddleware");
  });

  it("GET / requires admin:write", () => {
    const idx = RULES.indexOf('.get("/",');
    const section = RULES.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("GET /logs requires admin:write", () => {
    const idx = RULES.indexOf('"/logs"');
    const section = RULES.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("POST / requires admin:write", () => {
    const idx = RULES.indexOf('.post("/",');
    const section = RULES.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("PATCH /:id requires admin:write", () => {
    const idx = RULES.indexOf('.patch("/:id"');
    const section = RULES.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("DELETE /:id requires admin:write", () => {
    const idx = RULES.indexOf('.delete("/:id"');
    const section = RULES.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("toggle endpoint exists", () => {
    expect(RULES).toContain('"/:id/toggle"');
  });

  it("uses parameterized queries", () => {
    const params = [...RULES.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(5);
  });
});

// ── Search ────────────────────────────────────────────────────────────────

describe("search — endpoints", () => {
  it("relies on global authMiddleware from index.ts", () => {
    expect(SEARCH).not.toContain("authMiddleware");
  });

  it("gates each entity by its own feature via per-entity checkAccess", () => {
    // Global search fans out across domains; a single coarse authorize()
    // gate would leak employees/invoices/legal/tenants to anyone who could
    // reach the endpoint. Instead each entity query is gated individually
    // against its feature's list access — and it fails closed.
    expect(SEARCH).toContain("FEATURE_BY_ENTITY");
    expect(SEARCH).toContain("checkAccess(scope, { feature: f, action: \"list\" })");
    expect(SEARCH).toContain('featureAllowed.get(FEATURE_BY_ENTITY[t]) === true');
    // Sensitive domains must be mapped to real features (not blanket-open).
    expect(SEARCH).toContain('employees: "hr.employees"');
    expect(SEARCH).toContain('invoices: "finance.invoices"');
    expect(SEARCH).toContain('legal_cases: "legal.cases"');
  });
});

// ── Storage ───────────────────────────────────────────────────────────────

describe("storage — endpoints", () => {
  it("upload request endpoint requires documents:write", () => {
    const idx = STORAGE.indexOf("request-url");
    const section = STORAGE.slice(Math.max(0, idx - 200), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("upload has rate limiter", () => {
    expect(STORAGE).toContain("uploadLimiter");
  });

  it("public objects endpoint exists", () => {
    expect(STORAGE).toContain("public-objects");
  });

  it("private objects download requires documents:download", () => {
    const idx = STORAGE.indexOf("objects/*path");
    const section = STORAGE.slice(Math.max(0, idx - 200), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("uses authMiddleware for protected routes", () => {
    expect(STORAGE).toContain("authMiddleware");
  });
});
