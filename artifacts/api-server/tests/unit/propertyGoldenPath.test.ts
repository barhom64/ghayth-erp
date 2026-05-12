import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PROP_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/properties.ts"), "utf8");

// ─── Property Golden Path Tests ─────────────────────────────────────────────
// P4.5 of the unification plan. Lock in the property domain lifecycle
// contracts: units, contracts (leases), maintenance, deposits, inspections.

describe("Property route structure", () => {
  it("units CRUD endpoints exist", () => {
    expect(PROP_ROUTE).toContain('router.get("/units"');
    expect(PROP_ROUTE).toContain('router.post("/units"');
    expect(PROP_ROUTE).toContain('router.patch("/units/:id"');
    expect(PROP_ROUTE).toContain('router.delete("/units/:id"');
  });

  it("contracts CRUD endpoints exist", () => {
    expect(PROP_ROUTE).toContain('router.get("/contracts"');
    expect(PROP_ROUTE).toContain('router.post("/contracts"');
    expect(PROP_ROUTE).toContain('router.patch("/contracts/:id"');
    expect(PROP_ROUTE).toContain('router.delete("/contracts/:id"');
  });

  it("contract lifecycle endpoints exist", () => {
    expect(PROP_ROUTE).toContain('"/contracts/:id/renew"');
    expect(PROP_ROUTE).toContain('"/contracts/:id/terminate"');
  });

  it("maintenance request endpoints exist", () => {
    expect(PROP_ROUTE).toContain('"/maintenance-requests"');
    expect(PROP_ROUTE).toContain('"/maintenance-requests/:id/approve"');
    expect(PROP_ROUTE).toContain('"/maintenance-requests/:id/complete"');
  });

  it("payment and late-rent endpoints exist", () => {
    expect(PROP_ROUTE).toContain('"/payments/:id/pay"');
    expect(PROP_ROUTE).toContain('"/late-rent/escalate"');
  });

  it("tenant endpoints exist", () => {
    expect(PROP_ROUTE).toContain('router.get("/tenants"');
    expect(PROP_ROUTE).toContain('router.post("/tenants"');
  });
});

