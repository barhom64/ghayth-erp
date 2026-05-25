import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Lot-status warnings on COGS reversal — audit follow-up to #1017.
// When a credit memo restocks lots that drifted status between
// sale and return (quarantine / recalled / expired / disposed /
// qc-rejected / lot-deleted), the planner now emits a non-fatal
// warning so QC can re-inspect the returned units. The credit-memo
// commit handler + preview bubble these into the response payload.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const HELPER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/inventory/cogsPosting.ts"),
  "utf8"
);
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8"
);

describe("cogsPosting.ts — reversal warnings types", () => {
  it("exports CogsReversalWarning + CogsReversalWarningReason", () => {
    expect(HELPER).toMatch(/export type CogsReversalWarningReason/);
    expect(HELPER).toMatch(/export interface CogsReversalWarning/);
  });
  it("enumerates 6 reason codes (status changes + qc + not_found)", () => {
    for (const reason of [
      '"lot_quarantine"', '"lot_recalled"', '"lot_expired"',
      '"lot_disposed"',   '"lot_qc_rejected"', '"lot_not_found"',
    ]) {
      expect(HELPER).toContain(reason);
    }
  });
  it("CogsReversalPlan exposes warnings array", () => {
    expect(HELPER).toMatch(/CogsReversalPlan[\s\S]{0,800}warnings: CogsReversalWarning\[\]/);
  });
});

describe("loadLotsForReversal pulls status fields", () => {
  it("ReversalLotRow carries status / qc / recall metadata", () => {
    expect(HELPER).toMatch(/interface ReversalLotRow \{[\s\S]{0,300}status: string;\s+qualityControlStatus: string;/);
    expect(HELPER).toMatch(/recallId: number \| null;/);
    expect(HELPER).toMatch(/recalledAt: string \| null;/);
  });
  it("SELECT includes status + qualityControlStatus + recall fields", () => {
    expect(HELPER).toMatch(/SELECT id, "warehouseId",\s+status,\s+"qualityControlStatus",\s+"recallId",\s+"recalledAt"::text AS "recalledAt"/);
  });
});

describe("planCogsReversal emits warnings", () => {
  it("warns on missing lot (lot_not_found)", () => {
    expect(HELPER).toMatch(/if \(!lot\)\s*\{[\s\S]{0,400}reason: "lot_not_found"/);
  });
  it("maps lot.status to the matching warning reason", () => {
    expect(HELPER).toMatch(/statusReasonMap[\s\S]{0,200}quarantine: "lot_quarantine"/);
    expect(HELPER).toMatch(/recalled:\s+"lot_recalled"/);
    expect(HELPER).toMatch(/expired:\s+"lot_expired"/);
    expect(HELPER).toMatch(/disposed:\s+"lot_disposed"/);
  });
  it("warns when qualityControlStatus === 'rejected'", () => {
    expect(HELPER).toMatch(/lot\.qualityControlStatus === "rejected"[\s\S]{0,300}reason: "lot_qc_rejected"/);
  });
  it("warnings array is appended to the returned plan", () => {
    expect(HELPER).toMatch(/return \{[\s\S]{0,300}warnings,\s*\};/);
  });
  it("planner still pushes the stock-movement row — warning is advisory, not blocking", () => {
    // The stockMovements.push call must follow the warning branch,
    // not replace it.
    expect(HELPER).toMatch(/warnings\.push\([\s\S]{0,1200}stockMovements\.push\(\{/);
  });
});

describe("credit-memo commit propagates warnings", () => {
  const idx = ROUTE.indexOf('invoicesRouter.post("/invoices/:id/credit-memo"');
  const end = ROUTE.indexOf('invoicesRouter.post("/invoices/:id/debit-memo"', idx);
  const handler = ROUTE.slice(idx, end);

  it("initialises empty plan with warnings: []", () => {
    expect(handler).toMatch(/let cogsReversalPlan: CogsReversalPlanT = \{[\s\S]{0,200}warnings: \[\],/);
  });
  it("response includes cogsReversalWarnings on success", () => {
    expect(handler).toContain("cogsReversalWarnings: cogsReversalPlan.warnings");
  });
});

describe("credit-memo PREVIEW propagates warnings", () => {
  const idx = ROUTE.indexOf('"/invoices/:id/credit-memo/preview"');
  const end = ROUTE.indexOf('"/invoices/:id/credit-memo"', idx + 50);
  const handler = ROUTE.slice(idx, end);

  it("initialises preview empty plan with warnings: []", () => {
    expect(handler).toMatch(/cogsReversalPreview[\s\S]{0,200}warnings: \[\],/);
  });
  it("preview response payload exposes cogsReversalWarnings", () => {
    expect(handler).toContain("cogsReversalWarnings: cogsReversalPreview.warnings");
  });
});
