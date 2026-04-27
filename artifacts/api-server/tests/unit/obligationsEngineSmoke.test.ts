import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib/obligationsEngine.ts"),
  "utf8"
);

// ── Exports ───────────────────────────────────────────────────────────────

describe("obligationsEngine — exported functions", () => {
  it("exports ensureObligationsTable", () => {
    expect(SRC).toContain("export async function ensureObligationsTable");
  });

  it("exports registerObligation", () => {
    expect(SRC).toContain("export async function registerObligation");
  });

  it("exports markObligationMet", () => {
    expect(SRC).toContain("export async function markObligationMet");
  });

  it("exports cancelObligation", () => {
    expect(SRC).toContain("export async function cancelObligation");
  });

  it("exports scanObligations", () => {
    expect(SRC).toContain("export async function scanObligations");
  });

  it("exports queryObligations", () => {
    expect(SRC).toContain("export async function queryObligations");
  });

  it("exports obligationSummary", () => {
    expect(SRC).toContain("export async function obligationSummary");
  });
});

// ── Obligation types ──────────────────────────────────────────────────────

describe("obligationsEngine — obligation types", () => {
  for (const t of ["payment", "renewal", "maintenance", "hearing", "document_expiry", "approval", "delivery", "inspection", "declaration", "follow_up"]) {
    it(`supports obligation type: ${t}`, () => {
      expect(SRC).toContain(`"${t}"`);
    });
  }
});

// ── Lifecycle statuses ────────────────────────────────────────────────────

describe("obligationsEngine — lifecycle statuses", () => {
  for (const s of ["pending", "met", "breached", "escalated_l1", "escalated_l2", "closed", "cancelled"]) {
    it(`supports status: ${s}`, () => {
      expect(SRC).toContain(`"${s}"`);
    });
  }
});

// ── Registration input ────────────────────────────────────────────────────

describe("obligationsEngine — RegisterObligationInput", () => {
  it("exports RegisterObligationInput interface", () => {
    expect(SRC).toContain("export interface RegisterObligationInput");
  });

  it("requires companyId", () => {
    expect(SRC).toContain("companyId: number");
  });

  it("requires entityType and entityId", () => {
    expect(SRC).toContain("entityType: string");
    expect(SRC).toContain("entityId: number");
  });

  it("requires dueAt", () => {
    expect(SRC).toContain("dueAt:");
  });

  it("supports dedupeKey for idempotency", () => {
    expect(SRC).toContain("dedupeKey");
  });

  it("supports escalationSteps", () => {
    expect(SRC).toContain("escalationSteps");
  });
});

// ── Event emission ────────────────────────────────────────────────────────

describe("obligationsEngine — event emission", () => {
  it("emits obligation.breached events", () => {
    expect(SRC).toContain("obligation.breached");
  });

  it("uses emitEvent or createNotification", () => {
    expect(SRC).toContain("emitEvent");
  });
});

// ── Table creation ────────────────────────────────────────────────────────

describe("obligationsEngine — lazy table creation", () => {
  it("creates obligations table if missing", () => {
    expect(SRC).toContain("CREATE TABLE IF NOT EXISTS obligations");
  });

  it("uses lazy initialization flag", () => {
    expect(SRC).toContain("obligationsTableEnsured");
  });
});

// ── Security ──────────────────────────────────────────────────────────────

describe("obligationsEngine — security", () => {
  it("uses parameterized queries", () => {
    const params = [...SRC.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(10);
  });

  it("scopes by companyId", () => {
    const matches = [...SRC.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(10);
  });
});
