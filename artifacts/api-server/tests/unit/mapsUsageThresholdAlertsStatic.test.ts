import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { windowKeyFor } from "../../src/lib/fleet/mapsUsageThresholdAlerts.js";

/**
 * TA-GAP-09 Phase 3 — operator-set caps + alert sweep (audit doc
 * file 20 §10). Phase 1 (#2439) recorded counts. Phase 2 (#2449)
 * exposed them. Phase 3 closes the loop: when the operator sets a
 * cap, the cron emits `fleet.maps_usage.threshold_breached` events
 * at 80% (warning) and 100% (critical) — ONCE per (threshold,
 * level, window) thanks to the unique constraint on the alerts
 * table.
 *
 * Critical invariants pinned here:
 *   1. The lib is OBSERVABILITY-only. It NEVER blocks an outbound
 *      Google call.
 *   2. Alerts are loud-once via the (thresholdId, level, windowKey)
 *      UNIQUE constraint. Re-running the cron is a no-op.
 *   3. The CHECKs (period IN ('daily','monthly'), threshold > 0,
 *      warningPct ∈ [1, 99]) are enforced by the migration.
 *   4. The cron is registered in cronScheduler.ts at 15-minute cadence.
 *   5. The routes use fleet.bookings (matching Phase 2's view scope).
 *   6. Phase 3 does NOT touch finance / GL / journal modules.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const MIG = readFileSync(
  join(repoRoot, "artifacts/api-server/src/migrations/375_maps_usage_thresholds.sql"),
  "utf8",
);
const LIB = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/fleet/mapsUsageThresholdAlerts.ts"),
  "utf8",
);
const ROUTES = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/transport-planning.ts"),
  "utf8",
);
const CRON = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/cronScheduler.ts"),
  "utf8",
);

describe("TA-GAP-09 Phase 3 — migration 375 schema", () => {
  it("creates both `maps_usage_thresholds` + `maps_usage_threshold_alerts`", () => {
    expect(MIG).toMatch(/CREATE TABLE IF NOT EXISTS maps_usage_thresholds/);
    expect(MIG).toMatch(/CREATE TABLE IF NOT EXISTS maps_usage_threshold_alerts/);
  });

  it("threshold period CHECK pins daily|monthly", () => {
    expect(MIG).toMatch(/CHECK \(period IN \('daily', 'monthly'\)\)/);
  });

  it("alert level CHECK pins warning|critical", () => {
    expect(MIG).toMatch(/CHECK \(level IN \('warning', 'critical'\)\)/);
  });

  it("threshold callCount must be > 0 (defends against zero/negative caps)", () => {
    expect(MIG).toMatch(/maps_usage_thresholds_count_positive[\s\S]+?CHECK \("callCountThreshold" > 0\)/);
  });

  it("warningPct bounded to [1, 99] (defends against 0/100 nonsense)", () => {
    expect(MIG).toMatch(/maps_usage_thresholds_pct_bounds[\s\S]+?CHECK \("warningPct" BETWEEN 1 AND 99\)/);
  });

  it("partial UNIQUE on (companyId, period) WHERE isActive — only one live cap per slot", () => {
    expect(MIG).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS maps_usage_thresholds_active_uniq\s*\n\s*ON maps_usage_thresholds \("companyId", period\)\s*\n\s*WHERE "isActive" = TRUE/,
    );
  });

  it("dedupe key UNIQUE on (thresholdId, level, windowKey) — alert ONCE per window", () => {
    expect(MIG).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS maps_usage_threshold_alerts_uniq\s*\n\s*ON maps_usage_threshold_alerts \("thresholdId", level, "windowKey"\)/,
    );
  });

  it("rollback recipe + DO-block idempotency on constraints", () => {
    expect(MIG).toMatch(/@rollback:[\s\S]+?DROP TABLE IF EXISTS maps_usage_threshold_alerts[\s\S]+?DROP TABLE IF EXISTS maps_usage_thresholds/);
    expect(MIG).toMatch(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'maps_usage_thresholds_period_check'\)/);
  });
});

describe("TA-GAP-09 Phase 3 — windowKeyFor (date math)", () => {
  it("daily window: key + from + to all = today's YYYY-MM-DD", () => {
    const r = windowKeyFor("daily", new Date("2026-06-15T14:00:00Z"));
    expect(r.key).toBe("2026-06-15");
    expect(r.fromIso).toBe("2026-06-15");
    expect(r.toIso).toBe("2026-06-15");
  });

  it("monthly window: trailing 30 days inclusive of today", () => {
    const r = windowKeyFor("monthly", new Date("2026-06-30T14:00:00Z"));
    expect(r.toIso).toBe("2026-06-30");
    // 30 days back from June 30 → June 1 (inclusive end of June, 30 days = June 1..30).
    expect(r.fromIso).toBe("2026-06-01");
    expect(r.key).toBe(r.fromIso);
  });
});

describe("TA-GAP-09 Phase 3 — library invariants", () => {
  it("exports the three public symbols (cron entry + two storage helpers)", () => {
    expect(LIB).toMatch(/export async function runThresholdAlertCheck\(/);
    expect(LIB).toMatch(/export async function loadActiveThresholds\(/);
    expect(LIB).toMatch(/export async function upsertThreshold\(/);
  });

  it("alerts use INSERT … ON CONFLICT DO NOTHING — dedupe via the unique constraint", () => {
    // The unique constraint on (thresholdId, level, windowKey) is the
    // sole dedupe mechanism. No in-process state machine.
    expect(LIB).toMatch(/INSERT INTO maps_usage_threshold_alerts[\s\S]+?ON CONFLICT \("thresholdId", level, "windowKey"\) DO NOTHING/);
  });

  it("`emitted = affectedRows > 0` — event fires only on the FIRST insert", () => {
    expect(LIB).toMatch(/const emitted = \(affectedRows \?\? 0\) > 0/);
    expect(LIB).toMatch(/if \(emitted\) \{[\s\S]+?emitEvent\(/);
  });

  it("event action is `fleet.maps_usage.threshold_breached` (no drift)", () => {
    expect(LIB).toMatch(/action:\s*"fleet\.maps_usage\.threshold_breached"/);
  });

  it("warning + critical levels checked at warningPct + 100% respectively", () => {
    expect(LIB).toMatch(
      /\{ level:\s*"warning",\s*crossedAt:\s*warningCount \},[\s\S]+?\{ level:\s*"critical",\s*crossedAt:\s*threshold\.callCountThreshold \}/,
    );
  });

  it("per-threshold errors are isolated — one bad row never breaks the sweep", () => {
    // The runThresholdAlertCheck loop wraps each iteration in try/catch.
    expect(LIB).toMatch(/for \(const t of thresholds\)\s*\{[\s\S]+?try\s*\{[\s\S]+?\}\s*catch \(err\)\s*\{[\s\S]+?logger\.warn/);
  });

  it("upsertThreshold soft-deactivates prior active row before INSERTing the new one", () => {
    // Keeps history of prior caps for audit ("the cap used to be 5000").
    expect(LIB).toMatch(/UPDATE maps_usage_thresholds[\s\S]+?SET "isActive" = FALSE[\s\S]+?WHERE "companyId" = \$1 AND period = \$2 AND "isActive" = TRUE/);
  });

  it("lib does NOT block any outbound Google call (no MapsService import)", () => {
    // The lib is observability-only — never on the hot path.
    expect(LIB).not.toMatch(/import[\s\S]+?mapsService/);
    expect(LIB).not.toMatch(/googleEstimateRoute|MapsService\./);
  });
});

describe("TA-GAP-09 Phase 3 — route + cron wiring", () => {
  it("GET /transport/maps-usage/thresholds is registered with fleet.bookings:view", () => {
    expect(ROUTES).toMatch(
      /transportPlanningRouter\.get\(\s*"\/transport\/maps-usage\/thresholds",\s*authorize\(\{\s*feature:\s*"fleet\.bookings",\s*action:\s*"view"\s*\}\)/,
    );
  });

  it("PUT /transport/maps-usage/thresholds is registered with fleet.bookings:update", () => {
    expect(ROUTES).toMatch(
      /transportPlanningRouter\.put\(\s*"\/transport\/maps-usage\/thresholds",\s*authorize\(\{\s*feature:\s*"fleet\.bookings",\s*action:\s*"update"\s*\}\)/,
    );
  });

  it("PUT validates period as enum + positive int + warningPct in [1,99]", () => {
    expect(ROUTES).toMatch(/period:\s*z\.enum\(\["daily",\s*"monthly"\]\)/);
    expect(ROUTES).toMatch(/callCountThreshold:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)/);
    expect(ROUTES).toMatch(/warningPct:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(99\)\.optional\(\)/);
  });

  it("cron registers `maps_usage_threshold_alerts` at */15 cadence", () => {
    expect(CRON).toMatch(
      /name:\s*"maps_usage_threshold_alerts",[\s\S]+?schedule:\s*"\*\/15 \* \* \* \*",[\s\S]+?handler:\s*mapsUsageThresholdAlerts/,
    );
  });

  it("cron handler dynamic-imports the lib (keeps cold-start hot path light)", () => {
    expect(CRON).toMatch(/await import\("\.\/fleet\/mapsUsageThresholdAlerts\.js"\)/);
  });
});

describe("TA-GAP-09 Phase 3 — boundary intact", () => {
  it("Phase 3 does NOT touch finance / GL / journal modules", () => {
    expect(LIB).not.toMatch(/financialEngine|postingEngine|journalEngine|generalLedger|invoiceLine/);
  });

  it("Phase 1's counter file is unchanged (no behavioural drift)", () => {
    const counter = readFileSync(
      join(repoRoot, "artifacts/api-server/src/lib/fleet/mapsUsageCounter.ts"),
      "utf8",
    );
    expect(counter).toMatch(/ON CONFLICT \("companyId", "callDate", provider, "apiSurface"\)/);
    expect(counter).toMatch(/export async function recordMapsCall\(/);
    expect(counter).toMatch(/export async function loadMapsUsage\(/);
  });

  it("Phase 3 reads the Phase 1 counter table (no parallel storage)", () => {
    // The lib must SUM from `maps_usage_daily_counters` rather than
    // maintaining its own counter — single source of truth.
    expect(LIB).toMatch(/FROM maps_usage_daily_counters/);
  });
});
