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
    const i = ENGINE.indexOf("createMaintenanceExpenseCandidate");
    const block = ENGINE.slice(i, i + 1800);
    expect(block).toMatch(/'maintenance'/);                         // sourceType
    expect(block).toMatch(/"suggestedRevenue", "suggestedCost"/);   // carries cost
    expect(block).toMatch(/NULL, \$6/);                             // revenue NULL, cost is the amount
    expect(block).toMatch(/ON CONFLICT \("companyId", "sourceType", "sourceId"\) DO NOTHING/);
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
    // both supported source types are accepted by the materialiser.
    expect(MATERIALIZE).toMatch(/!== "cargo_manifest" &&[\s\S]{0,40}!== "maintenance"/);
  });
});
