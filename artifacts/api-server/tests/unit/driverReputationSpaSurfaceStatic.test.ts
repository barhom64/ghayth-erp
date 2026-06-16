import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TA-T18-DR — SPA surface for driver reputation.
 *
 * Phase 1 (#2397) shipped the storage + compute + read API. Phase 2
 * (#2409) wired reputation into the assignment engine. But the
 * dispatcher-facing drivers list never SHOWED the score — the data
 * was computed + persisted + returned by `GET /fleet/drivers`
 * (`SELECT d.*` includes every reputation column) yet invisible.
 *
 * This change surfaces it: a sortable "السمعة" column with a tiered
 * badge + the full breakdown in the quick-preview dialog.
 *
 * Static pin (regex-only, per package-locality).
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const PAGE = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/pages/fleet/drivers.tsx"),
  "utf8",
);
const ROUTE = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/fleet.ts"),
  "utf8",
);

describe("TA-T18-DR — drivers list reputation surface", () => {
  it("the backend list query returns every column via SELECT d.* (reputation included)", () => {
    // `SELECT d.*` from fleet_drivers carries reputationScore +
    // the sub-components automatically — no explicit projection
    // needed. Pin the shape so a future narrowing of the SELECT
    // doesn't silently drop the reputation columns.
    expect(ROUTE).toMatch(/SELECT d\.\*, e\.name AS "employeeName"[\s\S]+?FROM fleet_drivers d/);
  });

  it("renders a ReputationBadge component with tiered thresholds (≥85 / <60)", () => {
    expect(PAGE).toMatch(/function ReputationBadge\(/);
    // High tier ≥ 85, low tier < 60 — mirrors the engine tiering (#2409).
    expect(PAGE).toMatch(/n >= 85/);
    expect(PAGE).toMatch(/n < 60/);
  });

  it("NULL reputation renders the neutral 'لا توجد بيانات' (no false zero)", () => {
    // A fresh hire with no trips must NOT show 0/100 — that would
    // misrepresent an unmeasured driver as the worst driver.
    expect(PAGE).toMatch(/score == null[\s\S]{0,120}?لا توجد بيانات/);
  });

  it("adds a sortable 'السمعة' column bound to reputationScore", () => {
    expect(PAGE).toMatch(
      /key:\s*"reputationScore",\s*\n\s*header:\s*"السمعة",\s*\n\s*sortable:\s*true,\s*\n\s*render:\s*\(d\)\s*=>\s*<ReputationBadge score=\{d\.reputationScore\}/,
    );
  });

  it("the quick-preview dialog surfaces the full breakdown (4 sub-rates + trips + computedAt)", () => {
    expect(PAGE).toMatch(/key:\s*"reputationScore"/);
    expect(PAGE).toMatch(/key:\s*"reputationOnTimeRate"/);
    expect(PAGE).toMatch(/key:\s*"reputationCompletionRate"/);
    expect(PAGE).toMatch(/key:\s*"reputationStartRate"/);
    expect(PAGE).toMatch(/key:\s*"reputationTripsConsidered"/);
    expect(PAGE).toMatch(/key:\s*"reputationComputedAt",\s*type:\s*"date"/);
  });

  it("the breakdown field keys match migration 370's column names exactly", () => {
    // Cross-check the SPA keys against the actual DDL so a rename on
    // either side is caught.
    const mig = readFileSync(
      join(repoRoot, "artifacts/api-server/src/migrations/370_driver_reputation_metrics.sql"),
      "utf8",
    );
    for (const col of [
      "reputationScore",
      "reputationOnTimeRate",
      "reputationCompletionRate",
      "reputationStartRate",
      "reputationTripsConsidered",
      "reputationComputedAt",
    ]) {
      expect(mig, `migration missing ${col}`).toMatch(new RegExp(`"${col}"`));
      expect(PAGE, `page missing ${col}`).toMatch(new RegExp(`"${col}"`));
    }
  });
});
