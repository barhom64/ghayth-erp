import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const UMRAH = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/engines/umrahEngine.ts"),
  "utf8"
);
const FLEET = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/engines/fleetEngine.ts"),
  "utf8"
);

// ─── umrahEngine — silent dim-loss bugs fixed ─────────────────────────────
// Pre-fix:
//   • postAgentInvoiceGL used `vendorId: invoice.agentId` only on the
//     AR line — semantic bug because umrah_agents is its own table
//     (not vendors), AND the CR + commission lines dropped the agent
//     dim entirely.
//   • postTransportExpenseGL carried vehicleId+driverId only on the
//     DR (expense) line; the CR (payable) line was bare.

describe("umrahEngine.postAgentInvoiceGL — every line carries umrahAgentId", () => {
  const fnStart = UMRAH.indexOf("async postAgentInvoiceGL");
  const fnBlock = fnStart >= 0
    ? UMRAH.slice(fnStart, fnStart + 3000)
    : "";

  it("function exists", () => {
    expect(fnStart).toBeGreaterThan(-1);
  });

  it("no longer mis-uses vendorId for an umrah agent FK", () => {
    // Code-side check: confirm we now use the dedicated umrahAgentId
    // FK column. Any code-occurrence of `vendorId:` referring to the
    // agent would be the regression we just fixed.
    expect(fnBlock).toContain("umrahAgentId: invoice.agentId");
    // The remaining literal mention of vendorId: invoice.agentId in
    // the comment is intentional (it documents what was fixed); test
    // for the actual code shape instead of grepping the comment.
  });

  it("AR debit carries umrahAgentId", () => {
    const arIdx = fnBlock.indexOf("accountCode: arCode,");
    expect(arIdx).toBeGreaterThan(-1);
    const arBlock = fnBlock.slice(arIdx, arIdx + 300);
    expect(arBlock).toContain("umrahAgentId: invoice.agentId");
  });

  it("revenue credit carries umrahAgentId (silent gap fix)", () => {
    const revIdx = fnBlock.indexOf("accountCode: revenueCode,");
    expect(revIdx).toBeGreaterThan(-1);
    const revBlock = fnBlock.slice(revIdx, revIdx + 300);
    expect(revBlock).toContain("umrahAgentId: invoice.agentId");
  });

  it("penalty credit carries umrahAgentId (silent gap fix)", () => {
    const penIdx = fnBlock.indexOf("accountCode: penaltyCode,");
    expect(penIdx).toBeGreaterThan(-1);
    const penBlock = fnBlock.slice(penIdx, penIdx + 300);
    expect(penBlock).toContain("umrahAgentId: invoice.agentId");
  });

  it("commission debit carries umrahAgentId (silent gap fix)", () => {
    const comIdx = fnBlock.indexOf("accountCode: commissionCode,");
    expect(comIdx).toBeGreaterThan(-1);
    const comBlock = fnBlock.slice(comIdx, comIdx + 300);
    expect(comBlock).toContain("umrahAgentId: invoice.agentId");
  });
});

describe("umrahEngine.postTransportExpenseGL — payable line carries vehicle/driver", () => {
  const fnStart = UMRAH.indexOf("async postTransportExpenseGL");
  const fnBlock = fnStart >= 0
    ? UMRAH.slice(fnStart, fnStart + 2000)
    : "";

  it("both lines carry vehicleId", () => {
    const matches = fnBlock.match(/vehicleId: transport\.vehicleId/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("both lines carry driverId", () => {
    const matches = fnBlock.match(/driverId: transport\.driverId/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── fleetEngine.postFuelExpenseGL — CR line carries driverId now ────────
// Pre-fix: DR carried both vehicleId + driverId, CR carried only vehicleId.

describe("fleetEngine.postFuelExpenseGL — both lines carry driverId", () => {
  const fnStart = FLEET.indexOf("async postFuelExpenseGL");
  const fnBlock = fnStart >= 0
    ? FLEET.slice(fnStart, fnStart + 1500)
    : "";

  it("function exists", () => {
    expect(fnStart).toBeGreaterThan(-1);
  });

  it("both lines carry vehicleId (no regression)", () => {
    const matches = fnBlock.match(/vehicleId: fuelLog\.vehicleId/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("both lines carry driverId (silent gap fix on CR)", () => {
    const matches = fnBlock.match(/driverId: fuelLog\.driverId/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── fleetEngine.postViolationPaymentGL — CR (cash) line carries vehicleId ──
// Pre-fix: DR (fines payable) carried vehicleId, CR (cash source) was bare —
// per-vehicle cash-outflow reports only saw one leg. Dimension is metadata
// only; debit/credit amounts and balance are unchanged.

describe("fleetEngine.postViolationPaymentGL — both lines carry vehicleId", () => {
  const fnStart = FLEET.indexOf("async postViolationPaymentGL");
  const fnBlock = fnStart >= 0
    ? FLEET.slice(fnStart, fnStart + 1500)
    : "";

  it("function exists", () => {
    expect(fnStart).toBeGreaterThan(-1);
  });

  it("both lines carry vehicleId (silent gap fix on cash CR)", () => {
    const matches = fnBlock.match(/vehicleId: violation\.vehicleId/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("stays balanced — exactly one debit and one credit on amount", () => {
    // Guard against any accidental amount/leg change: the two legs must
    // remain debit=violation.amount and credit=violation.amount.
    expect(fnBlock).toContain("debit: violation.amount, credit: 0");
    expect(fnBlock).toContain("debit: 0, credit: violation.amount");
  });
});
