import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TA-T18-DR Phase 2 — engine integration (audit doc file 20 §10).
 *
 * Phase 1 (#2397) shipped storage + compute + read API. Phase 2 wires
 * `reputationScore` as the 10th scoring axis in the assignment engine
 * with weight 0.05, taken from `conflict` (0.25 → 0.20).
 *
 * Why `conflict` funded the budget: when there IS a conflict the
 * candidate gets a HARD blocker → score=0 anyway, so the 0.05 only
 * matters at the margins (near-overlap windows). Driver reputation
 * is a soft preference among the qualifying candidates — same tier
 * as `utilization` (0.05).
 *
 * Pinned invariants:
 *
 *   1. Weights still sum to 1.00 (the engine's central truth — every
 *      axis is 0..100, so the final score is comparable across runs).
 *   2. New `reputationScore` axis appears in the final blend with
 *      the right weight.
 *   3. `conflict` weight dropped from 0.25 → 0.20 (the source of the budget).
 *   4. Fresh hires (NULL reputation) get a NEUTRAL 50 — never punished
 *      on day one — with a clear reason on the candidate.
 *   5. The DriverRow query loads `reputationScore` so the axis has data.
 *   6. The navigation/complete endpoint triggers a lazy recompute
 *      (best-effort, never blocks the operator's action).
 *
 * Per the owner's package-locality rule, this is static regex-only.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const ENGINE = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/fleet/assignmentSuggestionEngine.ts"),
  "utf8",
);
const ROUTES = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/transport-planning.ts"),
  "utf8",
);

describe("TA-T18-DR Phase 2 — engine weight integration", () => {
  it("`reputationScore` is computed per candidate and projected to 0..100", () => {
    // The axis derives from `d.reputationScore` (the persisted value)
    // and clamps to [0, 100] for safety.
    expect(ENGINE).toMatch(
      /const reputationScore = d\.reputationScore != null[\s\S]{0,200}?Math\.max\(0,\s*Math\.min\(100,\s*Number\(d\.reputationScore\)\)\)[\s\S]{0,30}?:\s*50/,
    );
  });

  it("fresh hires (NULL reputation) get a NEUTRAL 50 score, not zero", () => {
    // Critical fairness invariant — a brand-new driver must not be
    // ejected from the top of suggestions because of a missing metric.
    // Match the resolver ternary (returns 50 on null) + the reason
    // line that the SPA can display.
    expect(ENGINE).toMatch(
      /Number\(d\.reputationScore\)\)\)\s*\n\s*:\s*50/,
    );
    expect(ENGINE).toMatch(/لا توجد بيانات سمعة للسائق بعد/);
  });

  it("the final blend includes `reputationScore * 0.05`", () => {
    const aggregate = ENGINE.match(/const finalScore = Math\.round\(\s*([\s\S]+?)\);/);
    expect(aggregate, "finalScore aggregate not found").toBeTruthy();
    expect(aggregate![1]).toMatch(/reputationScore\s*\*\s*0\.05/);
  });

  it("the conflict weight dropped from 0.25 → 0.20 (funding the reputation axis)", () => {
    const aggregate = ENGINE.match(/const finalScore = Math\.round\(\s*([\s\S]+?)\);/);
    expect(aggregate).toBeTruthy();
    expect(aggregate![1]).toMatch(/conflictScore\s*\*\s*0\.20/);
    expect(aggregate![1]).not.toMatch(/conflictScore\s*\*\s*0\.25/);
  });

  it("the ten axes' weights sum to exactly 1.000 — single source of truth", () => {
    // Extract every numeric weight from the aggregate and sum them.
    // The static guarantee that the engine never silently drifts.
    const aggregate = ENGINE.match(/const finalScore = Math\.round\(\s*([\s\S]+?)\);/);
    expect(aggregate).toBeTruthy();
    const weights = [...aggregate![1].matchAll(/\*\s*(0\.\d+)/g)].map((m) => Number(m[1]));
    expect(weights.length, "expected exactly 10 weighted axes").toBe(10);
    const sum = weights.reduce((acc, w) => acc + w, 0);
    // Tolerance for floating-point on summing decimals like 0.025.
    expect(Math.abs(sum - 1.0), `weights sum to ${sum}, not 1.0`).toBeLessThan(1e-9);
  });

  it("`reputationScore` is added to the `DriverRow` interface + SELECT", () => {
    // Interface field.
    expect(ENGINE).toMatch(/interface DriverRow[\s\S]+?reputationScore:\s*string\s*\|\s*null/);
    // SQL projection — the engine reads the value off the row.
    expect(ENGINE).toMatch(/SELECT[\s\S]+?d\."reputationScore"[\s\S]+?FROM fleet_drivers/);
  });

  it("never imports the reputation SERVICE into the engine (only reads the persisted column)", () => {
    // Defence-in-depth: the engine must stay decoupled from the
    // compute service to avoid circular dependencies / startup ordering.
    expect(ENGINE).not.toMatch(/from\s+["']\.\/driverReputation/);
    expect(ENGINE).not.toMatch(/computeDriverReputation|loadDriverReputation|recomputeAllDrivers/);
  });

  it("high (≥85) and low (<60) reputations surface a localised reason on the candidate", () => {
    expect(ENGINE).toMatch(/سمعة عالية/);
    expect(ENGINE).toMatch(/سمعة منخفضة/);
  });
});

