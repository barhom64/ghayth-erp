import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 follow-up — mapsService.loadPlanningSettings lazy-create
 * MUST use rawQuery (not rawExecute) because
 * transport_planning_settings has no `id` column.
 *
 * Bug surface (discovered during A-02 live-DB run): rawExecute
 * auto-appends `RETURNING id` to any non-RETURNING DML. When the
 * lazy-create branch fired against a freshly-bootstrapped company
 * (no row in transport_planning_settings yet), the INSERT crashed
 * with Postgres error 42703 "column id does not exist" because the
 * table's PK is `companyId`, not a synthetic `id`. The very first
 * `POST /api/transport/bookings/:id/suggest-assignment` call after
 * a bootstrap therefore 500'd — silently in production because the
 * existing companies already had a row and never hit the branch.
 *
 * This static test pins the fix: the lazy-create INSERT runs
 * through rawQuery, the ON CONFLICT DO NOTHING upsert clause is
 * preserved, and rawExecute is NOT called on this table anywhere
 * in the file (would re-introduce the same bug from a sibling
 * helper).
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const MAPS = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/fleet/mapsService.ts"),
  "utf8",
);

describe("#2079 follow-up — loadPlanningSettings lazy-create avoids rawExecute", () => {
  it("loadPlanningSettings calls rawQuery (not rawExecute) for the lazy-create INSERT", () => {
    // Pull the function body and inspect the INSERT branch only.
    const fnBlock = MAPS.match(
      /export async function loadPlanningSettings[\s\S]+?^\}/m,
    );
    expect(fnBlock, "loadPlanningSettings not found").toBeTruthy();
    expect(fnBlock![0]).toMatch(
      /await rawQuery\(\s*`INSERT INTO transport_planning_settings/,
    );
    expect(fnBlock![0]).not.toMatch(
      /await rawExecute\(\s*`INSERT INTO transport_planning_settings/,
    );
  });

  it("the ON CONFLICT DO NOTHING upsert clause is preserved", () => {
    const fnBlock = MAPS.match(
      /export async function loadPlanningSettings[\s\S]+?^\}/m,
    );
    expect(fnBlock).toBeTruthy();
    expect(fnBlock![0]).toMatch(/ON CONFLICT \("companyId"\) DO NOTHING/);
  });

  it("no rawExecute call on transport_planning_settings anywhere in mapsService.ts", () => {
    // Sibling helpers (updatePlanningSettings) write to the same
    // table; they're allowed to use rawExecute on UPDATE because
    // UPDATE doesn't auto-return id. The ban is on rawExecute +
    // INSERT/UPSERT against this id-less table.
    expect(MAPS).not.toMatch(
      /rawExecute\([\s\S]{0,200}?INSERT INTO transport_planning_settings/,
    );
    expect(MAPS).not.toMatch(
      /rawExecute\([\s\S]{0,200}?INSERT[\s\S]{0,80}?transport_planning_settings[\s\S]{0,200}?ON CONFLICT/,
    );
  });
});
