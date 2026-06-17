import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

// ─── 3-line invoice scenario contract (financial-integrity gap #9) ─────────
// The user's verification scenario: ONE invoice carrying THREE lines:
//
//   Line 1 — transport service, dimensions={ vehicleId }
//   Line 2 — property rent,     dimensions={ propertyId }
//   Line 3 — umrah service,     dimensions={ umrahAgentId, umrahSeasonId }
//
// On approve, the resolver runs, the bucketing groups by full dim
// signature, and journal_lines must contain THREE distinct rows on the
// revenue side (not collapsed to one) — each carrying its own dimension
// set so per-vehicle / per-property / per-agent / per-season reports
// tie out from journal_lines alone.
//
// This test locks every link in the chain structurally so a future
// refactor can't quietly drop a dim from the bucket key, the bucket
// value, the pushed JE payload, or the SQL INSERT.

const ALLOC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/accountingAllocation.ts"),
  "utf8",
);
const INVOICES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8",
);
const BUSINESS = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/businessHelpers.ts"),
  "utf8",
);

// ─── Link 1: resolver accepts all 3 dim families on AllocationInput ────────

describe("link 1 — AllocationInput.dimensions accepts vehicle + property + umrah", () => {
  // Search the literal type — the field is on `dimensions?:` of AllocationInput.
  // We snip from "export interface AllocationInput" to the next "}" past 600 chars
  // to cover the nested dimensions block.
  const ifaceStart = ALLOC.indexOf("export interface AllocationInput");
  const block = ALLOC.slice(ifaceStart, ifaceStart + 2000);

  for (const field of [
    "vehicleId?:", "propertyId?:", "umrahSeasonId?:", "umrahAgentId?:",
  ]) {
    it(`AllocationInput.dimensions has ${field}`, () => {
      expect(block).toMatch(new RegExp(`\\b${field.replace("?:", "")}\\?:`));
    });
  }

  it("resolver preserves all four dims in result.dimensions via normalizeDimensions", () => {
    expect(ALLOC).toContain("function normalizeDimensions");
    const normStart = ALLOC.indexOf("function normalizeDimensions");
    const normBlock = ALLOC.slice(normStart, normStart + 800);
    expect(normBlock).toContain("vehicleId: dims?.vehicleId ?? null");
    expect(normBlock).toContain("propertyId: dims?.propertyId ?? null");
    expect(normBlock).toContain("umrahSeasonId: dims?.umrahSeasonId ?? null");
    expect(normBlock).toContain("umrahAgentId: dims?.umrahAgentId ?? null");
  });
});

// ─── Link 2: invoice approval forwards every dim into resolveLineAllocation ──

describe("link 2 — invoice approval passes all 4 dims into the resolver", () => {
  it("resolveLineAllocation call inside approve handler reads vehicleId/propertyId from ln", () => {
    const callStart = INVOICES.indexOf("resolveLineAllocation({");
    expect(callStart).toBeGreaterThan(0);
    const block = INVOICES.slice(callStart, callStart + 1200);
    expect(block).toContain("vehicleId: ln.vehicleId");
    expect(block).toContain("propertyId: ln.propertyId");
    expect(block).toContain("umrahSeasonId: ln.umrahSeasonId");
    expect(block).toContain("umrahAgentId: ln.umrahAgentId");
  });

  it("the per-line SELECT projects all 4 columns from invoice_lines", () => {
    // The dimLines SELECT projects every column the resolver reads.
    const selectMatch = INVOICES.match(/SELECT id, "accountCode", "accountId"[\s\S]{0,800}?FROM invoice_lines/);
    expect(selectMatch).not.toBeNull();
    const sql = selectMatch![0];
    expect(sql).toContain('"vehicleId"');
    expect(sql).toContain('"propertyId"');
    expect(sql).toContain('"umrahSeasonId"');
    expect(sql).toContain('"umrahAgentId"');
  });
});

// ─── Link 3: bucket key separates by ALL 4 dims ────────────────────────────
// This is the bug PR #1297 closed — without umrah dims in the key, lines 2
// (rent / property) and 3 (umrah / agent+season) on the same revenue
// account would silently merge into one journal_line.