describe("TA-T18-DR Phase 2 — auto-recompute on navigation/complete", () => {
  it("the navigation/complete handler triggers a best-effort reputation recompute", () => {
    const handler = ROUTES.match(
      /transportPlanningRouter\.post\(\s*"\/transport\/dispatch-orders\/:id\/navigation\/complete"[\s\S]+?^\);/m,
    );
    expect(handler, "navigation/complete handler not found").toBeTruthy();
    // Lazy dynamic import so the engine module isn't pulled into the
    // hot path on cold-start; recompute fires in an IIFE.
    expect(handler![0]).toMatch(/await import\(["']\.\.\/lib\/fleet\/driverReputation/);
    expect(handler![0]).toMatch(/computeDriverReputation\(\s*\{/);
  });

  it("the recompute call is isolated — a failure NEVER blocks the operator's complete action", () => {
    const handler = ROUTES.match(
      /transportPlanningRouter\.post\(\s*"\/transport\/dispatch-orders\/:id\/navigation\/complete"[\s\S]+?^\);/m,
    );
    expect(handler).toBeTruthy();
    // The recompute lives inside an IIFE that catches AND swallows
    // errors — `res.json({ ok: true })` is reached regardless.
    expect(handler![0]).toMatch(
      /\(async \(\)\s*=>\s*\{[\s\S]+?try[\s\S]+?await computeDriverReputation[\s\S]+?\}\s*catch[\s\S]+?logger\.warn[\s\S]+?\}\)\(\)\.catch\(\(\)\s*=>\s*undefined\)/,
    );
  });
});

describe("TA-T18-DR Phase 2 — boundary intact", () => {
  it("no finance / GL / journal / reputation reference introduced into the engine", () => {
    // The engine reads ONE new column. No new finance/GL/journal
    // surface was added — defence against scope creep.
    const newRegion = ENGINE.match(/TA-T18-DR Phase 2[\s\S]{0,2000}/);
    expect(newRegion).toBeTruthy();
    expect(newRegion![0]).not.toMatch(
      /journalEngine|postingEngine|financialEngine|invoiceLine|generalLedger|vrp|VRP|tsp|TSP/,
    );
  });

  it("Phase 2 does NOT modify driverReputation.ts (compute service is upstream of engine)", () => {
    // The engine reads the persisted column — the service stays
    // owner of how the score is computed.
    const SVC = readFileSync(
      join(repoRoot, "artifacts/api-server/src/lib/fleet/driverReputation.ts"),
      "utf8",
    );
    // Sanity: service still exports the same three functions.
    expect(SVC).toMatch(/export async function computeDriverReputation\(/);
    expect(SVC).toMatch(/export async function recomputeAllDrivers\(/);
    expect(SVC).toMatch(/export async function loadDriverReputation\(/);
  });
});
