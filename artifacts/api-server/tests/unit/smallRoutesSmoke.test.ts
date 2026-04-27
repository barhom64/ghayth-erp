import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const CALENDAR = read("calendar.ts");
const DIGITAL_SIG = read("digital-signature.ts");
const EVENTS = read("events.ts");
const SCHED_REPORTS = read("scheduled-reports.ts");
const ACTION_CENTER = read("actionCenter.ts");
const ACTIVITY_LOG = read("activityLog.ts");
const ACTIVITY_INGEST = read("activityIngest.ts");
const APPROVAL_ACTIONS = read("approvalActions.ts");
const AUDIT_LOGS = read("auditLogs.ts");
const PUBLIC_DATA = read("publicData.ts");
const IMPACT = read("impactPreview.ts");

// ── Calendar ───────────────────────────────────────────────────────────────

describe("calendar �� endpoints", () => {
  it("upcoming endpoint requires operations:read", () => {
    const idx = CALENDAR.indexOf('"/upcoming"');
    const section = CALENDAR.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("operations:read")');
  });
});

// ── Digital Signature ──────────────────────────────────────────────────────

describe("digital-signature — endpoints", () => {
  it("request OTP requires documents:write", () => {
    const idx = DIGITAL_SIG.indexOf('"/request-otp"');
    const section = DIGITAL_SIG.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("documents:write")');
  });

  it("verify endpoint requires documents:write", () => {
    const idx = DIGITAL_SIG.indexOf('"/verify"');
    const section = DIGITAL_SIG.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("documents:write")');
  });

  it("logs endpoint exists", () => {
    expect(DIGITAL_SIG).toContain('"/logs"');
  });
});

// ── Events ─────────────────────────────────────────────────────────────────

describe("events — catalog & log", () => {
  it("catalog endpoint exists", () => {
    expect(EVENTS).toContain('"/catalog"');
  });

  it("catalog detail by name exists", () => {
    expect(EVENTS).toContain('"/catalog/:name"');
  });

  it("event log endpoint exists", () => {
    expect(EVENTS).toContain('.get("/log"');
  });

  it("event log stats endpoint exists", () => {
    expect(EVENTS).toContain('"/log/stats"');
  });
});

// ── Scheduled Reports ──────────────────────────────────────────────────────

describe("scheduled-reports — CRUD", () => {
  it("GET / requires reports:read", () => {
    const idx = SCHED_REPORTS.indexOf('.get("/",');
    const section = SCHED_REPORTS.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("reports:read")');
  });

  it("POST / requires reports:write", () => {
    const idx = SCHED_REPORTS.indexOf('.post("/",');
    const section = SCHED_REPORTS.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("reports:write")');
  });

  it("PATCH /:id requires reports:write", () => {
    const idx = SCHED_REPORTS.indexOf('.patch("/:id"');
    const section = SCHED_REPORTS.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("reports:write")');
  });

  it("DELETE /:id requires reports:write", () => {
    const idx = SCHED_REPORTS.indexOf('.delete("/:id"');
    const section = SCHED_REPORTS.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("reports:write")');
  });

  it("history endpoint exists", () => {
    expect(SCHED_REPORTS).toContain('"/history"');
  });
});

// ── Action Center ──────────────────────────────────────────────────────────

describe("actionCenter — endpoints", () => {
  it("main endpoint exists", () => {
    expect(ACTION_CENTER).toContain('router.get("/",');
  });

  it("scopes by companyId", () => {
    expect(ACTION_CENTER).toContain("companyId");
  });
});

// ── Activity Log ───────────────────────────────────────────────────────────

describe("activityLog — endpoints", () => {
  it("GET / requires admin:read", () => {
    const idx = ACTIVITY_LOG.indexOf('router.get("/",');
    const section = ACTIVITY_LOG.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("admin:read")');
  });

  it("summary endpoint requires admin:read", () => {
    const idx = ACTIVITY_LOG.indexOf('"/summary"');
    const section = ACTIVITY_LOG.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("admin:read")');
  });

  it("uses parameterized queries", () => {
    const params = [...ACTIVITY_LOG.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(3);
  });
});

// ── Activity Ingest ────────────────────────────────────────────────────────

describe("activityIngest — endpoints", () => {
  it("POST /intelligence/activity uses rate limiter and auth", () => {
    const idx = ACTIVITY_INGEST.indexOf('"/intelligence/activity"');
    const section = ACTIVITY_INGEST.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain("activityLimiter");
    expect(section).toContain("authMiddleware");
  });
});

// ── Approval Actions ───────────────────────────────────────────────────────

describe("approvalActions — endpoints", () => {
  it("overrides report endpoint exists", () => {
    expect(APPROVAL_ACTIONS).toContain('"/overrides/report"');
  });

  it("entity-specific approval endpoint exists", () => {
    expect(APPROVAL_ACTIONS).toContain('"/:entityType/:entityId"');
  });
});

// ── Audit Logs ─────────────────────────────────────────────────────────────

describe("auditLogs — endpoints", () => {
  it("GET / requires audit:read", () => {
    const idx = AUDIT_LOGS.indexOf('router.get("/",');
    const section = AUDIT_LOGS.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("audit:read")');
  });

  it("entities endpoint exists", () => {
    expect(AUDIT_LOGS).toContain('"/entities"');
  });

  it("entity-specific audit trail exists", () => {
    expect(AUDIT_LOGS).toContain('"/:entityType/:entityId"');
  });
});

// ── Public Data ────────────────────────────────────────────────────────────

describe("publicData — endpoints", () => {
  it("announcements with rate limiter", () => {
    const idx = PUBLIC_DATA.indexOf('"/announcements"');
    const section = PUBLIC_DATA.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain("publicLimiter");
  });

  it("employee of month with rate limiter", () => {
    const idx = PUBLIC_DATA.indexOf('"/employee-of-month"');
    const section = PUBLIC_DATA.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain("publicLimiter");
  });

  it("forgot password endpoint", () => {
    expect(PUBLIC_DATA).toContain('"/forgot-password"');
  });
});

// ── Impact Preview ─────────────────────────────────────────────────────────

describe("impactPreview — endpoint", () => {
  it("POST / requires admin:read", () => {
    const idx = IMPACT.indexOf('router.post("/",');
    const section = IMPACT.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("admin:read")');
  });
});
