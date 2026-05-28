import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"),
  "utf8"
);

// ─── /journal/:id/reverse — dimensional fidelity ──────────────────────────
// Pre-fix: the reverse-journal endpoint SELECTed only 4 of ~18 dimensional
// columns (costCenter, departmentId, projectId, employeeId). When a JE
// carrying e.g. vehicleId + propertyId got reversed, the reversal entry
// lost those dimensions — per-vehicle and per-property profitability
// reports double-counted the cost because the original posting was visible
// but the reversal wasn't tagged for the same dimension.

const REVERSE_BLOCK_START = ROUTE.indexOf('journalRouter.post("/journal/:id/reverse"');
const REVERSE_BLOCK = REVERSE_BLOCK_START >= 0
  ? ROUTE.slice(REVERSE_BLOCK_START, REVERSE_BLOCK_START + 8000)
  : "";

describe("reverse-journal endpoint exists", () => {
  it("mounts at POST /journal/:id/reverse", () => {
    expect(REVERSE_BLOCK_START).toBeGreaterThan(-1);
  });
});

describe("reverse-journal SELECT carries every dimensional column", () => {
  const requiredCols = [
    // Phase 1 (legacy 4 — were already carried)
    "costCenter",
    "departmentId",
    "projectId",
    "employeeId",
    // Phase 2+ (new — were silently dropped before this fix)
    "costCenterId",
    "vehicleId",
    "propertyId",
    "unitId",
    "assetId",
    "contractId",
    "umrahSeasonId",
    "umrahAgentId",
    "activityType",
    "productId",
    "clientId",
    "vendorId",
    "driverId",
    "sourceLineTable",
    "sourceLineId",
  ];

  for (const col of requiredCols) {
    it(`SELECT pulls "${col}"`, () => {
      // Match either bare or quoted form within the SELECT line block.
      // The block uses the multi-line SELECT, so a quoted identifier is
      // the canonical form.
      expect(REVERSE_BLOCK).toContain(`"${col}"`);
    });
  }
});

describe("reverse-journal map propagates every dim onto the reversal lines", () => {
  const requiredMappings = [
    "costCenter: l.costCenter as string | undefined",
    "departmentId: l.departmentId as number | undefined",
    "projectId: l.projectId as number | undefined",
    "employeeId: l.employeeId as number | undefined",
    "costCenterId: l.costCenterId as number | undefined",
    "vehicleId: l.vehicleId as number | undefined",
    "propertyId: l.propertyId as number | undefined",
    "unitId: l.unitId as number | undefined",
    "assetId: l.assetId as number | undefined",
    "contractId: l.contractId as number | undefined",
    "umrahSeasonId: l.umrahSeasonId as number | undefined",
    "umrahAgentId: l.umrahAgentId as number | undefined",
    "activityType: l.activityType as string | undefined",
    "productId: l.productId as number | undefined",
    "clientId: l.clientId as number | undefined",
    "vendorId: l.vendorId as number | undefined",
    "driverId: l.driverId as number | undefined",
    "sourceLineTable: l.sourceLineTable as string | undefined",
    "sourceLineId: l.sourceLineId as number | undefined",
  ];

  for (const m of requiredMappings) {
    it(`reversedLines mapping carries ${m.split(":")[0]}`, () => {
      expect(REVERSE_BLOCK).toContain(m);
    });
  }
});

describe("reverse-journal preserves the debit/credit swap", () => {
  it("debit becomes the original credit", () => {
    expect(REVERSE_BLOCK).toContain("debit: Number(l.credit || 0)");
  });
  it("credit becomes the original debit", () => {
    expect(REVERSE_BLOCK).toContain("credit: Number(l.debit || 0)");
  });
});

describe("reverse-journal idempotency + audit guards stay green", () => {
  it("blocks a second reversal of the same entry", () => {
    expect(REVERSE_BLOCK).toContain("reversedById");
    expect(REVERSE_BLOCK).toContain("هذا القيد معكوس مسبقاً");
  });
  it("blocks reversing a reversal entry", () => {
    expect(REVERSE_BLOCK).toContain("reversalOfId");
    expect(REVERSE_BLOCK).toContain("لا يمكن عكس قيد هو أصلاً قيد عاكس");
  });
  it("requires a written reason", () => {
    expect(REVERSE_BLOCK).toContain("سبب عكس القيد مطلوب");
  });
});
