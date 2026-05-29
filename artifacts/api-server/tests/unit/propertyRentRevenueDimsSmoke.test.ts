import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/engines/propertiesEngine.ts"),
  "utf8"
);

// ─── propertiesEngine.postRentRevenueGL — clientId on every line ─────────
// Pre-fix: only the AR debit line carried clientId (= tenantId). The
// revenue CR and the VAT CR were missing it, so per-tenant revenue
// reports were silently incomplete — the receivable showed up against
// the tenant but the recognised revenue was unattributed.

describe("postRentRevenueGL", () => {
  const fnStart = ENGINE.indexOf("async postRentRevenueGL");
  const fnBlock = fnStart >= 0
    ? ENGINE.slice(fnStart, fnStart + 2500)
    : "";

  it("function exists", () => {
    expect(fnStart).toBeGreaterThan(-1);
  });

  it("accepts tenantId on the payment param", () => {
    expect(fnBlock).toContain("tenantId?: number");
  });

  it("AR debit line carries clientId: payment.tenantId", () => {
    // Find the first line entry (DR rent_receivable).
    const arBlockIdx = fnBlock.indexOf("accountCode: debitCode,");
    expect(arBlockIdx).toBeGreaterThan(-1);
    const arBlock = fnBlock.slice(arBlockIdx, arBlockIdx + 400);
    expect(arBlock).toContain("clientId: payment.tenantId");
  });

  it("revenue credit line carries clientId: payment.tenantId (silent gap fix)", () => {
    const revBlockIdx = fnBlock.indexOf("accountCode: creditCode,");
    expect(revBlockIdx).toBeGreaterThan(-1);
    const revBlock = fnBlock.slice(revBlockIdx, revBlockIdx + 400);
    expect(revBlock).toContain("clientId: payment.tenantId");
  });

  it("VAT credit line carries clientId: payment.tenantId (silent gap fix)", () => {
    const vatBlockIdx = fnBlock.indexOf("accountCode: vatCode,");
    expect(vatBlockIdx).toBeGreaterThan(-1);
    const vatBlock = fnBlock.slice(vatBlockIdx, vatBlockIdx + 400);
    expect(vatBlock).toContain("clientId: payment.tenantId");
  });

  it("every line still carries propertyId + contractId (no regression)", () => {
    const propIdMatches = fnBlock.match(/propertyId: payment\.propertyId/g) ?? [];
    const contractIdMatches = fnBlock.match(/contractId: payment\.contractId/g) ?? [];
    expect(propIdMatches.length).toBeGreaterThanOrEqual(3);
    expect(contractIdMatches.length).toBeGreaterThanOrEqual(3);
  });
});
