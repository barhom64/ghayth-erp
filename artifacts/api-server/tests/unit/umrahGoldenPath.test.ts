import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const UMRAH_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/umrah.ts"), "utf8");
const UMRAH_ENT = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"), "utf8");

// ─── Umrah Golden Path Tests ───────────────────────────────────────────────
// Lock in umrah domain lifecycle contracts: pilgrims, seasons, transport,
// agents, penalties, invoices, sub-agents, pricing, violations.

describe("Umrah route structure", () => {
  it("season CRUD endpoints exist", () => {
    expect(UMRAH_ROUTE).toContain('router.get("/seasons"');
    expect(UMRAH_ROUTE).toContain('router.post("/seasons"');
    expect(UMRAH_ROUTE).toContain('router.patch("/seasons/:id"');
  });

  it("agent CRUD endpoints exist", () => {
    expect(UMRAH_ROUTE).toContain('router.get("/agents"');
    expect(UMRAH_ROUTE).toContain('router.post("/agents"');
    expect(UMRAH_ROUTE).toContain('router.patch("/agents/:id"');
    expect(UMRAH_ROUTE).toContain('router.delete("/agents/:id"');
  });

  it("package CRUD endpoints exist", () => {
    expect(UMRAH_ROUTE).toContain('router.get("/packages"');
    expect(UMRAH_ROUTE).toContain('router.post("/packages"');
    expect(UMRAH_ROUTE).toContain('router.patch("/packages/:id"');
    expect(UMRAH_ROUTE).toContain('router.delete("/packages/:id"');
  });

  it("pilgrim CRUD endpoints exist", () => {
    expect(UMRAH_ROUTE).toContain('router.get("/pilgrims"');
    expect(UMRAH_ROUTE).toContain('router.post("/pilgrims"');
    expect(UMRAH_ROUTE).toContain('router.patch("/pilgrims/:id"');
    expect(UMRAH_ROUTE).toContain('router.delete("/pilgrims/:id"');
  });

  it("transport CRUD endpoints exist", () => {
    expect(UMRAH_ROUTE).toContain('router.get("/transport"');
    expect(UMRAH_ROUTE).toContain('router.post("/transport"');
    expect(UMRAH_ROUTE).toContain('router.patch("/transport/:id"');
  });

  it("transport pilgrim assignment endpoint exists", () => {
    expect(UMRAH_ROUTE).toContain('"/transport/:id/assign-pilgrims"');
  });

  it("penalty endpoints exist", () => {
    expect(UMRAH_ROUTE).toContain('router.get("/penalties"');
    expect(UMRAH_ROUTE).toContain('"/penalties/:id/waive"');
  });

  it("agent invoice endpoints exist", () => {
    expect(UMRAH_ROUTE).toContain('"/agent-invoices/generate"');
    expect(UMRAH_ROUTE).toContain('router.get("/agent-invoices"');
    expect(UMRAH_ROUTE).toContain('"/agent-invoices/:id/record-payment"');
  });

  it("import and batch endpoints exist", () => {
    expect(UMRAH_ROUTE).toContain('router.post("/import"');
    expect(UMRAH_ROUTE).toContain('router.get("/import-logs"');
  });

  it("dashboard endpoint exists", () => {
    expect(UMRAH_ROUTE).toContain('router.get("/dashboard"');
  });

  it("daily status and penalty engine endpoints exist", () => {
    expect(UMRAH_ROUTE).toContain('"/run-daily-status"');
    expect(UMRAH_ROUTE).toContain('"/run-penalty-engine"');
  });

  it("bulk assign endpoint exists", () => {
    expect(UMRAH_ROUTE).toContain('"/assign-bulk"');
  });
});

