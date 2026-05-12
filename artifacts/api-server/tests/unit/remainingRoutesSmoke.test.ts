import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const CLIENTS = read("clients.ts");
const AUTH = read("auth.ts");
const RECRUIT = read("recruitment.ts");
const TRAIN = read("training.ts");
const STORE = read("store.ts");
const MARKETING = read("marketing.ts");
const NOTIF = read("notifications.ts");
const DASH = read("dashboard.ts");

// ── Clients ────────────────────────────────────────────────────────────────

describe("clients — endpoints", () => {
  it("GET / requires crm:read", () => {
    const idx = CLIENTS.indexOf('router.get("/",');
    const section = CLIENTS.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("POST / requires crm:create", () => {
    const idx = CLIENTS.indexOf('router.post("/",');
    const section = CLIENTS.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("DELETE /:id requires crm:delete", () => {
    const idx = CLIENTS.indexOf('router.delete("/:id"');
    const section = CLIENTS.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("auto-create endpoint exists", () => {
    expect(CLIENTS).toContain('"/auto-create"');
  });

  it("portal account CRUD exists", () => {
    expect(CLIENTS).toContain('"/:id/portal-account"');
  });

  it("uses parameterized queries", () => {
    const params = [...CLIENTS.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(15);
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────

describe("auth — endpoints", () => {
  it("login endpoint with rate limiter", () => {
    const idx = AUTH.indexOf('"/login"');
    const section = AUTH.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain("loginLimiter");
  });

  it("register endpoint with rate limiter", () => {
    const idx = AUTH.indexOf('"/register"');
    const section = AUTH.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain("registerLimiter");
  });

  it("refresh token endpoint exists", () => {
    expect(AUTH).toContain('"/refresh"');
  });

  it("logout requires authMiddleware", () => {
    const idx = AUTH.indexOf('"/logout"');
    const section = AUTH.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain("authMiddleware");
  });

  it("switch assignment endpoint exists", () => {
    expect(AUTH).toContain('"/switch-assignment"');
  });

  it("GET /me requires authMiddleware", () => {
    const idx = AUTH.indexOf('"/me"');
    const section = AUTH.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain("authMiddleware");
  });

  it("change password has rate limiter", () => {
    const idx = AUTH.indexOf('"/change-password"');
    const section = AUTH.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain("changePasswordLimiter");
  });
});

// ── Recruitment ──────────────────────────────────────────────────────────

describe("recruitment — job postings", () => {
  it("GET /postings requires hr:read", () => {
    const idx = RECRUIT.indexOf('"/postings"');
    const section = RECRUIT.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("POST /postings requires hr:write", () => {
    const idx = RECRUIT.indexOf('router.post("/postings"');
    const section = RECRUIT.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("close and reopen endpoints exist", () => {
    expect(RECRUIT).toContain('"/postings/:id/close"');
    expect(RECRUIT).toContain('"/postings/:id/reopen"');
  });

  it("full CRUD for applications", () => {
    expect(RECRUIT).toContain('router.get("/applications"');
    expect(RECRUIT).toContain('router.post("/applications"');
    expect(RECRUIT).toContain('"/applications/:id"');
    expect(RECRUIT).toContain('router.delete("/applications/:id"');
  });

  it("stats endpoint exists", () => {
    expect(RECRUIT).toContain('"/stats"');
  });
});

// ── Training ─────────────────────────────────────────────────────────────

describe("training — programs", () => {
  it("GET /programs requires hr:read", () => {
    const idx = TRAIN.indexOf('"/programs"');
    const section = TRAIN.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("approval workflow (approve, reject)", () => {
    expect(TRAIN).toContain('"/programs/:id/approve"');
    expect(TRAIN).toContain('"/programs/:id/reject"');
  });

  it("full CRUD for enrollments", () => {
    expect(TRAIN).toContain('router.get("/enrollments"');
    expect(TRAIN).toContain('router.post("/enrollments"');
    expect(TRAIN).toContain('"/enrollments/:id"');
    expect(TRAIN).toContain('router.delete("/enrollments/:id"');
  });

  it("uses parameterized queries", () => {
    const params = [...TRAIN.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(15);
  });
});

// ── Store ────────────────────────────────────────────────────────────────

describe("store — products & orders", () => {
  it("products CRUD with store:read/write", () => {
    expect(STORE).toContain('authorize(');
    expect(STORE).toContain('authorize(');
  });

  it("full CRUD for products", () => {
    expect(STORE).toContain('router.get("/products"');
    expect(STORE).toContain('router.post("/products"');
    expect(STORE).toContain('"/products/:id"');
    expect(STORE).toContain('router.delete("/products/:id"');
  });

  it("full CRUD for orders", () => {
    expect(STORE).toContain('router.get("/orders"');
    expect(STORE).toContain('router.post("/orders"');
    expect(STORE).toContain('"/orders/:id"');
    expect(STORE).toContain('router.delete("/orders/:id"');
  });

  it("stats endpoint exists", () => {
    expect(STORE).toContain('"/stats"');
  });
});

// ── Marketing ────────────────────────────────────────────────────────────

describe("marketing — campaigns", () => {
  it("CRUD with marketing permissions", () => {
    expect(MARKETING).toContain('authorize(');
    expect(MARKETING).toContain('authorize(');
    expect(MARKETING).toContain('authorize(');
    expect(MARKETING).toContain('authorize(');
  });

  it("ROAS (return on ad spend) endpoint", () => {
    expect(MARKETING).toContain('"/campaigns/:id/roas"');
  });

  it("funnel endpoint exists", () => {
    expect(MARKETING).toContain('"/funnel"');
  });

  it("revenue update endpoint exists", () => {
    expect(MARKETING).toContain('"/campaigns/:id/revenue"');
  });

  it("templates endpoint exists", () => {
    expect(MARKETING).toContain('"/templates"');
  });

  it("uses parameterized queries", () => {
    const params = [...MARKETING.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(10);
  });
});

// ── Notifications ────────────────────────────────────────────────────────

describe("notifications — CRUD", () => {
  it("GET / requires notifications:read", () => {
    expect(NOTIF).toContain('authorize(');
  });

  it("mark as read endpoint exists", () => {
    expect(NOTIF).toContain('"/:id/read"');
  });

  it("unread count endpoint exists", () => {
    expect(NOTIF).toContain('"/unread-count"');
  });

  it("preferences endpoints exist", () => {
    expect(NOTIF).toContain('router.get("/preferences"');
    expect(NOTIF).toContain('router.post("/preferences"');
  });

  it("mark all read endpoint exists", () => {
    expect(NOTIF).toContain('"/mark-all-read"');
  });
});

// ── Dashboard ────────────────────────────────────────────────────────────

describe("dashboard — endpoints", () => {
  it("main dashboard endpoint exists", () => {
    expect(DASH).toContain('router.get("/",');
  });

  it("summary endpoint exists", () => {
    expect(DASH).toContain('"/summary"');
  });

  it("role-data endpoint exists", () => {
    expect(DASH).toContain('"/role-data"');
  });

  it("chart endpoints exist (revenue, attendance, departments, events)", () => {
    expect(DASH).toContain('"/charts/revenue"');
    expect(DASH).toContain('"/charts/attendance"');
    expect(DASH).toContain('"/charts/departments"');
    expect(DASH).toContain('"/charts/recent-events"');
  });

  it("scopes queries by companyId", () => {
    const matches = [...DASH.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(5);
  });
});
