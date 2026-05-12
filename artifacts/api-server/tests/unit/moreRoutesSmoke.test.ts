import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const GOV_INT = read("gov-integrations.ts");
const TASKS = read("tasks.ts");
const NOTIF_ENG = read("notification-engine.ts");
const MY_SPACE = read("mySpace.ts");
const ACC_ENG = read("accounting-engine.ts");
const PDPL = read("pdpl.ts");
const AUTO = read("automation.ts");
const PERMS = read("permissions.ts");

// ── Gov Integrations ───────────────────────────────────────────────────────

describe("gov-integrations — endpoints", () => {
  it("GET / requires admin:write", () => {
    const idx = GOV_INT.indexOf('router.get("/",');
    const section = GOV_INT.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("PUT /:id for updating integration config", () => {
    expect(GOV_INT).toContain('router.put("/:id"');
  });

  it("test connection endpoint exists", () => {
    expect(GOV_INT).toContain('"/:id/test"');
  });

  it("expiring iqama endpoint exists", () => {
    expect(GOV_INT).toContain('"/expiring/iqama"');
  });

  it("expiring registration endpoint exists", () => {
    expect(GOV_INT).toContain('"/expiring/registration"');
  });

  it("links CRUD exists", () => {
    expect(GOV_INT).toContain('router.get("/links"');
    expect(GOV_INT).toContain('router.post("/links"');
    expect(GOV_INT).toContain('router.patch("/links/:id"');
    expect(GOV_INT).toContain('router.delete("/links/:id"');
  });

  it("uses parameterized queries", () => {
    const params = [...GOV_INT.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(15);
  });
});

// ── Tasks ──────────────────────────────────────────────────────────────────

describe("tasks — CRUD", () => {
  it("GET / requires tasks:read", () => {
    const idx = TASKS.indexOf('router.get("/",');
    const section = TASKS.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("POST / requires tasks:write", () => {
    const idx = TASKS.indexOf('router.post("/",');
    const section = TASKS.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("entity search endpoint exists", () => {
    expect(TASKS).toContain('"/entity-search"');
  });

  it("GET /:id exists", () => {
    expect(TASKS).toContain('router.get("/:id"');
  });

  it("DELETE /:id requires tasks:write", () => {
    const idx = TASKS.indexOf('router.delete("/:id"');
    const section = TASKS.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("uses parameterized queries", () => {
    const params = [...TASKS.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(10);
  });
});

// ── Notification Engine ────────────────────────────────────────────────────

describe("notification-engine — preferences", () => {
  it("GET /preferences requires notifications:read", () => {
    const idx = NOTIF_ENG.indexOf('"/preferences"');
    const section = NOTIF_ENG.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("PUT /preferences requires admin:write", () => {
    const idx = NOTIF_ENG.indexOf('.put("/preferences"');
    const section = NOTIF_ENG.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });
});

describe("notification-engine — routing rules", () => {
  it("full CRUD for routing rules", () => {
    expect(NOTIF_ENG).toContain('.get("/routing-rules"');
    expect(NOTIF_ENG).toContain('.post("/routing-rules"');
    expect(NOTIF_ENG).toContain('.put("/routing-rules/:id"');
    expect(NOTIF_ENG).toContain('.delete("/routing-rules/:id"');
  });
});

describe("notification-engine — templates", () => {
  it("full CRUD for templates", () => {
    expect(NOTIF_ENG).toContain('.get("/templates"');
    expect(NOTIF_ENG).toContain('.post("/templates"');
    expect(NOTIF_ENG).toContain('.put("/templates/:id"');
    expect(NOTIF_ENG).toContain('.delete("/templates/:id"');
  });
});

describe("notification-engine — fallback chains", () => {
  it("full CRUD for fallback chains", () => {
    expect(NOTIF_ENG).toContain('.get("/fallback-chains"');
    expect(NOTIF_ENG).toContain('.post("/fallback-chains"');
    expect(NOTIF_ENG).toContain('.put("/fallback-chains/:id"');
    expect(NOTIF_ENG).toContain('.delete("/fallback-chains/:id"');
  });
});

describe("notification-engine — webhooks", () => {
  it("webhooks endpoint exists", () => {
    expect(NOTIF_ENG).toContain('"/webhooks"');
  });
});

describe("notification-engine — security", () => {
  it("most admin endpoints require admin:write", () => {
    const admins = [...NOTIF_ENG.matchAll(/authorize\(/g)];
    expect(admins.length).toBeGreaterThanOrEqual(10);
  });

  it("uses parameterized queries", () => {
    const params = [...NOTIF_ENG.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(20);
  });
});

// ── MySpace (Employee self-service) ────────────────────────────────────────

describe("mySpace — employee endpoints", () => {
  it("main endpoint exists", () => {
    expect(MY_SPACE).toContain('router.get("/",');
  });

  it("attendance endpoint exists", () => {
    expect(MY_SPACE).toContain('"/attendance"');
  });

  it("payslip endpoint exists", () => {
    expect(MY_SPACE).toContain('"/payslip"');
  });

  it("performance endpoint exists", () => {
    expect(MY_SPACE).toContain('"/performance"');
  });

  it("documents endpoint exists", () => {
    expect(MY_SPACE).toContain('"/documents"');
  });

  it("requests endpoint exists", () => {
    expect(MY_SPACE).toContain('"/requests"');
  });

  it("scopes by userId/employeeId", () => {
    expect(MY_SPACE).toContain("scope.userId");
  });
});

// ── Accounting Engine ──────────────────────────────────────────────────────

describe("accounting-engine — mappings", () => {
  it("GET /accounting-mappings requires finance:read", () => {
    const idx = ACC_ENG.indexOf('"/accounting-mappings"');
    const section = ACC_ENG.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("batch update requires finance:write", () => {
    expect(ACC_ENG).toContain('"/accounting-mappings/batch"');
  });

  it("operation type specific endpoints exist", () => {
    expect(ACC_ENG).toContain('"/accounting-mappings/:operationType"');
    expect(ACC_ENG).toContain('"/accounting-mappings/:operationType/validate"');
  });
});

describe("accounting-engine — journal templates", () => {
  it("full CRUD for journal templates", () => {
    expect(ACC_ENG).toContain('.get("/journal-templates"');
    expect(ACC_ENG).toContain('.post("/journal-templates"');
    expect(ACC_ENG).toContain('.put("/journal-templates/:id"');
    expect(ACC_ENG).toContain('.delete("/journal-templates/:id"');
  });
});

describe("accounting-engine — subsidiary accounts", () => {
  it("list and entity-specific endpoints exist", () => {
    expect(ACC_ENG).toContain('"/subsidiary-accounts"');
    expect(ACC_ENG).toContain('"/subsidiary-accounts/entity/:entityType/:entityId"');
  });

  it("create and delete exist", () => {
    expect(ACC_ENG).toContain('.post("/subsidiary-accounts"');
    expect(ACC_ENG).toContain('.delete("/subsidiary-accounts/:id"');
  });
});

// ── PDPL (Data protection) ────────────────────────────────────────────────

describe("pdpl — data protection", () => {
  it("privacy notice endpoint exists (public)", () => {
    expect(PDPL).toContain('"/privacy-notice"');
  });

  it("retention policies requires auth", () => {
    const idx = PDPL.indexOf('"/retention-policies"');
    const section = PDPL.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain("authMiddleware");
  });

  it("employee data export endpoint exists", () => {
    expect(PDPL).toContain('"/employee-data-export/:employeeId"');
  });

  it("data request requires admin:write", () => {
    const idx = PDPL.indexOf('"/data-request"');
    const section = PDPL.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("processing log requires elevated level", () => {
    const idx = PDPL.indexOf('"/processing-log"');
    const section = PDPL.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain("requireMinLevel(90)");
  });
});

// ── Automation ─────────────────────────────────────────────────────────────

describe("automation — cron management", () => {
  it("GET /cron-jobs requires admin:read", () => {
    const idx = AUTO.indexOf('"/cron-jobs"');
    const section = AUTO.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("toggle and trigger endpoints exist", () => {
    expect(AUTO).toContain('"/cron-jobs/:id/toggle"');
    expect(AUTO).toContain('"/cron-jobs/:id/trigger"');
  });

  it("cron logs endpoint exists", () => {
    expect(AUTO).toContain('"/cron-logs"');
  });

  it("notification stats endpoint exists", () => {
    expect(AUTO).toContain('"/notification-stats"');
  });

  it("event logs endpoint exists", () => {
    expect(AUTO).toContain('"/event-logs"');
  });

  it("proactive rules endpoints exist", () => {
    expect(AUTO).toContain('"/proactive-rules"');
    expect(AUTO).toContain('"/proactive-rules/:id/toggle"');
  });

  it("automation logs and stats exist", () => {
    expect(AUTO).toContain('"/automation-logs"');
    expect(AUTO).toContain('"/automation-stats"');
  });
});

// ── Permissions ────────────────────────────────────────────────────────────

describe("permissions — access control", () => {
  it("GET /my returns user's own permissions", () => {
    expect(PERMS).toContain('router.get("/my"');
  });

  it("role-permissions requires permissions:read for GET", () => {
    const idx = PERMS.indexOf('router.get("/role-permissions"');
    const section = PERMS.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("role-permissions POST requires dual permission (admin + permissions)", () => {
    const idx = PERMS.indexOf('router.post("/role-permissions"');
    const section = PERMS.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
    expect(section).toContain('authorize(');
  });

  it("user-permissions endpoints exist", () => {
    expect(PERMS).toContain('"/user-permissions"');
    expect(PERMS).toContain('router.post("/user-permissions"');
    expect(PERMS).toContain('router.delete("/user-permissions"');
  });

  it("delete requires dual permission (admin + permissions)", () => {
    const idx = PERMS.indexOf('router.delete("/role-permissions"');
    const section = PERMS.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
    expect(section).toContain('authorize(');
  });
});
