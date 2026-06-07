/**
 * Guards the frontend routing-category catalog against the backend seed.
 *
 * The admin routing UI offers ROUTING_CATEGORIES as a dropdown so
 * operators can only create rules the engine actually matches (it keys
 * on the event prefix). Those category values MUST be a subset of the
 * prefixes seeded as global defaults in migration 256 — otherwise the
 * UI would offer a category with no engine support, or the seed would
 * cover a prefix the UI hides.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname!, "../../../..");

const catalogSrc = readFileSync(
  join(ROOT, "artifacts/ghayth-erp/src/lib/notification-categories.ts"),
  "utf8",
);
const seedSrc = readFileSync(
  join(ROOT, "artifacts/api-server/src/migrations/256_seed_notification_routing_rules.sql"),
  "utf8",
);

// Pull `value: "x"` entries from the catalog.
const catalogValues = Array.from(catalogSrc.matchAll(/value:\s*"([a-z_]+)"/g)).map((m) => m[1]);
// Pull `('x',` prefixes from the seed VALUES list.
const seedPrefixes = Array.from(seedSrc.matchAll(/\('([a-z_]+)',\s*'\[/g)).map((m) => m[1]);

describe("notification routing category catalog ↔ seed parity", () => {
  it("catalog is non-empty", () => {
    expect(catalogValues.length).toBeGreaterThanOrEqual(26);
  });

  it("every UI category has a seeded global default rule", () => {
    const seedSet = new Set(seedPrefixes);
    for (const v of catalogValues) {
      expect(seedSet.has(v), `UI offers "${v}" but migration 256 has no rule for it`).toBe(true);
    }
  });

  it("every seeded prefix is offered in the UI catalog", () => {
    const catSet = new Set(catalogValues);
    for (const p of seedPrefixes) {
      expect(catSet.has(p), `migration 256 seeds "${p}" but the UI catalog omits it`).toBe(true);
    }
  });
});