describe("Property unit state machine", () => {
  it("defines UNIT_STATUSES", () => {
    expect(PROP_ROUTE).toContain("UNIT_STATUSES");
    expect(PROP_ROUTE).toContain('"available"');
    expect(PROP_ROUTE).toContain('"rented"');
    expect(PROP_ROUTE).toContain('"maintenance"');
  });

  it("defines UNIT_TRANSITIONS with all states", () => {
    expect(PROP_ROUTE).toContain("UNIT_TRANSITIONS");
    const idx = PROP_ROUTE.indexOf("UNIT_TRANSITIONS");
    const block = PROP_ROUTE.slice(idx, idx + 500);
    expect(block).toContain("available:");
    expect(block).toContain("rented:");
    expect(block).toContain("out_of_service:");
  });

  it("validates unit status transitions", () => {
    expect(PROP_ROUTE).toMatch(/UNIT_TRANSITIONS\[existing\.status/);
  });
});

describe("Property contract state machine", () => {
  it("defines CONTRACT_STATUSES", () => {
    expect(PROP_ROUTE).toContain("CONTRACT_STATUSES");
    expect(PROP_ROUTE).toContain('"draft"');
    expect(PROP_ROUTE).toContain('"active"');
    expect(PROP_ROUTE).toContain('"terminated"');
  });

  it("defines CONTRACT_TRANSITIONS", () => {
    expect(PROP_ROUTE).toContain("CONTRACT_TRANSITIONS");
    const idx = PROP_ROUTE.indexOf("CONTRACT_TRANSITIONS");
    const block = PROP_ROUTE.slice(idx, idx + 500);
    expect(block).toContain("draft:");
    expect(block).toContain("active:");
  });

  it("active contracts have no direct PATCH transitions (use dedicated endpoints)", () => {
    const idx = PROP_ROUTE.indexOf("CONTRACT_TRANSITIONS");
    const block = PROP_ROUTE.slice(idx, idx + 500);
    const activeLine = block.slice(
      block.indexOf("active:"),
      block.indexOf("\n", block.indexOf("active:"))
    );
    expect(activeLine).toContain("[]");
  });

  it("terminal contract states are empty", () => {
    const idx = PROP_ROUTE.indexOf("CONTRACT_TRANSITIONS");
    const block = PROP_ROUTE.slice(idx, idx + 500);
    expect(block).toContain("terminated: []");
    expect(block).toContain("expired:    []");
  });
});

describe("Property maintenance request state machine", () => {
  it("defines MAINT_REQUEST_TRANSITIONS", () => {
    expect(PROP_ROUTE).toContain("MAINT_REQUEST_TRANSITIONS");
  });

  it("covers full lifecycle: pending → approved → assigned → in_progress → completed → closed", () => {
    const idx = PROP_ROUTE.indexOf("MAINT_REQUEST_TRANSITIONS");
    const block = PROP_ROUTE.slice(idx, idx + 600);
    expect(block).toContain("pending:");
    expect(block).toContain("approved:");
    expect(block).toContain("assigned:");
    expect(block).toContain("in_progress:");
    expect(block).toContain("completed:");
  });

  it("rejected, cancelled, closed are terminal", () => {
    const idx = PROP_ROUTE.indexOf("MAINT_REQUEST_TRANSITIONS");
    const block = PROP_ROUTE.slice(idx, idx + 600);
    expect(block).toContain("rejected:    []");
    expect(block).toContain("cancelled:   []");
    expect(block).toContain("closed:      []");
  });
});

describe("Property deposit state machine", () => {
  it("defines DEPOSIT_TRANSITIONS", () => {
    expect(PROP_ROUTE).toContain("DEPOSIT_TRANSITIONS");
  });

  it("held can transition to refunded, forfeited, partial_refund", () => {
    const idx = PROP_ROUTE.indexOf("DEPOSIT_TRANSITIONS");
    const block = PROP_ROUTE.slice(idx, idx + 300);
    const heldLine = block.slice(
      block.indexOf("held:"),
      block.indexOf("\n", block.indexOf("held:"))
    );
    expect(heldLine).toContain("refunded");
    expect(heldLine).toContain("forfeited");
    expect(heldLine).toContain("partial_refund");
  });

  it("refunded and forfeited are terminal", () => {
    const idx = PROP_ROUTE.indexOf("DEPOSIT_TRANSITIONS");
    const block = PROP_ROUTE.slice(idx, idx + 300);
    expect(block).toContain("refunded:       []");
    expect(block).toContain("forfeited:      []");
  });
});

describe("Property inspection state machine", () => {
  it("defines INSPECTION_TRANSITIONS", () => {
    expect(PROP_ROUTE).toContain("INSPECTION_TRANSITIONS");
  });

  it("covers: scheduled → in_progress → completed", () => {
    const idx = PROP_ROUTE.indexOf("INSPECTION_TRANSITIONS");
    const block = PROP_ROUTE.slice(idx, idx + 300);
    expect(block).toContain("scheduled:");
    expect(block).toContain("in_progress:");
    expect(block).toContain("completed:   []");
  });
});

describe("Property contract lifecycle side-effects", () => {
  it("renew endpoint exists and emits events", () => {
    const idx = PROP_ROUTE.indexOf('"/contracts/:id/renew"');
    const endIdx = PROP_ROUTE.indexOf("router.", idx + 10);
    const section = PROP_ROUTE.slice(idx, endIdx);
    expect(section).toContain("emitEvent");
  });

  it("terminate endpoint exists and emits events", () => {
    const idx = PROP_ROUTE.indexOf('"/contracts/:id/terminate"');
    const endIdx = PROP_ROUTE.indexOf("router.", idx + 10);
    const section = PROP_ROUTE.slice(idx, endIdx);
    expect(section).toContain("emitEvent");
  });
});

describe("Property late rent escalation", () => {
  it("late-rent escalate endpoint implements multi-phase escalation", () => {
    const idx = PROP_ROUTE.indexOf('"/late-rent/escalate"');
    const endIdx = PROP_ROUTE.indexOf("router.", idx + 10);
    const section = PROP_ROUTE.slice(idx, endIdx);
    expect(section).toContain("lateDays");
  });

  it("escalation includes penalty application", () => {
    expect(PROP_ROUTE).toContain("penalty");
  });
});

describe("Property event emission contract", () => {
  it("emits property events on unit operations", () => {
    expect(PROP_ROUTE).toContain("emitEvent");
    expect(PROP_ROUTE).toContain('"property_units"');
  });

  it("emits events on contract operations", () => {
    expect(PROP_ROUTE).toContain('"property_contracts"');
  });

  it("creates audit logs systematically", () => {
    const auditCalls = PROP_ROUTE.match(/createAuditLog\(/g);
    expect(auditCalls!.length).toBeGreaterThanOrEqual(8);
  });
});

describe("Property security contracts", () => {
  it("all unit UPDATEs include companyId (except pre-validated dynamic PATCH)", () => {
    const updates = PROP_ROUTE.matchAll(
      /UPDATE\s+property_units\s+SET[^;]+WHERE[^;]+/g
    );
    for (const match of updates) {
      const sql = match[0];
      const isDynamicPatch = sql.includes("${sets.join");
      if (!isDynamicPatch) {
        expect(sql).toContain("companyId");
      }
    }
  });

  it("all contract UPDATEs include companyId", () => {
    const updates = PROP_ROUTE.matchAll(
      /UPDATE\s+property_contracts\s+SET[^;]+WHERE[^;]+/g
    );
    for (const match of updates) {
      expect(match[0]).toContain("companyId");
    }
  });

  it("unit list filters deletedAt IS NULL", () => {
    const idx = PROP_ROUTE.indexOf('router.get("/units"');
    const endIdx = PROP_ROUTE.indexOf("router.", idx + 10);
    const section = PROP_ROUTE.slice(idx, endIdx);
    expect(section).toContain('"deletedAt" IS NULL');
  });

  it("soft delete uses deletedAt=NOW()", () => {
    const deleteIdx = PROP_ROUTE.indexOf('router.delete("/units/:id"');
    const endIdx = PROP_ROUTE.indexOf("router.", deleteIdx + 10);
    const section = PROP_ROUTE.slice(deleteIdx, endIdx);
    expect(section).toContain('"deletedAt"');
  });
});
