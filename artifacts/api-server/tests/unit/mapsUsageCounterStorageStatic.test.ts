import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TA-GAP-09 Phase 1 — Maps Quota Monitoring (storage + counter
 * wiring). Audit doc file 20 §10 «مراقبة حصة الخرائط».
 *
 * Phase 1 records every outbound call MapsService makes to a real
 * provider into a per-day, per-(provider, apiSurface), per-company
 * counter table. Phase 2 (follow-up PR) adds the dashboard GET +
 * threshold cron.
 *
 * Critical invariants (per the owner brief):
 *   1. The counter is OBSERVABILITY, not the system of record — a
 *      counter outage must NEVER break a route estimate.
 *   2. Counts happen on OUR side (every outbound call we make), not
 *      via the Google Cloud Billing API — keeps caps + alerts
 *      independent of upstream console access.
 *   3. The counter increments are atomic via UPSERT, so concurrent
 *      calls never lose increments.
 *   4. Migration 371 is idempotent — re-running over a partially-
 *      applied DB no-ops instead of erroring.
 *
 * Static pin (regex-only).
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const MIG = readFileSync(
  join(repoRoot, "artifacts/api-server/src/migrations/371_maps_usage_daily_counters.sql"),
  "utf8",
);
const SVC = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/fleet/mapsUsageCounter.ts"),
  "utf8",
);
const MAPS = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/fleet/mapsService.ts"),
  "utf8",
);

