import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/governance.ts"),
  "utf8"
);

describe("governance — policy management", () => {
  it("GET /policies requires governance:read", () => {
    const idx = SRC.indexOf('"/policies"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("governance:read")');
  });

  it("POST /policies requires governance:write", () => {
    const idx = SRC.indexOf('router.post("/policies"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("governance:write")');
  });

  it("GET /policies/:id requires governance:read", () => {
    const idx = SRC.indexOf('"/policies/:id"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("governance:read")');
  });

  it("PATCH /policies/:id requires governance:write", () => {
    const idx = SRC.indexOf('router.patch("/policies/:id"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("governance:write")');
  });

  it("DELETE /policies/:id requires governance:write", () => {
    const idx = SRC.indexOf('router.delete("/policies/:id"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("governance:write")');
  });

  it("policy versioning endpoint exists", () => {
    expect(SRC).toContain('"/policies/:id/new-version"');
  });

  it("module links endpoint exists", () => {
    expect(SRC).toContain('"/policies/:id/module-links"');
  });

  it("module policies endpoint exists", () => {
    expect(SRC).toContain('"/module-policies/:module"');
  });
});

describe("governance — Zod validation", () => {
  it("createPolicySchema requires title", () => {
    const idx = SRC.indexOf("createPolicySchema");
    const section = SRC.slice(idx, idx + 400);
    expect(section).toContain('title: z.string().min(1');
  });

  it("createRiskSchema requires title and validates severity enum", () => {
    const idx = SRC.indexOf("createRiskSchema");
    const section = SRC.slice(idx, idx + 500);
    expect(section).toContain('title: z.string().min(1');
    expect(section).toContain('z.enum(["low", "medium", "high", "critical"])');
  });

  it("uses safeParse for validation", () => {
    expect(SRC).toContain(".safeParse(req.body)");
  });
});

describe("governance — risk management", () => {
  it("GET /risks requires governance:read", () => {
    const idx = SRC.indexOf('"/risks"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("governance:read")');
  });

  it("POST /risks requires governance:write", () => {
    const idx = SRC.indexOf('router.post("/risks"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("governance:write")');
  });

  it("risk treatment endpoint exists", () => {
    expect(SRC).toContain('"/risks/:id/treatment"');
  });
});

describe("governance — audit management", () => {
  it("GET /audits requires governance:read", () => {
    const idx = SRC.indexOf('"/audits"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("governance:read")');
  });

  it("full CRUD for audits (get, post, get/:id, patch, delete)", () => {
    expect(SRC).toContain('router.get("/audits"');
    expect(SRC).toContain('router.post("/audits"');
    expect(SRC).toContain('router.get("/audits/:id"');
    expect(SRC).toContain('router.patch("/audits/:id"');
    expect(SRC).toContain('router.delete("/audits/:id"');
  });
});

describe("governance — compliance", () => {
  it("full CRUD for compliance items", () => {
    expect(SRC).toContain('router.get("/compliance"');
    expect(SRC).toContain('router.post("/compliance"');
    expect(SRC).toContain('router.get("/compliance/:id"');
    expect(SRC).toContain('router.patch("/compliance/:id"');
    expect(SRC).toContain('router.delete("/compliance/:id"');
  });

  it("compliance dashboard endpoint exists", () => {
    expect(SRC).toContain('"/compliance-dashboard"');
  });

  it("compliance actions CRUD exists", () => {
    expect(SRC).toContain('"/compliance-actions"');
    expect(SRC).toContain('router.post("/compliance-actions"');
    expect(SRC).toContain('"/compliance-actions/:actionId"');
  });

  it("policy-level compliance actions exist", () => {
    expect(SRC).toContain('"/policies/:id/compliance-actions"');
  });
});

describe("governance — CAPA (corrective/preventive actions)", () => {
  it("GET /capa requires governance:read", () => {
    const idx = SRC.indexOf('"/capa"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("governance:read")');
  });

  it("POST /capa requires governance:write", () => {
    const idx = SRC.indexOf('router.post("/capa"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("governance:write")');
  });

  it("PATCH /capa/:id requires governance:write", () => {
    const idx = SRC.indexOf('"/capa/:id"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("governance:write")');
  });
});

describe("governance — stats & dashboard", () => {
  it("GET /stats requires governance:read", () => {
    const idx = SRC.indexOf('"/stats"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("governance:read")');
  });
});

describe("governance — security patterns", () => {
  it("relies on global authMiddleware from index.ts", () => {
    expect(SRC).not.toContain("router.use(authMiddleware)");
  });

  it("scopes queries by companyId", () => {
    const matches = [...SRC.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(30);
  });

  it("uses parameterized queries ($1, $2)", () => {
    const paramQueries = [...SRC.matchAll(/\$\d/g)];
    expect(paramQueries.length).toBeGreaterThan(40);
  });

  it("creates audit logs for mutations", () => {
    const audits = [...SRC.matchAll(/createAuditLog/g)];
    expect(audits.length).toBeGreaterThanOrEqual(5);
  });

  it("emits events for mutations", () => {
    const events = [...SRC.matchAll(/emitEvent/g)];
    expect(events.length).toBeGreaterThanOrEqual(5);
  });

  it("uses lifecycle engine for state transitions", () => {
    expect(SRC).toContain("applyTransition");
  });
});