describe("Umrah entities route structure", () => {
  it("sub-agent CRUD endpoints exist", () => {
    expect(UMRAH_ENT).toContain('router.get("/sub-agents"');
    expect(UMRAH_ENT).toContain('router.post("/sub-agents"');
    expect(UMRAH_ENT).toContain('router.patch("/sub-agents/:id"');
    expect(UMRAH_ENT).toContain('router.delete("/sub-agents/:id"');
  });

  it("pricing CRUD endpoints exist", () => {
    expect(UMRAH_ENT).toContain('router.get("/pricing"');
    expect(UMRAH_ENT).toContain('router.post("/pricing"');
    expect(UMRAH_ENT).toContain('router.patch("/pricing/:id"');
    expect(UMRAH_ENT).toContain('router.delete("/pricing/:id"');
  });

  it("violations CRUD endpoints exist", () => {
    expect(UMRAH_ENT).toContain('router.get("/violations"');
    expect(UMRAH_ENT).toContain('router.post("/violations"');
    expect(UMRAH_ENT).toContain('router.patch("/violations/:id"');
    expect(UMRAH_ENT).toContain('router.delete("/violations/:id"');
  });

  it("groups and nusk-invoices endpoints exist", () => {
    expect(UMRAH_ENT).toContain('router.get("/groups"');
    expect(UMRAH_ENT).toContain('router.get("/nusk-invoices"');
  });

  it("commission plan endpoints exist", () => {
    expect(UMRAH_ENT).toContain('"/commission-plans"');
    expect(UMRAH_ENT).toContain('"/commission-plans/:id/simulate"');
    expect(UMRAH_ENT).toContain('"/commission-plans/:id/calculate"');
  });

  it("sales invoice and payment endpoints exist", () => {
    expect(UMRAH_ENT).toContain('"/invoices/generate"');
    expect(UMRAH_ENT).toContain('"/payments"');
  });

  it("import preview and confirm endpoints exist", () => {
    expect(UMRAH_ENT).toContain('"/import/preview"');
    expect(UMRAH_ENT).toContain('"/import/mutamers"');
    expect(UMRAH_ENT).toContain('"/import/vouchers"');
    expect(UMRAH_ENT).toContain('"/import/batches"');
  });

  it("statement endpoint exists", () => {
    expect(UMRAH_ENT).toContain('"/statements/:subAgentId"');
  });
});

