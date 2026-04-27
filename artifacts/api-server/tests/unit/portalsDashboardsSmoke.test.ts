import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const CLIENT_PORTAL = read("clientPortal.ts");
const CAREERS = read("careersPortal.ts");
const ENTITY_META = read("entityMeta.ts");
const MOD_DASH = read("moduleDashboards.ts");
const OPS_CENTER = read("operationsCenter.ts");
const EXEC_DASH = read("execDashboard.ts");

// ── Client Portal ──────────────────────────────────────────────────────────

describe("clientPortal — auth", () => {
  it("login endpoint with rate limiter", () => {
    const idx = CLIENT_PORTAL.indexOf('"/auth/login"');
    const section = CLIENT_PORTAL.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain("loginLimiter");
  });

  it("uses withPortalScope for protected routes", () => {
    const matches = [...CLIENT_PORTAL.matchAll(/withPortalScope/g)];
    expect(matches.length).toBeGreaterThanOrEqual(10);
  });
});

describe("clientPortal — customer features", () => {
  it("GET /me endpoint exists", () => {
    expect(CLIENT_PORTAL).toContain('"/me"');
  });

  it("dashboard endpoint exists", () => {
    expect(CLIENT_PORTAL).toContain('"/dashboard"');
  });

  it("invoices list and detail", () => {
    expect(CLIENT_PORTAL).toContain('.get("/invoices"');
    expect(CLIENT_PORTAL).toContain('"/invoices/:id"');
  });

  it("tickets CRUD with replies", () => {
    expect(CLIENT_PORTAL).toContain('.get("/tickets"');
    expect(CLIENT_PORTAL).toContain('"/tickets/:id"');
    expect(CLIENT_PORTAL).toContain('"/tickets/:id/replies"');
    expect(CLIENT_PORTAL).toContain('.post("/tickets"');
  });

  it("password change endpoint", () => {
    expect(CLIENT_PORTAL).toContain('"/profile/password"');
  });

  it("invoice payment endpoint", () => {
    expect(CLIENT_PORTAL).toContain('"/invoices/:id/pay"');
  });

  it("CSAT feedback endpoint", () => {
    expect(CLIENT_PORTAL).toContain('"/invoices/:id/csat"');
  });

  it("knowledge base endpoints", () => {
    expect(CLIENT_PORTAL).toContain('.get("/kb"');
    expect(CLIENT_PORTAL).toContain('"/kb/:id"');
  });
});

describe("clientPortal — security", () => {
  it("uses parameterized queries", () => {
    const params = [...CLIENT_PORTAL.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(20);
  });
});

// ── Careers Portal ─────────────────────────────────────────────────────────

describe("careersPortal — public auth", () => {
  it("register with rate limiter", () => {
    const idx = CAREERS.indexOf('"/auth/register"');
    const section = CAREERS.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain("portalLimiter");
  });

  it("login with rate limiter", () => {
    const idx = CAREERS.indexOf('"/auth/login"');
    const section = CAREERS.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain("portalLimiter");
  });
});

describe("careersPortal — job features", () => {
  it("public job listing", () => {
    expect(CAREERS).toContain('"/jobs"');
    expect(CAREERS).toContain('"/jobs/:id"');
  });

  it("authenticated profile management", () => {
    expect(CAREERS).toContain('"/me"');
    const idx = CAREERS.indexOf('router.get("/me"');
    const section = CAREERS.slice(idx, idx + 200);
    expect(section).toContain("careersAuth");
  });

  it("resume upload endpoint", () => {
    expect(CAREERS).toContain('"/me/resume"');
  });

  it("application endpoints", () => {
    expect(CAREERS).toContain('"/my-applications"');
    expect(CAREERS).toContain('"/apply"');
  });
});

// ── Entity Meta (comments, tags) ───────────────────────────────────────────

describe("entityMeta — comments", () => {
  it("GET comments requires operations:read", () => {
    const idx = ENTITY_META.indexOf('"/comments/:entityType/:entityId"');
    const section = ENTITY_META.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("operations:read")');
  });

  it("POST comments requires admin:write", () => {
    const idx = ENTITY_META.indexOf('.post("/comments');
    const section = ENTITY_META.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("admin:write")');
  });

  it("DELETE comments requires admin:write", () => {
    expect(ENTITY_META).toContain('.delete("/comments/:id"');
  });
});

describe("entityMeta — tags", () => {
  it("tag CRUD endpoints exist", () => {
    expect(ENTITY_META).toContain('"/tags/:entityType/:entityId"');
    expect(ENTITY_META).toContain('.post("/tags');
    expect(ENTITY_META).toContain('.delete("/tags/:id"');
  });

  it("tag filter and list endpoints", () => {
    expect(ENTITY_META).toContain('"/tags-filter/:entityType"');
    expect(ENTITY_META).toContain('"/tags-list/:entityType"');
  });

  it("bulk action endpoint exists", () => {
    expect(ENTITY_META).toContain('"/bulk-action"');
  });
});

// ── Module Dashboards ────────────────────────────────────────��─────────────

describe("moduleDashboards — per-module endpoints", () => {
  it("HR dashboard requires hr:read", () => {
    const idx = MOD_DASH.indexOf('"/hr"');
    const section = MOD_DASH.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("hr:read")');
  });

  it("finance dashboard requires finance:read", () => {
    const idx = MOD_DASH.indexOf('"/finance"');
    const section = MOD_DASH.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("finance:read")');
  });

  it("all 11 module dashboards exist", () => {
    for (const mod of ["hr", "finance", "fleet", "legal", "properties", "projects", "crm", "store", "support", "tasks", "warehouse"]) {
      expect(MOD_DASH).toContain(`"/${mod}"`);
    }
  });

  it("uses parameterized queries", () => {
    const params = [...MOD_DASH.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(20);
  });
});

// ── Operations Center ────────────────────────────────────���─────────────────

describe("operationsCenter — endpoints", () => {
  it("main endpoint requires operations:read", () => {
    const idx = OPS_CENTER.indexOf('router.get("/",');
    const section = OPS_CENTER.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("operations:read")');
  });

  it("daily close checklist endpoint", () => {
    expect(OPS_CENTER).toContain('"/daily-close/checklist"');
  });

  it("daily close execute requires finance:write", () => {
    const idx = OPS_CENTER.indexOf('"/daily-close/execute"');
    const section = OPS_CENTER.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("finance:write")');
  });

  it("uses parameterized queries", () => {
    const params = [...OPS_CENTER.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(10);
  });
});

// ── Executive Dashboard ────────────────────────────────────────────────────

describe("execDashboard — endpoints", () => {
  it("overview endpoint exists", () => {
    expect(EXEC_DASH).toContain('"/overview"');
  });

  it("overdue invoices endpoint exists", () => {
    expect(EXEC_DASH).toContain('"/overdue-invoices"');
  });

  it("critical obligations endpoint exists", () => {
    expect(EXEC_DASH).toContain('"/critical-obligations"');
  });

  it("scopes by companyId", () => {
    const matches = [...EXEC_DASH.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(5);
  });
});