describe("TA-GAP-09 Phase 1 — migration 371 schema", () => {
  it("creates `maps_usage_daily_counters` with the expected shape", () => {
    expect(MIG).toMatch(/CREATE TABLE IF NOT EXISTS maps_usage_daily_counters/);
    expect(MIG).toMatch(/"companyId"\s+INTEGER NOT NULL REFERENCES companies\(id\) ON DELETE CASCADE/);
    expect(MIG).toMatch(/"callDate"\s+DATE\s+NOT NULL/);
    expect(MIG).toMatch(/provider\s+TEXT\s+NOT NULL/);
    expect(MIG).toMatch(/"apiSurface"\s+TEXT\s+NOT NULL/);
    expect(MIG).toMatch(/"callCount"\s+INTEGER NOT NULL DEFAULT 0/);
    expect(MIG).toMatch(/"errorCount"\s+INTEGER NOT NULL DEFAULT 0/);
  });

  it("UNIQUE index on (companyId, callDate, provider, apiSurface) — the UPSERT key", () => {
    // Without this index, the ON CONFLICT clause in recordMapsCall
    // would fail and EVERY counter write would error out.
    expect(MIG).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS maps_usage_daily_counters_uniq\s*\n\s*ON maps_usage_daily_counters \("companyId", "callDate", provider, "apiSurface"\)/,
    );
  });

  it("non-negative CHECK constraints on callCount + errorCount", () => {
    expect(MIG).toMatch(
      /CONSTRAINT maps_usage_daily_counters_callcount_nonneg[\s\S]{0,60}?CHECK \("callCount" >= 0\)/,
    );
    expect(MIG).toMatch(
      /CONSTRAINT maps_usage_daily_counters_errorcount_nonneg[\s\S]{0,60}?CHECK \("errorCount" >= 0\)/,
    );
  });

  it("constraints are wrapped in DO blocks that check pg_constraint — idempotency on re-run", () => {
    // A second run over a partially-applied DB must no-op, not error.
    expect(MIG).toMatch(/IF NOT EXISTS\s*\(\s*SELECT 1 FROM pg_constraint[\s\S]+?conname = 'maps_usage_daily_counters_callcount_nonneg'/);
    expect(MIG).toMatch(/IF NOT EXISTS\s*\(\s*SELECT 1 FROM pg_constraint[\s\S]+?conname = 'maps_usage_daily_counters_errorcount_nonneg'/);
  });

  it("ships a rollback recipe in the comment header", () => {
    expect(MIG).toMatch(/@rollback:[\s\S]+?DROP TABLE IF EXISTS maps_usage_daily_counters/);
  });
});

describe("TA-GAP-09 Phase 1 — counter service (mapsUsageCounter.ts)", () => {
  it("exports `recordMapsCall` + `loadMapsUsage`", () => {
    expect(SVC).toMatch(/export async function recordMapsCall\(/);
    expect(SVC).toMatch(/export async function loadMapsUsage\(/);
  });

  it("`recordMapsCall` NEVER throws — wraps the INSERT in try/catch + logger.warn", () => {
    const body = SVC.match(/export async function recordMapsCall[\s\S]+?^}/m);
    expect(body, "recordMapsCall body not found").toBeTruthy();
    expect(body![0]).toMatch(/try\s*\{[\s\S]+?await rawExecute[\s\S]+?\}\s*catch[\s\S]+?logger\.warn/);
  });

  it("`recordMapsCall` uses an atomic UPSERT (ON CONFLICT … DO UPDATE)", () => {
    // Concurrent calls must never lose an increment. The single
    // INSERT … ON CONFLICT path guarantees the +1 is applied under
    // a single row-level lock instead of read-then-write.
    expect(SVC).toMatch(
      /INSERT INTO maps_usage_daily_counters[\s\S]+?ON CONFLICT \("companyId", "callDate", provider, "apiSurface"\)[\s\S]+?DO UPDATE SET[\s\S]+?"callCount"\s*=\s*maps_usage_daily_counters\."callCount"\s*\+\s*1/,
    );
  });

  it("errored=true bumps errorCount alongside callCount (every call counts, errors are extra)", () => {
    // Both counters must increment when errored=true — total calls
    // includes the failed ones (we paid for them either way).
    expect(SVC).toMatch(/"errorCount"\s*=\s*maps_usage_daily_counters\."errorCount"\s*\+\s*EXCLUDED\."errorCount"/);
  });

  it("`loadMapsUsage` clamps the window to [1, 366] days", () => {
    expect(SVC).toMatch(/Math\.min\s*\(\s*Math\.max\s*\(\s*args\.days\s*\?\?\s*30,\s*1\s*\),\s*366\s*\)/);
  });
});

describe("TA-GAP-09 Phase 1 — MapsService wiring", () => {
  it("imports `recordMapsCall` from the counter module", () => {
    expect(MAPS).toMatch(/import\s*\{\s*recordMapsCall\s*\}\s*from\s+["']\.\/mapsUsageCounter\.js["']/);
  });

  it("calls `recordMapsCall` after every googleEstimateRoute call (success + failure)", () => {
    // The counter must fire whether `real` is non-null (success) or
    // null (failure) — every paid Google call counts.
    expect(MAPS).toMatch(
      /const real = await googleEstimateRoute\([\s\S]+?\}\);[\s\S]{0,400}?await recordMapsCall\(\s*\{[\s\S]+?provider:\s*"google_maps"[\s\S]+?apiSurface:\s*"estimateRoute"[\s\S]+?errored:\s*real === null/,
    );
  });

  it("the counter call does NOT precede `googleEstimateRoute` — count after the fact", () => {
    // Order matters: we count what we ACTUALLY called, not what we
    // intended to call. The order also lets `errored: real === null`
    // be a meaningful signal.
    const block = MAPS.match(/if \(targetProvider === "google_maps" && apiKey\)\s*\{([\s\S]+?)^\s{4}\}/m);
    expect(block, "google branch not found").toBeTruthy();
    const code = block![1];
    expect(code.indexOf("googleEstimateRoute")).toBeLessThan(code.indexOf("recordMapsCall"));
  });
});

describe("TA-GAP-09 Phase 1 — boundary intact", () => {
  it("counter service does NOT touch the bytes of any finance / GL / journal module", () => {
    // Defence-in-depth: the counter is observability-only — never a
    // posting source, never a billing source.
    expect(SVC).not.toMatch(/financialEngine|postingEngine|journalEngine|generalLedger|invoiceLine/);
  });

  it("Phase 1 does NOT add a route handler — the GET endpoint is deferred to Phase 2", () => {
    // The owner brief separated storage (Phase 1) from API surface
    // (Phase 2) so this PR stays small and reviewable. If a future
    // change leaks a /fleet/maps/usage route into Phase 1, the route
    // file would carry the new path — this static check catches it.
    const routes = readFileSync(
      join(repoRoot, "artifacts/api-server/src/routes/fleet.ts"),
      "utf8",
    );
    expect(routes).not.toMatch(/\/fleet\/maps\/usage/);
  });
});