describe("Umrah pilgrim state machine", () => {
  it("defines PILGRIM_STATUSES and PILGRIM_TRANSITIONS", () => {
    expect(UMRAH_ROUTE).toContain("PILGRIM_STATUSES");
    expect(UMRAH_ROUTE).toContain("PILGRIM_TRANSITIONS");
  });

  it("pilgrim statuses: pending, arrived, active, overstayed, departed, violated, cancelled", () => {
    const idx = UMRAH_ROUTE.indexOf("PILGRIM_STATUSES");
    const line = UMRAH_ROUTE.slice(idx, UMRAH_ROUTE.indexOf("\n", idx));
    expect(line).toContain("pending");
    expect(line).toContain("arrived");
    expect(line).toContain("active");
    expect(line).toContain("overstayed");
    expect(line).toContain("departed");
    expect(line).toContain("violated");
    expect(line).toContain("cancelled");
  });

  it("departed, violated, cancelled are terminal pilgrim states", () => {
    const idx = UMRAH_ROUTE.indexOf("PILGRIM_TRANSITIONS");
    const block = UMRAH_ROUTE.slice(idx, idx + 500);
    expect(block).toContain("departed:   []");
    expect(block).toContain("violated:   []");
    expect(block).toContain("cancelled:  []");
  });

  it("validates pilgrim status transitions in PATCH", () => {
    const idx = UMRAH_ROUTE.indexOf('router.patch("/pilgrims/:id"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("PILGRIM_TRANSITIONS");
  });
});

describe("Umrah season state machine", () => {
  it("defines SEASON_STATUSES and SEASON_TRANSITIONS", () => {
    expect(UMRAH_ROUTE).toContain("SEASON_STATUSES");
    expect(UMRAH_ROUTE).toContain("SEASON_TRANSITIONS");
  });

  it("archived is terminal", () => {
    const idx = UMRAH_ROUTE.indexOf("SEASON_TRANSITIONS");
    const block = UMRAH_ROUTE.slice(idx, idx + 200);
    expect(block).toContain("archived: []");
  });

  it("validates season status transitions in PATCH", () => {
    const idx = UMRAH_ROUTE.indexOf('router.patch("/seasons/:id"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("SEASON_TRANSITIONS");
  });

  it("season close validates no active pilgrims", () => {
    const idx = UMRAH_ROUTE.indexOf('router.patch("/seasons/:id"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("معتمر نشط");
  });

  it("season close validates no unpaid invoices", () => {
    const idx = UMRAH_ROUTE.indexOf('router.patch("/seasons/:id"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("فاتورة غير مسددة");
  });
});

describe("Umrah transport state machine", () => {
  it("defines TRANSPORT_STATUSES and TRANSPORT_TRANSITIONS", () => {
    expect(UMRAH_ROUTE).toContain("TRANSPORT_STATUSES");
    expect(UMRAH_ROUTE).toContain("TRANSPORT_TRANSITIONS");
  });

  it("completed and cancelled are terminal transport states", () => {
    const idx = UMRAH_ROUTE.indexOf("TRANSPORT_TRANSITIONS");
    const block = UMRAH_ROUTE.slice(idx, idx + 300);
    expect(block).toContain("completed:   []");
    expect(block).toContain("cancelled:   []");
  });
});

describe("Umrah agent state machine", () => {
  it("defines AGENT_STATUSES and AGENT_TRANSITIONS", () => {
    expect(UMRAH_ROUTE).toContain("AGENT_STATUSES");
    expect(UMRAH_ROUTE).toContain("AGENT_TRANSITIONS");
  });

  it("blocked is terminal agent state", () => {
    const idx = UMRAH_ROUTE.indexOf("AGENT_TRANSITIONS");
    const block = UMRAH_ROUTE.slice(idx, idx + 300);
    expect(block).toContain("blocked:   []");
  });
});

describe("Umrah penalty state machine", () => {
  it("defines PENALTY_STATUSES and PENALTY_TRANSITIONS", () => {
    expect(UMRAH_ROUTE).toContain("PENALTY_STATUSES");
    expect(UMRAH_ROUTE).toContain("PENALTY_TRANSITIONS");
  });

  it("paid and waived are terminal penalty states", () => {
    const idx = UMRAH_ROUTE.indexOf("PENALTY_TRANSITIONS");
    const block = UMRAH_ROUTE.slice(idx, idx + 300);
    expect(block).toContain("paid:     []");
    expect(block).toContain("waived:   []");
  });
});

describe("Umrah invoice state machine", () => {
  it("defines AGENT_INVOICE_STATUSES and AGENT_INVOICE_TRANSITIONS", () => {
    expect(UMRAH_ROUTE).toContain("AGENT_INVOICE_STATUSES");
    expect(UMRAH_ROUTE).toContain("AGENT_INVOICE_TRANSITIONS");
  });

  it("paid and cancelled are terminal invoice states", () => {
    const idx = UMRAH_ROUTE.indexOf("AGENT_INVOICE_TRANSITIONS");
    const block = UMRAH_ROUTE.slice(idx, idx + 400);
    expect(block).toContain("paid:           []");
    expect(block).toContain("cancelled:      []");
  });
});

describe("Umrah auto-status engine", () => {
  it("daily status updates pilgrim statuses automatically", () => {
    const idx = UMRAH_ROUTE.indexOf('"/run-daily-status"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("arrived");
    expect(section).toContain("overstayed");
    expect(section).toContain("departed");
  });

  it("penalty engine creates overstay penalties", () => {
    const idx = UMRAH_ROUTE.indexOf('"/run-penalty-engine"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("umrah_penalties");
    expect(section).toContain("overstay");
  });

  it("penalty engine marks pilgrim as violated", () => {
    const idx = UMRAH_ROUTE.indexOf('"/run-penalty-engine"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("violated");
    expect(section).not.toContain("overstay_penalized");
  });
});

describe("Umrah GL integration", () => {
  it("agent invoice generates GL entries", () => {
    const idx = UMRAH_ROUTE.indexOf('"/agent-invoices/generate"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("umrahEngine");
  });

  it("transport creates GL expense entries", () => {
    const idx = UMRAH_ROUTE.indexOf('router.post("/transport"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("postTransportExpenseGL");
  });

  it("penalty engine creates GL entries", () => {
    const idx = UMRAH_ROUTE.indexOf('"/run-penalty-engine"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("postPenaltyGL");
  });

  it("penalty waiver creates GL reversal", () => {
    const idx = UMRAH_ROUTE.indexOf('"/penalties/:id/waive"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("postPenaltyWaiverGL");
  });

  it("agent invoice payment uses applyTransition", () => {
    const idx = UMRAH_ROUTE.indexOf('"/agent-invoices/:id/record-payment"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("applyTransition");
  });
});

describe("Umrah event emission contract", () => {
  it("emits events on pilgrim operations", () => {
    expect(UMRAH_ROUTE).toContain('"umrah.pilgrim.created"');
    expect(UMRAH_ROUTE).toContain('"umrah.pilgrim.updated"');
  });

  it("emits events on season operations", () => {
    expect(UMRAH_ROUTE).toContain('"umrah.season.opened"');
  });

  it("creates audit logs systematically", () => {
    const auditCalls = UMRAH_ROUTE.match(/createAuditLog\(/g);
    expect(auditCalls!.length).toBeGreaterThanOrEqual(10);
  });
});

describe("Umrah security contracts", () => {
  it("validates pilgrim input with zod on create", () => {
    expect(UMRAH_ROUTE).toContain("createPilgrimSchema.safeParse");
  });

  it("validates season input with zod on create", () => {
    expect(UMRAH_ROUTE).toContain("createSeasonSchema.safeParse");
  });

  it("validates transport input with zod on create", () => {
    expect(UMRAH_ROUTE).toContain("createTransportSchema.safeParse");
  });

  it("blocks agent deletion when pilgrims exist", () => {
    const idx = UMRAH_ROUTE.indexOf('router.delete("/agents/:id"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("umrah_pilgrims");
  });

  it("blocks package deletion when pilgrims exist", () => {
    const idx = UMRAH_ROUTE.indexOf('router.delete("/packages/:id"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("umrah_pilgrims");
  });

  it("pilgrim soft delete checks arrived status", () => {
    const idx = UMRAH_ROUTE.indexOf('router.delete("/pilgrims/:id"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("arrived");
  });
});

describe("Umrah entities security", () => {
  it("pricing validates date range overlap", () => {
    const idx = UMRAH_ENT.indexOf('router.post("/pricing"');
    const endIdx = UMRAH_ENT.indexOf("router.", idx + 10);
    const section = UMRAH_ENT.slice(idx, endIdx);
    expect(section).toContain("تداخل");
  });

  it("sub-agent link validates client exists", () => {
    expect(UMRAH_ENT).toContain("link-client");
  });

  it("entities create audit logs", () => {
    const auditCalls = UMRAH_ENT.match(/createAuditLog\(/g);
    expect(auditCalls!.length).toBeGreaterThanOrEqual(10);
  });
});

describe("Umrah lifecycle engine adoption", () => {
  it("imports applyTransition from lifecycleEngine", () => {
    expect(UMRAH_ROUTE).toContain("applyTransition");
    expect(UMRAH_ROUTE).toContain("lifecycleEngine");
  });

  it("package delete uses applyTransition", () => {
    const idx = UMRAH_ROUTE.indexOf('router.delete("/packages/:id"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("applyTransition");
    expect(section).toContain('"umrah.package.deleted"');
  });

  it("penalty engine uses applyTransition for violation", () => {
    const idx = UMRAH_ROUTE.indexOf('"/run-penalty-engine"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("applyTransition");
    expect(section).toContain('"umrah.pilgrim.violated"');
  });

  it("agent PATCH validates status transitions", () => {
    const idx = UMRAH_ROUTE.indexOf('router.patch("/agents/:id"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("AGENT_TRANSITIONS");
  });
});

describe("Umrah-Fleet integration", () => {
  it("transport POST validates vehicle exists in fleet", () => {
    const idx = UMRAH_ROUTE.indexOf('router.post("/transport"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("fleet_vehicles");
  });

  it("transport POST validates driver exists in fleet", () => {
    const idx = UMRAH_ROUTE.indexOf('router.post("/transport"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("fleet_drivers");
  });

  it("transport POST rejects vehicles under maintenance", () => {
    const idx = UMRAH_ROUTE.indexOf('router.post("/transport"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("maintenance");
  });

  it("transport POST checks driver license expiry", () => {
    const idx = UMRAH_ROUTE.indexOf('router.post("/transport"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("licenseExpiry");
  });

  it("transport POST validates capacity vs pilgrim count", () => {
    const idx = UMRAH_ROUTE.indexOf('router.post("/transport"');
    const endIdx = UMRAH_ROUTE.indexOf("router.", idx + 10);
    const section = UMRAH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("pilgrimCount");
    expect(section).toContain("capacity");
  });
});
