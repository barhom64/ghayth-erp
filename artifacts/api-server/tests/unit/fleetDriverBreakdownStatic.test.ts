import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Driver field breakdown report — Batch B of the driver field endpoints.
 *
 * A driver reports a vehicle breakdown from the field (POST /me/breakdowns);
 * fleet supervisors track it (GET /breakdowns, PATCH /breakdowns/:id).
 *
 * Invariants locked here (static / regex-only, no DB):
 *   1. SELF-ATTRIBUTION on the driver report: driverId forced from
 *      resolveDriverFromScope, gated by fleet.driver.me.
 *   2. LEDGER-FREE: the report is an operational fact with no cost — no GL /
 *      journal / expense-candidate touch (repair cost is handled later by the
 *      existing maintenance/costBearer path, not here).
 *   3. The new table fleet_breakdowns is created additively with status &
 *      severity CHECK guards and NO financial FK.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const FLEET = readFileSync(join(repoRoot, "artifacts/api-server/src/routes/fleet.ts"), "utf8");
const MIG = readFileSync(
  join(repoRoot, "artifacts/api-server/src/migrations/397_fleet_breakdowns.sql"), "utf8");

function handlerBlock(method: string, path: string): string {
  const re = new RegExp(`router\\.${method}\\("${path.replace(/\//g, "\\/").replace(/:/g, ":")}"[\\s\\S]+?\\n\\}\\);`);
  const m = FLEET.match(re);
  expect(m, `${method.toUpperCase()} ${path} handler not found`).toBeTruthy();
  return m![0];
}

describe("driver breakdown report — POST /me/breakdowns", () => {
  const block = () => handlerBlock("post", "/me/breakdowns");
  it("is gated by fleet.driver.me update", () => {
    expect(block()).toMatch(/authorize\(\{\s*feature:\s*"fleet\.driver\.me",\s*action:\s*"update"\s*\}\)/);
  });
  it("forces driverId from scope, not the body, and inserts into fleet_breakdowns", () => {
    const b = block();
    expect(b).toMatch(/resolveDriverFromScope\(req\)/);
    expect(b).toMatch(/INSERT INTO fleet_breakdowns[\s\S]+?driver\.id,/);
    expect(b).not.toMatch(/b\.driverId/);
  });
  it("is LEDGER-FREE — no GL/journal/expense-candidate posting", () => {
    const b = block();
    expect(b).not.toMatch(/createFuelExpenseCandidate|ExpenseCandidate|journal_entries|postToLedger|INSERT INTO gl_/);
  });
});

describe("breakdown supervision endpoints", () => {
  it("GET /breakdowns is scoped (fleet.vehicles list + buildScopedWhere)", () => {
    const b = handlerBlock("get", "/breakdowns");
    expect(b).toMatch(/authorize\(\{\s*feature:\s*"fleet\.vehicles",\s*action:\s*"list"\s*\}\)/);
    expect(b).toMatch(/buildScopedWhere\(/);
  });
  it("PATCH /breakdowns/:id guards the status transition set", () => {
    const b = handlerBlock("patch", "/breakdowns/:id");
    expect(b).toMatch(/authorize\(\{\s*feature:\s*"fleet\.vehicles",\s*action:\s*"update"\s*\}\)/);
    expect(b).toMatch(/acknowledged[\s\S]+in_repair[\s\S]+resolved[\s\S]+cancelled/);
  });
});

describe("migration 397 — fleet_breakdowns table", () => {
  it("creates the table additively with severity & status CHECK guards", () => {
    expect(MIG).toMatch(/CREATE TABLE IF NOT EXISTS fleet_breakdowns/);
    expect(MIG).toMatch(/fleet_breakdown_severity_chk[\s\S]+?'low','medium','high','critical'/);
    expect(MIG).toMatch(/fleet_breakdown_status_chk[\s\S]+?'reported','acknowledged','in_repair','resolved','cancelled'/);
  });
  it("carries NO financial foreign key (ledger-free by construction)", () => {
    expect(MIG).not.toMatch(/journal|gl_|chart_of_accounts|REFERENCES finance|account_id/i);
  });
});