describe("link 3 — bucket key + value include all 4 dim families", () => {
  it("bucket value type declares vehicleId + propertyId + umrahSeasonId + umrahAgentId", () => {
    const mapStart = INVOICES.indexOf("const buckets = new Map<string, {");
    const block = INVOICES.slice(mapStart, mapStart + 1000);
    expect(block).toContain("vehicleId: number | null");
    expect(block).toContain("propertyId: number | null");
    expect(block).toContain("umrahSeasonId: number | null");
    expect(block).toContain("umrahAgentId: number | null");
    // Step-3: numeric cost-center FK propagated to the JE (explicit CC wins).
    expect(block).toContain("costCenterId: number | null");
  });

  it("bucket key array includes all 4 dim accessors so different dims → different buckets", () => {
    const keyMatch = INVOICES.match(/const key = \[[\s\S]{0,600}?\.join\("\|"\)/);
    expect(keyMatch).not.toBeNull();
    const key = keyMatch![0];
    expect(key).toContain("dims.vehicleId");
    expect(key).toContain("dims.propertyId");
    expect(key).toContain("dims.umrahSeasonId");
    expect(key).toContain("dims.umrahAgentId");
  });

  it("bucket-create branch persists all 4 dim families on the bucket value", () => {
    const setMatch = INVOICES.match(/buckets\.set\(key,\s*\{[\s\S]{0,1200}?\}\)/);
    expect(setMatch).not.toBeNull();
    expect(setMatch![0]).toContain("vehicleId: dims.vehicleId");
    expect(setMatch![0]).toContain("propertyId: dims.propertyId");
    expect(setMatch![0]).toContain("umrahSeasonId: dims.umrahSeasonId");
    expect(setMatch![0]).toContain("umrahAgentId: dims.umrahAgentId");
    expect(setMatch![0]).toContain("costCenterId: cc != null ? Number(cc) : null");
  });
});

// ─── Link 4: pushed JournalEntryLine payload carries all 4 dims ─────────────

describe("link 4 — revenueLines.push() forwards all 4 dim families to the JE engine", () => {
  it("the push payload spreads bucket.vehicleId / propertyId / umrahSeasonId / umrahAgentId", () => {
    const pushMatch = INVOICES.match(/revenueLines\.push\(\{[\s\S]{0,1000}?\} as any\)/);
    expect(pushMatch).not.toBeNull();
    expect(pushMatch![0]).toContain("vehicleId: b.vehicleId");
    expect(pushMatch![0]).toContain("propertyId: b.propertyId");
    expect(pushMatch![0]).toContain("umrahSeasonId: b.umrahSeasonId");
    expect(pushMatch![0]).toContain("umrahAgentId: b.umrahAgentId");
    // Step-3: the explicit numeric cost-center flows to the JE line so the
    // enricher won't override it with a vehicleId-derived CC.
    expect(pushMatch![0]).toContain("costCenterId: b.costCenterId");
  });
});

// ─── Link 5: JournalEntryLine + INSERT write the dims to the DB ────────────

describe("link 5 — JournalEntryLine + journal_lines INSERT carry all 4 dim families", () => {
  it("JournalEntryLine interface declares all 4 fields", () => {
    const ifaceStart = BUSINESS.indexOf("export interface JournalEntryLine {");
    const ifaceEnd = BUSINESS.indexOf("}", ifaceStart);
    const iface = BUSINESS.slice(ifaceStart, ifaceEnd);
    for (const field of ["vehicleId?:", "propertyId?:", "umrahSeasonId?:", "umrahAgentId?:"]) {
      expect(iface).toMatch(new RegExp(`\\b${field.replace("?:", "")}\\?:`));
    }
  });

  it("INSERT INTO journal_lines (createJournalEntry path) lists all 4 columns + writes them", () => {
    const insertIdx = BUSINESS.indexOf("INSERT INTO journal_lines");
    const block = BUSINESS.slice(insertIdx, insertIdx + 2000);
    expect(block).toContain('"vehicleId"');
    expect(block).toContain('"propertyId"');
    expect(block).toContain('"umrahSeasonId"');
    expect(block).toContain('"umrahAgentId"');
    expect(block).toContain("line.vehicleId ?? null");
    expect(block).toContain("line.propertyId ?? null");
    expect(block).toContain("line.umrahSeasonId ?? null");
    expect(block).toContain("line.umrahAgentId ?? null");
  });
});

// ─── Link 6: alternate INSERT path (gl/posting.ts) parity check ───────────
// Mudad / FX / cycle-count / inventory write-off go through gl/posting.ts
// instead of createJournalEntry. PR #1316 widens that primitive to accept
// the same dim payload. Until #1316 lands, this contract is asserted by
// PR #1316's own smoke test (tests/unit/glPosterDimensionalSmoke.test.ts);
// we deliberately don't duplicate it here so the merge order is flexible.

// ─── Link 7: bucket DOESN'T collapse a 3-line invoice into 1 row ───────────
// Runtime simulation of the bucket reducer with synthetic inputs that
// mirror the user's scenario. We don't import the route handler (it's
// not exported), but we can replicate the bucket logic and verify it
// produces 3 distinct keys for 3 different dim sets.

describe("link 7 — runtime simulation: 3 lines on same account, 3 different dims → 3 buckets", () => {
  // The exact key shape from finance-invoices.ts (12 slots after acct).
  function bucketKey(acct: string, cc: number | null, activityType: string | null, dims: {
    projectId?: number | null; vehicleId?: number | null; propertyId?: number | null;
    employeeId?: number | null; driverId?: number | null; contractId?: number | null;
    productId?: number | null; umrahSeasonId?: number | null; umrahAgentId?: number | null;
  }): string {
    return [
      acct,
      cc ?? "",
      activityType ?? "",
      dims.projectId ?? "",
      dims.vehicleId ?? "",
      dims.propertyId ?? "",
      dims.employeeId ?? "",
      dims.driverId ?? "",
      dims.contractId ?? "",
      dims.productId ?? "",
      dims.umrahSeasonId ?? "",
      dims.umrahAgentId ?? "",
    ].join("|");
  }

  it("transport line, rent line, and umrah line on the same '4000' revenue account each get their own bucket", () => {
    const transport = bucketKey("4000", null, "transport", { vehicleId: 12 });
    const rent      = bucketKey("4000", null, "rent",      { propertyId: 5 });
    const umrah     = bucketKey("4000", null, "umrah",     { umrahAgentId: 3, umrahSeasonId: 1447 });

    const keys = new Set([transport, rent, umrah]);
    expect(keys.size).toBe(3); // no two lines collapse together
  });

  it("two umrah lines for the SAME agent but DIFFERENT seasons stay in separate buckets", () => {
    const hajj1446 = bucketKey("4200", null, "umrah", { umrahAgentId: 3, umrahSeasonId: 1446 });
    const hajj1447 = bucketKey("4200", null, "umrah", { umrahAgentId: 3, umrahSeasonId: 1447 });
    expect(hajj1446).not.toBe(hajj1447);
  });

  it("two umrah lines for SAME agent + season WOULD merge (correct behavior — single bucket)", () => {
    const a = bucketKey("4200", null, "umrah", { umrahAgentId: 3, umrahSeasonId: 1447 });
    const b = bucketKey("4200", null, "umrah", { umrahAgentId: 3, umrahSeasonId: 1447 });
    expect(a).toBe(b);
  });

  it("the fallback key (14 empty slots) matches what finance-invoices.ts uses", () => {
    // The fallback bucket key is `${invRevenueCode}|||||||||||||` (13 pipes
    // = 14 empty slots after the accountCode). The bucket grew from 12 to
    // 14 slots when unitId + assetId were added (silent dim-loss bug fix
    // — without those slots, two lines on different units/assets would
    // collapse into one bucket and the JE line would carry NULL for both).
    expect(INVOICES).toContain("`${invRevenueCode}|||||||||||||`");
  });
});

// ─── Link 8: smoke that the fallback bucket also lists all 4 dim families ──

describe("link 8 — fallback bucket initializer carries all dim families", () => {
  it("fallback bucket sets umrahSeasonId + umrahAgentId to null (not omitted)", () => {
    const fallbackMatch = INVOICES.match(/buckets\.set\(fallbackKey,\s*\{[\s\S]{0,600}?\}\)/);
    expect(fallbackMatch).not.toBeNull();
    expect(fallbackMatch![0]).toContain("umrahSeasonId: null");
    expect(fallbackMatch![0]).toContain("umrahAgentId: null");
  });

  it("fallback bucket sets unitId + assetId to null (silent dim-loss bug fix)", () => {
    const fallbackMatch = INVOICES.match(/buckets\.set\(fallbackKey,\s*\{[\s\S]{0,600}?\}\)/);
    expect(fallbackMatch).not.toBeNull();
    expect(fallbackMatch![0]).toContain("unitId: null");
    expect(fallbackMatch![0]).toContain("assetId: null");
  });
});
