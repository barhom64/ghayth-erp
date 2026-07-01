import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #TA-T18 finance-boundary — maintenance cost goes through the accountant
 * candidate queue instead of posting GL directly at completion.
 *
 * Owner's operational-review rule: المالية لا تتداخل مع النقل — transport
 * never touches the ledger; completing a maintenance ticket QUEUES an
 * expense candidate, and the accountant materialises it (THAT is where the
 * GL is posted). Same proven pattern as cargo / rental / passenger billing.
 *
 * Static guard (regex-only, no DB).
 */
const apiSrc = join(import.meta.dirname!, "../../src");
const ENGINE = readFileSync(join(apiSrc, "lib/engines/fleetEngine.ts"), "utf8");
const FLEET = readFileSync(join(apiSrc, "routes/fleet.ts"), "utf8");
const MATERIALIZE = readFileSync(join(apiSrc, "routes/transport-billing-candidates.ts"), "utf8");

describe("#TA-T18 — maintenance expense candidate (finance boundary)", () => {
  it("engine exposes createMaintenanceExpenseCandidate creating a pending EXPENSE candidate", () => {
    expect(ENGINE).toMatch(/async createMaintenanceExpenseCandidate\(/);
    const i = ENGINE.indexOf("async createMaintenanceExpenseCandidate(");
    const block = ENGINE.slice(i, i + 1200);
    expect(block).toMatch(/sourceType: "maintenance"/);  // sourceType via the mapper
    expect(block).toMatch(/suggestedCost: cost/);        // carries the cost
    expect(block).not.toMatch(/suggestedRevenue/);       // pure expense ⇒ revenue omitted (NULL)
    // Idempotency anchor now lives once in the shared writer.
    const writer = ENGINE.slice(ENGINE.indexOf("async createBillingCandidate("), ENGINE.indexOf("async createCargoBillingCandidate("));
    expect(writer).toMatch(/ON CONFLICT \("companyId", "sourceType", "sourceId"\) DO NOTHING/);
  });

  it("maintenance completion queues a candidate, NOT a direct GL post", () => {
    const i = FLEET.indexOf('"/maintenance/:id/complete"');
    const block = FLEET.slice(i, i + 4000);
    expect(block).toMatch(/createMaintenanceExpenseCandidate/);
    // the GL CALL must be gone from completion (a comment mentioning the
    // helper name is fine — we target the invocation, not the prose).
    expect(block).not.toMatch(/fleetEngine\.postMaintenanceGL\(/);
  });

  it("the accountant materialize endpoint posts maintenance GL on approval", () => {
    expect(MATERIALIZE).toMatch(/sourceType === "maintenance"/);
    expect(MATERIALIZE).toMatch(/postMaintenanceGL/);
    // The recorded JE id reads the GL result's `journalId` field (the
    // posting result is { journalId }, not { id }) so the candidate's
    // materializedJournalEntryId link is actually populated.
    expect(MATERIALIZE).toMatch(/\.journalId \?\? null/);
    expect(MATERIALIZE).not.toMatch(/as \{ id\?: number \}[\s\S]{0,20}\)\?\.id \?\? null/);
  });
});

describe("#TA-T18 — fuel + insurance expense candidates (same boundary)", () => {
  it("engine exposes fuel + insurance expense candidate creators", () => {
    expect(ENGINE).toMatch(/async createFuelExpenseCandidate\(/);
    expect(ENGINE).toMatch(/async createInsuranceExpenseCandidate\(/);
    expect(ENGINE).toMatch(/sourceType: "fuel"/);
    expect(ENGINE).toMatch(/sourceType: "insurance"/);
  });

  it("fuel + insurance creation queues candidates, not a direct GL post", () => {
    expect(FLEET).toMatch(/createFuelExpenseCandidate/);
    expect(FLEET).toMatch(/createInsuranceExpenseCandidate/);
    expect(FLEET).not.toMatch(/fleetEngine\.postFuelExpenseGL\(/);
    expect(FLEET).not.toMatch(/fleetEngine\.postInsuranceGL\(/);
  });

  it("materialize posts fuel + insurance GL on accountant approval", () => {
    expect(MATERIALIZE).toMatch(/sourceType === "fuel"/);
    expect(MATERIALIZE).toMatch(/sourceType === "insurance"/);
    expect(MATERIALIZE).toMatch(/postFuelExpenseGL/);
    expect(MATERIALIZE).toMatch(/postInsuranceGL/);
    // the materialiser accepts the full fleet-expense set.
    expect(MATERIALIZE).toMatch(/SUPPORTED_SOURCE_TYPES = \["cargo_manifest", "maintenance", "fuel", "insurance"\]/);
  });
});
