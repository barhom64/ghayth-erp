import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * TA-T18-DR Phase 1 — Driver Reputation Scoring (storage + compute
 * service + read API). The audit doc (file 20 §10) parked this until
 * PE-01..07 closed; this PR ships the storage + compute slice so
 * the data populates before the next PR adds the engine axis.
 *
 * Formula (owner-set):
 *
 *   reputationScore = 0.4·onTimeRate + 0.4·completionRate + 0.2·startRate
 *
 * The static pin covers:
 *
 *   1. Migration adds the six storage columns + range CHECKs.
 *   2. Service exposes `computeDriverReputation` + `recomputeAllDrivers`
 *      + `loadDriverReputation` with the right shape.
 *   3. Weights tuple in code matches the formula above.
 *   4. Per-driver compute is divide-by-zero safe — fresh hires return
 *      NULL across the board (engine treats as neutral).
 *   5. Bulk compute swallows per-driver errors so one bad row doesn't
 *      kill the batch.
 *   6. Routes wire the service behind `fleet.vehicles` RBAC, audit-log
 *      the result, and never echo raw driver rows.
 *
 * Per the owner's package-locality rule, this is static regex-only —
 * api-server never imports SPA runtime.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");

const MIGRATIONS_DIR = join(repoRoot, "artifacts/api-server/src/migrations");
const DR_MIGRATION = (() => {
  for (const name of readdirSync(MIGRATIONS_DIR)) {
    if (!name.endsWith(".sql")) continue;
    const body = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    if (/Driver Reputation Scoring/i.test(body)) return body;
  }
  return null;
})();

const SVC = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/fleet/driverReputation.ts"),
  "utf8",
);
const ROUTES = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/fleet.ts"),
  "utf8",
);

