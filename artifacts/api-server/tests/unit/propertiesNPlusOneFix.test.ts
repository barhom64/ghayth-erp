/**
 * Properties N+1 fix — TWO sites, both 3×N+1.
 *
 * Site 1 — property owners list (the heavy one):
 *
 *     SELECT o.*,
 *       (SELECT COUNT(*) FROM property_buildings ...) AS "buildingCount",
 *       (SELECT COUNT(*) FROM property_units      ...) AS "unitCount",
 *       (SELECT COUNT(*) FROM rental_contracts    ...) AS "activeContracts"
 *     FROM property_owners o
 *     ... LIMIT 500
 *
 * Three correlated subqueries × 500 owners = 1501 lookups across
 * three sibling tables. Heaviest 3×N+1 fixed in this session.
 *
 * Site 2 — property unit detail contracts (LIMIT 10):
 *
 *     SELECT rc.*,
 *       (SELECT COUNT(*) FROM rent_payments ... AND status='paid'),
 *       (SELECT COALESCE(SUM(amount),0) FROM rent_payments ...),
 *       (SELECT COALESCE(SUM("paidAmount"),0) FROM rent_payments ...)
 *
 * Three subqueries × 10 contracts = 31 lookups. Smaller absolute
 * impact but the same shape, and the FIX uses `COUNT(*) FILTER`
 * which collapses count + sum aggregates into ONE scan.
 *
 * Same N+1 pattern as the earlier fixes (#1564 → #1628), applied
 * to a fourteenth + fifteenth table cluster.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/properties.ts"),
  "utf8",
);

// ─── Site 1 — property owners list ──────────────────────────────────────────

describe("Property owners list — 3×N+1 fix", () => {
  // The owners-list query is unique because it references
  // property_owners + the three sibling tables in the same block.
  const blockIdx = SRC.indexOf("FROM property_owners o");
  // Walk backward to grab the SELECT preamble.
  const block = SRC.slice(blockIdx - 2500, blockIdx + 500);

  it("the owners-list query is locatable", () => {
    expect(blockIdx).toBeGreaterThan(0);
  });

  it("no longer carries any of the three correlated COUNT subqueries", () => {
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+property_buildings\s+WHERE\s+"ownerId"\s*=\s*o\.id/,
    );
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+property_units\s+WHERE\s+"ownerId"\s*=\s*o\.id/,
    );
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+rental_contracts\s+WHERE\s+"ownerId"\s*=\s*o\.id/,
    );
  });

  it("uses three sibling CTEs (building_counts, unit_counts, active_contract_counts)", () => {
    expect(block).toContain("WITH building_counts AS");
    expect(block).toContain("unit_counts AS");
    expect(block).toContain("active_contract_counts AS");
  });

  it("each CTE aggregates by ownerId once", () => {
    expect(block).toContain(`GROUP BY "ownerId"`);
    // Three CTEs all group by ownerId — assert the group appears at
    // least 3 times.
    const matches = block.match(/GROUP BY "ownerId"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("LEFT JOINs all three CTEs back to property_owners", () => {
    expect(block).toMatch(/LEFT JOIN building_counts bc ON bc\."ownerId" = o\.id/);
    expect(block).toMatch(/LEFT JOIN unit_counts uc ON uc\."ownerId" = o\.id/);
    expect(block).toMatch(/LEFT JOIN active_contract_counts acc ON acc\."ownerId" = o\.id/);
  });

  it("COALESCEs all three counters to 0::int for the zero case", () => {
    expect(block).toContain(`COALESCE(bc."buildingCount", 0)::int`);
    expect(block).toContain(`COALESCE(uc."unitCount", 0)::int`);
    expect(block).toContain(`COALESCE(acc."activeContracts", 0)::int`);
  });

  it("preserves the active-only filter for rental_contracts", () => {
    const ccBlock = block.slice(block.indexOf("active_contract_counts AS"));
    expect(ccBlock).toContain("status='active'");
  });
});

// ─── Site 2 — property unit detail contracts ────────────────────────────────

describe("Property unit detail contracts — 3×N+1 fix via FILTER aggregate", () => {
  const blockIdx = SRC.indexOf("WITH payment_stats AS");
  const block = SRC.slice(blockIdx, blockIdx + 2000);

  it("the unit-detail contracts query is locatable", () => {
    expect(blockIdx).toBeGreaterThan(0);
  });

  it("no longer carries three correlated subqueries on rent_payments", () => {
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\([^)]+\)\s+FROM\s+rent_payments\s+WHERE\s+"contractId"\s*=\s*rc\.id/,
    );
    expect(block).not.toMatch(
      /\(SELECT\s+COALESCE\(SUM\([^)]+\),0\)\s+FROM\s+rent_payments\s+WHERE\s+"contractId"\s*=\s*rc\.id/,
    );
  });

  it("uses a single payment_stats CTE with COUNT(*) FILTER for paidCount", () => {
    expect(block).toContain("WITH payment_stats AS");
    expect(block).toContain(`COUNT(*) FILTER (WHERE status = 'paid') AS "paidCount"`);
    expect(block).toContain(`COALESCE(SUM(amount), 0) AS "totalAmount"`);
    expect(block).toContain(`COALESCE(SUM("paidAmount"), 0) AS "totalPaid"`);
    expect(block).toContain(`GROUP BY "contractId"`);
  });

  it("LEFT JOINs payment_stats back to rental_contracts", () => {
    expect(block).toMatch(
      /LEFT JOIN payment_stats ps ON ps\."contractId" = rc\.id/,
    );
  });

  it("COALESCEs all three values so contracts with no payments return 0", () => {
    expect(block).toContain(`COALESCE(ps."paidCount", 0) AS "paidCount"`);
    expect(block).toContain(`COALESCE(ps."totalAmount", 0) AS "totalAmount"`);
    expect(block).toContain(`COALESCE(ps."totalPaid", 0) AS "totalPaid"`);
  });
});
