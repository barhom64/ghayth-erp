import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Driver field fuel self-report — POST/GET /me/fuel-logs.
 *
 * Batch A of the "driver field endpoints" work. A driver records the
 * OPERATIONAL FACT of a fuel fill-up for their vehicle. Two invariants the
 * constitution demands and this static test locks:
 *
 *   1. SELF-ATTRIBUTION: driverId is forced to the scope-resolved driver,
 *      never read from the request body — a driver cannot report on behalf of
 *      another. Gated by the driver-self feature `fleet.driver.me`.
 *
 *   2. LEDGER-FREE: the path creates a finance EXPENSE CANDIDATE
 *      (createFuelExpenseCandidate → transport_billing_candidates), which the
 *      accountant materialises later — it never posts a journal/GL entry
 *      itself. Operational truth → finance derives.
 *
 * Static / regex-only — no DB.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const FLEET = readFileSync(join(repoRoot, "artifacts/api-server/src/routes/fleet.ts"), "utf8");

function handlerBlock(method: string, path: string): string {
  const re = new RegExp(
    `router\\.${method}\\("${path.replace(/\//g, "\\/")}"[\\s\\S]+?\\n\\}\\);`,
  );
  const m = FLEET.match(re);
  expect(m, `${method.toUpperCase()} ${path} handler not found`).toBeTruthy();
  return m![0];
}

describe("driver fuel self-report — POST /me/fuel-logs", () => {
  const block = () => handlerBlock("post", "/me/fuel-logs");

  it("is gated by the driver-self feature fleet.driver.me", () => {
    expect(block()).toMatch(/authorize\(\{\s*feature:\s*"fleet\.driver\.me",\s*action:\s*"update"\s*\}\)/);
  });

  it("forces driverId to the scope-resolved driver, not the request body", () => {
    const b = block();
    expect(b).toMatch(/resolveDriverFromScope\(req\)/);
    // INSERT must bind driver.id as the driverId column — self-attribution.
    expect(b).toMatch(/INSERT INTO fleet_fuel_logs[\s\S]+?driver\.companyId,\s*resolvedVehicleId,\s*driver\.id,/);
    // the handler must NOT trust a body-supplied driverId
    expect(b).not.toMatch(/b\.driverId/);
  });

  it("validates the vehicle inside the driver's company", () => {
    expect(block()).toMatch(/FROM fleet_vehicles WHERE id = \$1 AND "companyId" = \$2/);
  });

  it("is LEDGER-FREE: queues a finance candidate, never posts GL/journal directly", () => {
    const b = block();
    expect(b).toMatch(/createFuelExpenseCandidate/);
    expect(b).not.toMatch(/postFuelGL|journal_entries|INSERT INTO gl_|postToLedger/);
  });
});

describe("driver fuel self-report — GET /me/fuel-logs", () => {
  it("is gated by fleet.driver.me view and filtered to the driver's own logs", () => {
    const b = handlerBlock("get", "/me/fuel-logs");
    expect(b).toMatch(/authorize\(\{\s*feature:\s*"fleet\.driver\.me",\s*action:\s*"view"\s*\}\)/);
    expect(b).toMatch(/WHERE f\."driverId" = \$1 AND f\."companyId" = \$2/);
  });
});
