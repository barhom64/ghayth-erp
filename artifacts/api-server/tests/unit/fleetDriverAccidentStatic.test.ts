import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Driver field accident report — Batch C1 of the driver field endpoints.
 *
 * A driver reports a vehicle accident from the field (POST /me/accidents);
 * supervisors see it (GET /accidents). This batch is REPORTING ONLY and
 * strictly LEDGER-FREE — the accounting derivation by costBearer (employee
 * receivable / HR claim / fleet violation) is Batch C2, a separate PR that
 * ships WITH assertion tests on the journal lines (constitution rule 3).
 *
 * Invariants locked (static / regex-only, no DB):
 *   1. SELF-ATTRIBUTION: driverId forced from resolveDriverFromScope, gated by
 *      fleet.driver.me.
 *   2. LEDGER-FREE: no journal/GL/expense-candidate/postJournalEntry call, and
 *      the handler never sets costBearer (assessment is C2's job).
 *   3. Migration 398 creates fleet_accidents additively with CHECK guards and
 *      NO financial FK; costBearer stays NULL until assessment.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const FLEET = readFileSync(join(repoRoot, "artifacts/api-server/src/routes/fleet.ts"), "utf8");
const MIG = readFileSync(
  join(repoRoot, "artifacts/api-server/src/migrations/398_fleet_accidents.sql"), "utf8");

function handlerBlock(method: string, path: string): string {
  const re = new RegExp(`router\\.${method}\\("${path.replace(/\//g, "\\/")}"[\\s\\S]+?\\n\\}\\);`);
  const m = FLEET.match(re);
  expect(m, `${method.toUpperCase()} ${path} handler not found`).toBeTruthy();
  return m![0];
}

describe("driver accident report — POST /me/accidents", () => {
  const block = () => handlerBlock("post", "/me/accidents");
  it("is gated by fleet.driver.me update", () => {
    expect(block()).toMatch(/authorize\(\{\s*feature:\s*"fleet\.driver\.me",\s*action:\s*"update"\s*\}\)/);
  });
  it("forces driverId from scope, not the body, inserting into fleet_accidents", () => {
    const b = block();
    expect(b).toMatch(/resolveDriverFromScope\(req\)/);
    expect(b).toMatch(/INSERT INTO fleet_accidents[\s\S]+?driver\.id,/);
    expect(b).not.toMatch(/b\.driverId/);
  });
  it("is LEDGER-FREE and does not set costBearer (C2 territory)", () => {
    const b = block();
    expect(b).not.toMatch(/postJournalEntry|ExpenseCandidate|journal_entries|postToLedger|INSERT INTO gl_/);
    expect(b).not.toMatch(/costBearer/);
    // the row is created in the operational 'reported' state
    expect(b).toMatch(/'reported'/);
  });
});

describe("accident supervision — GET /accidents", () => {
  it("is scoped (fleet.vehicles list + buildScopedWhere)", () => {
    const b = handlerBlock("get", "/accidents");
    expect(b).toMatch(/authorize\(\{\s*feature:\s*"fleet\.vehicles",\s*action:\s*"list"\s*\}\)/);
    expect(b).toMatch(/buildScopedWhere\(/);
  });
});

describe("migration 398 — fleet_accidents table", () => {
  it("creates the table additively with severity/status/costBearer CHECK guards", () => {
    expect(MIG).toMatch(/CREATE TABLE IF NOT EXISTS fleet_accidents/);
    expect(MIG).toMatch(/fleet_accident_severity_chk[\s\S]+?'minor','moderate','severe','total_loss'/);
    expect(MIG).toMatch(/fleet_accident_status_chk/);
    expect(MIG).toMatch(/fleet_accident_cost_bearer_chk[\s\S]+?'company','driver','insurance','customer','tenant','third_party'/);
  });
  it("carries NO financial foreign key (ledger derivation is deferred to C2)", () => {
    expect(MIG).not.toMatch(/journal|gl_|chart_of_accounts|REFERENCES finance|account_id/i);
  });
});