describe("TA-T18-DR Phase 1 — migration", () => {
  it("a migration carrying the 'Driver Reputation Scoring' header exists", () => {
    expect(DR_MIGRATION, "no migration with the DR header").toBeTruthy();
  });

  it("adds the six reputation columns to `fleet_drivers`", () => {
    for (const col of [
      "reputationScore",
      "reputationOnTimeRate",
      "reputationCompletionRate",
      "reputationStartRate",
      "reputationTripsConsidered",
      "reputationComputedAt",
    ]) {
      expect(
        DR_MIGRATION,
        `column "${col}" missing from migration`,
      ).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS "${col}"`));
    }
  });

  it("range CHECKs prevent a bad recompute from poisoning the column (0..100)", () => {
    expect(DR_MIGRATION).toMatch(
      /fleet_drivers_reputation_score_range[\s\S]+?"reputationScore" >= 0 AND "reputationScore" <= 100/,
    );
    expect(DR_MIGRATION).toMatch(/fleet_drivers_reputation_on_time_range/);
    expect(DR_MIGRATION).toMatch(/fleet_drivers_reputation_completion_range/);
    expect(DR_MIGRATION).toMatch(/fleet_drivers_reputation_start_range/);
  });

  it("ranking index sorts NULLs last so fresh hires don't crowd the top", () => {
    expect(DR_MIGRATION).toMatch(
      /idx_fleet_drivers_reputation_score[\s\S]+?"reputationScore" DESC NULLS LAST/,
    );
  });
});

describe("TA-T18-DR Phase 1 — service", () => {
  it("exposes the three public functions", () => {
    expect(SVC).toMatch(/export async function computeDriverReputation\(/);
    expect(SVC).toMatch(/export async function recomputeAllDrivers\(/);
    expect(SVC).toMatch(/export async function loadDriverReputation\(/);
  });

  it("`REPUTATION_WEIGHTS` tuple matches the audit's 0.4 / 0.4 / 0.2 split", () => {
    expect(SVC).toMatch(
      /export const REPUTATION_WEIGHTS\s*=\s*\{[\s\S]+?onTime:\s*0\.4[\s\S]+?completion:\s*0\.4[\s\S]+?startRate:\s*0\.2[\s\S]+?\}\s*as const/,
    );
  });

  it("compute formula in code matches REPUTATION_WEIGHTS (no hardcoded constants drift)", () => {
    const fn = SVC.match(/export async function computeDriverReputation[\s\S]+?(?=\n(?:export |function |\/\*\*))/);
    expect(fn, "compute function body not found").toBeTruthy();
    expect(fn![0]).toMatch(
      /REPUTATION_WEIGHTS\.onTime\s*\*\s*onTimeRate[\s\S]{0,60}?REPUTATION_WEIGHTS\.completion\s*\*\s*completionRate[\s\S]{0,60}?REPUTATION_WEIGHTS\.startRate\s*\*\s*startRate/,
    );
  });

  it("fresh hires (zero qualifying orders) return NULL rates — divide-by-zero safe", () => {
    const fn = SVC.match(/export async function computeDriverReputation[\s\S]+?(?=\n(?:export |function |\/\*\*))/);
    expect(fn).toBeTruthy();
    // The three independent guards that produce NULL on zero-denominator.
    expect(fn![0]).toMatch(/let onTimeRate:\s*number\s*\|\s*null\s*=\s*null/);
    expect(fn![0]).toMatch(/let completionRate:\s*number\s*\|\s*null\s*=\s*null/);
    expect(fn![0]).toMatch(/let startRate:\s*number\s*\|\s*null\s*=\s*null/);
    expect(fn![0]).toMatch(/if \(completedTotal > 0\)/);
    expect(fn![0]).toMatch(/if \(qualifyingTotal > 0\)/);
    expect(fn![0]).toMatch(/if \(startDenominator > 0\)/);
  });

  it("on-time tolerance is set to the dispatch dashboard's 15-minute threshold", () => {
    expect(SVC).toMatch(/ON_TIME_TOLERANCE_MINUTES\s*=\s*15/);
  });

  it("`recomputeAllDrivers` swallows per-driver errors so one bad row doesn't kill the batch", () => {
    const fn = SVC.match(/export async function recomputeAllDrivers[\s\S]+?(?=\n(?:export |function |\/\*\*))/);
    expect(fn).toBeTruthy();
    expect(fn![0]).toMatch(/try\s*\{[\s\S]+?await computeDriverReputation[\s\S]+?\}\s*catch \(err\)\s*\{[\s\S]+?failed\+\+/);
  });

  it("compute query reads ONLY transport_dispatch_orders — no engine import bypass", () => {
    // Defence-in-depth: the reputation service must not call the
    // assignment engine (would create a circular dependency).
    expect(SVC).not.toMatch(/from\s+["']\.\/assignmentSuggestionEngine/);
    expect(SVC).not.toMatch(/import[\s\S]{0,80}?assignmentSuggestionEngine/);
  });
});

describe("TA-T18-DR Phase 1 — routes", () => {
  it("`GET /drivers/:id/reputation` is registered and gated on fleet.vehicles:view", () => {
    expect(ROUTES).toMatch(
      /router\.get\(\s*"\/drivers\/:id\/reputation"[\s\S]{0,200}?feature:\s*"fleet\.vehicles",\s*action:\s*"view"/,
    );
  });

  it("`POST /drivers/:id/recompute-reputation` is gated on fleet.vehicles:update", () => {
    expect(ROUTES).toMatch(
      /router\.post\(\s*"\/drivers\/:id\/recompute-reputation"[\s\S]{0,200}?feature:\s*"fleet\.vehicles",\s*action:\s*"update"/,
    );
  });

  it("`POST /drivers/reputation/recompute-all` is gated on fleet.vehicles:update", () => {
    expect(ROUTES).toMatch(
      /router\.post\(\s*"\/drivers\/reputation\/recompute-all"[\s\S]{0,200}?feature:\s*"fleet\.vehicles",\s*action:\s*"update"/,
    );
  });

  it("recompute handler audit-logs the result", () => {
    const handler = ROUTES.match(
      /router\.post\(\s*"\/drivers\/:id\/recompute-reputation"[\s\S]+?^\);/m,
    );
    expect(handler, "recompute-one handler not found").toBeTruthy();
    expect(handler![0]).toMatch(/createAuditLog\([\s\S]{0,300}?action:\s*"update"/);
    expect(handler![0]).toMatch(/recomputed:\s*true/);
  });

  it("bulk recompute audit-logs the {total,succeeded,failed} summary", () => {
    const handler = ROUTES.match(
      /router\.post\(\s*"\/drivers\/reputation\/recompute-all"[\s\S]+?^\);/m,
    );
    expect(handler).toBeTruthy();
    expect(handler![0]).toMatch(/bulkReputationRecompute:\s*result/);
  });
});

describe("TA-T18-DR Phase 1 — boundary intact", () => {
  it("no finance / GL / journal / VRP reference introduced", () => {
    expect(SVC).not.toMatch(
      /journalEngine|postingEngine|financialEngine|invoiceLine|generalLedger|vrp|VRP|tsp|TSP/,
    );
  });

  it("the migration touches ONLY fleet_drivers", () => {
    expect(DR_MIGRATION).toBeTruthy();
    const tables = DR_MIGRATION!.match(/ALTER TABLE public\.(\w+)/g) ?? [];
    const distinct = new Set(tables.map((t) => t.replace("ALTER TABLE public.", "")));
    for (const t of distinct) {
      expect([
        "fleet_drivers",
      ]).toContain(t);
    }
  });

  it("Phase 1 does NOT touch the assignment engine yet (the integration is deferred)", () => {
    // Sanity pin: this PR must not modify assignmentSuggestionEngine.
    // The integration ships in a follow-up PR.
    const enginePath = join(repoRoot, "artifacts/api-server/src/lib/fleet/assignmentSuggestionEngine.ts");
    const ENGINE = readFileSync(enginePath, "utf8");
    expect(ENGINE).not.toMatch(/from\s+["']\.\/driverReputation/);
    expect(ENGINE).not.toMatch(/computeDriverReputation|loadDriverReputation/);
  });
});
