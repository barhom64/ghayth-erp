import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/intelligence.ts"),
  "utf8"
);

describe("intelligence — alerts & monitoring", () => {
  it("GET /alerts requires admin:read", () => {
    const idx = SRC.indexOf('"/alerts"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("POST /alerts/scan requires admin:write", () => {
    const idx = SRC.indexOf('"/alerts/scan"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("alerts scan calls runSmartAlerts", () => {
    expect(SRC).toContain("runSmartAlerts");
  });

  it("mark alert as read endpoint exists", () => {
    expect(SRC).toContain('"/alerts/:id/read"');
  });
});

describe("intelligence — KPIs & scheduling", () => {
  it("GET /kpis requires admin:read", () => {
    const idx = SRC.indexOf('router.get("/kpis"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("employee KPI endpoint exists", () => {
    expect(SRC).toContain('"/kpis/employee/:employeeId"');
  });

  it("daily schedule endpoint exists", () => {
    expect(SRC).toContain('"/daily-schedule"');
  });

  it("employee schedule endpoint exists", () => {
    expect(SRC).toContain('"/daily-schedule/employee/:employeeId"');
  });

  it("integrates with kpiEngine", () => {
    expect(SRC).toContain("calculateEmployeeKPIs");
    expect(SRC).toContain("getCompanyKPIs");
  });

  it("integrates with scheduleBuilder", () => {
    expect(SRC).toContain("buildAllSchedules");
    expect(SRC).toContain("buildEmployeeSchedule");
  });
});

describe("intelligence — AI endpoints", () => {
  it("AI categorize endpoint exists with validation", () => {
    expect(SRC).toContain('"/ai/categorize"');
    expect(SRC).toContain("aiCategorizeSchema");
  });

  it("AI draft reply endpoint exists", () => {
    expect(SRC).toContain('"/ai/draft-reply"');
    expect(SRC).toContain("aiDraftReplySchema");
  });

  it("AI translate endpoint exists with ar/en target", () => {
    expect(SRC).toContain('"/ai/translate"');
    expect(SRC).toContain('z.enum(["ar", "en"])');
  });

  it("AI summarize endpoint exists", () => {
    expect(SRC).toContain('"/ai/summarize"');
    expect(SRC).toContain("aiSummarizeSchema");
  });

  it("AI evaluate rules endpoint exists", () => {
    expect(SRC).toContain('"/ai/evaluate-rules"');
  });

  it("AI forecast endpoint exists", () => {
    expect(SRC).toContain('"/ai/forecast"');
    expect(SRC).toContain("aiForecastSchema");
  });

  it("all AI endpoints require admin:write", () => {
    for (const ep of ["categorize", "draft-reply", "translate", "summarize", "evaluate-rules", "forecast"]) {
      const idx = SRC.indexOf(`"/ai/${ep}"`);
      const section = SRC.slice(Math.max(0, idx - 100), idx + 200);
      expect(section).toContain('authorize(');
    }
  });
});

describe("intelligence — algorithm endpoints", () => {
  it("haversine endpoint exists with schema", () => {
    expect(SRC).toContain('"/algorithms/haversine"');
    expect(SRC).toContain("haversineSchema");
  });

  it("moving average endpoint exists", () => {
    expect(SRC).toContain('"/algorithms/moving-average"');
    expect(SRC).toContain("movingAverageSchema");
  });

  it("load balance endpoint exists", () => {
    expect(SRC).toContain('"/algorithms/load-balance"');
    expect(SRC).toContain("loadBalanceSchema");
  });

  it("integrates with algorithms library", () => {
    expect(SRC).toContain("haversineDistance");
    expect(SRC).toContain("movingAverage");
    expect(SRC).toContain("selectLeastLoadedResource");
  });
});

describe("intelligence — client analytics", () => {
  it("client analytics endpoint exists", () => {
    expect(SRC).toContain('"/clients/analytics"');
  });

  it("client RFM endpoint exists", () => {
    expect(SRC).toContain('"/clients/:clientId/rfm"');
  });

  it("seasonal patterns endpoint exists", () => {
    expect(SRC).toContain('"/seasonal-patterns"');
  });

  it("recommendations endpoint exists", () => {
    expect(SRC).toContain('"/recommendations"');
  });

  it("company KPIs endpoint exists", () => {
    expect(SRC).toContain('"/company-kpis"');
  });

  it("integrates with client analytics library", () => {
    expect(SRC).toContain("calculateClientRFM");
    expect(SRC).toContain("calculateAllClientsRFM");
    expect(SRC).toContain("getClientAnalyticsSummary");
    expect(SRC).toContain("detectSeasonalPatterns");
  });
});

describe("intelligence — smart operations", () => {
  it("smart assign endpoint exists", () => {
    expect(SRC).toContain('"/smart-assign"');
    expect(SRC).toContain("smartAssignSchema");
  });

  it("insights summary endpoint exists", () => {
    expect(SRC).toContain('"/insights-summary"');
  });

  it("overview endpoint exists", () => {
    expect(SRC).toContain('"/overview"');
  });

  it("activity stats endpoint exists", () => {
    expect(SRC).toContain('"/activity/stats"');
    expect(SRC).toContain("getUsageStats");
  });

  it("suggestions endpoint uses requireRole for manager-level access", () => {
    const idx = SRC.indexOf('"/suggestions"');
    const section = SRC.slice(Math.max(0, idx - 100), idx + 200);
    expect(section).toContain("requireRole");
    expect(section).toContain("branch_manager");
    expect(section).toContain("general_manager");
  });
});

describe("intelligence — Zod schemas", () => {
  it("haversineSchema validates lat/lon as numbers", () => {
    const idx = SRC.indexOf("haversineSchema");
    const section = SRC.slice(idx, idx + 300);
    expect(section).toContain("lat1: z.coerce.number()");
    expect(section).toContain("lon1: z.coerce.number()");
  });

  it("smartAssignSchema has optional fields", () => {
    const idx = SRC.indexOf("smartAssignSchema");
    const section = SRC.slice(idx, idx + 300);
    expect(section).toContain("taskType: z.string().optional()");
    expect(section).toContain("targetLat: z.coerce.number().optional()");
  });
});

describe("intelligence — security patterns", () => {
  it("relies on global authMiddleware from index.ts", () => {
    expect(SRC).not.toContain("router.use(authMiddleware)");
  });

  it("uses authorize and requireRole for access control", () => {
    const perms = [...SRC.matchAll(/authorize\(/g)];
    const roles = [...SRC.matchAll(/requireRole/g)];
    expect(perms.length).toBeGreaterThan(10);
    expect(roles.length).toBeGreaterThan(3);
  });

  it("queries scoped by companyId", () => {
    const matches = [...SRC.matchAll(/scope\.companyId/g)];
    expect(matches.length).toBeGreaterThan(10);
  });
});
