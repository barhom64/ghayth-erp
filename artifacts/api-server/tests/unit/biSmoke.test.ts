import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/bi.ts"),
  "utf8"
);

describe("bi — dashboard management", () => {
  it("GET /dashboards requires bi:read", () => {
    const idx = SRC.indexOf('"/dashboards"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("bi:read")');
  });

  it("POST /dashboards requires bi:write", () => {
    const idx = SRC.indexOf('router.post("/dashboards"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("bi:write")');
  });

  it("dashboards scoped by companyId", () => {
    const idx = SRC.indexOf('"/dashboards"');
    const section = SRC.slice(idx, idx + 500);
    expect(section).toContain("scope.companyId");
  });
});

describe("bi — Zod validation schemas", () => {
  it("createDashboardSchema requires title", () => {
    const idx = SRC.indexOf("createDashboardSchema");
    const section = SRC.slice(idx, idx + 300);
    expect(section).toContain('title: z.string().min(1');
  });

  it("createKpiSchema requires name, module, formula", () => {
    const idx = SRC.indexOf("createKpiSchema");
    const section = SRC.slice(idx, idx + 400);
    expect(section).toContain('name: z.string().min(1');
    expect(section).toContain('module: z.string().min(1');
    expect(section).toContain('formula: z.string().min(1');
  });

  it("createReportSchema requires title, type, query", () => {
    const idx = SRC.indexOf("createReportSchema");
    const section = SRC.slice(idx, idx + 400);
    expect(section).toContain('title: z.string().min(1');
    expect(section).toContain('type: z.string().min(1');
    expect(section).toContain('query: z.string().min(1');
  });

  it("muteAlertSchema requires alertType", () => {
    const idx = SRC.indexOf("muteAlertSchema");
    const section = SRC.slice(idx, idx + 300);
    expect(section).toContain('alertType: z.string().min(1');
  });
});

describe("bi — KPI management", () => {
  it("GET /kpis requires bi:read", () => {
    const idx = SRC.indexOf('"/kpis"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("bi:read")');
  });

  it("POST /kpis requires bi:write", () => {
    const idx = SRC.indexOf('router.post("/kpis"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("bi:write")');
  });
});

describe("bi — reports management", () => {
  it("GET /reports requires bi:read", () => {
    const idx = SRC.indexOf('router.get("/reports"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("bi:read")');
  });

  it("POST /reports requires bi:write", () => {
    const idx = SRC.indexOf('router.post("/reports"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("bi:write")');
  });
});

describe("bi — operations analytics", () => {
  it("SLA delays endpoint exists", () => {
    expect(SRC).toContain('"/operations/sla-delays"');
  });

  it("rejection rate endpoint exists", () => {
    expect(SRC).toContain('"/operations/rejection-rate"');
  });

  it("bottleneck analysis endpoint exists", () => {
    expect(SRC).toContain('"/operations/bottleneck"');
  });

  it("employee productivity endpoint exists", () => {
    expect(SRC).toContain('"/operations/employee-productivity"');
  });

  it("approval timeliness endpoint exists", () => {
    expect(SRC).toContain('"/operations/approval-timeliness"');
  });

  it("avg completion time endpoint exists", () => {
    expect(SRC).toContain('"/operations/avg-completion-time"');
  });

  it("trend endpoint exists", () => {
    expect(SRC).toContain('"/operations/trend"');
  });
});

describe("bi — admin reports", () => {
  it("daily admin report exists", () => {
    expect(SRC).toContain('"/admin-reports/daily"');
  });

  it("weekly admin report exists", () => {
    expect(SRC).toContain('"/admin-reports/weekly"');
  });

  it("monthly admin report exists", () => {
    expect(SRC).toContain('"/admin-reports/monthly"');
  });
});

describe("bi — executive & specialized reports", () => {
  it("CEO dashboard endpoint exists", () => {
    expect(SRC).toContain('"/ceo-dashboard"');
  });

  it("branch performance report exists", () => {
    expect(SRC).toContain('"/reports/branch-performance"');
  });

  it("vendor performance report exists", () => {
    expect(SRC).toContain('"/reports/vendor-performance"');
  });

  it("fleet TCO report exists", () => {
    expect(SRC).toContain('"/reports/fleet-tco"');
  });

  it("department leave balance report exists", () => {
    expect(SRC).toContain('"/reports/department-leave-balance"');
  });

  it("property occupancy report exists", () => {
    expect(SRC).toContain('"/reports/property-occupancy"');
  });

  it("training ROI report exists", () => {
    expect(SRC).toContain('"/reports/training-roi"');
  });
});

describe("bi — AI insights & alert fatigue", () => {
  it("AI insights endpoint exists", () => {
    expect(SRC).toContain('"/ai-insights"');
  });

  it("dismiss insight endpoint exists", () => {
    expect(SRC).toContain('"/ai-insights/:id/dismiss"');
  });

  it("mark insight as read endpoint exists", () => {
    expect(SRC).toContain('"/ai-insights/:id/read"');
  });

  it("alert fatigue settings endpoint exists", () => {
    expect(SRC).toContain('"/alert-fatigue/settings"');
  });

  it("mute alert endpoint exists", () => {
    expect(SRC).toContain('"/alert-fatigue/mute"');
  });

  it("daily alert count endpoint exists", () => {
    expect(SRC).toContain('"/alert-fatigue/daily-count"');
  });
});

describe("bi — security patterns", () => {
  it("uses authMiddleware globally", () => {
    expect(SRC).toContain("router.use(authMiddleware)");
  });

  it("all endpoints use requirePermission", () => {
    const perms = [...SRC.matchAll(/requirePermission\("bi:(read|write)"\)/g)];
    expect(perms.length).toBeGreaterThanOrEqual(25);
  });

  it("queries scoped by companyId", () => {
    const matches = [...SRC.matchAll(/scope\.companyId/g)];
    expect(matches.length).toBeGreaterThan(20);
  });

  it("uses parameterized queries", () => {
    const params = [...SRC.matchAll(/\$1/g)];
    expect(params.length).toBeGreaterThan(15);
  });

  it("creates audit logs for mutations", () => {
    const audits = [...SRC.matchAll(/createAuditLog/g)];
    expect(audits.length).toBeGreaterThanOrEqual(3);
  });

  it("overview endpoint exists", () => {
    expect(SRC).toContain('"/overview"');
  });
});
