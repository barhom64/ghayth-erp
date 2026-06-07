/**
 * Routing-rules activation ratchet.
 *
 * The notification engine only fans out beyond in_app when a routing
 * rule exists for the event's top-level prefix (getRoutingRule splits
 * the category on "."). Migration 256 seeds GLOBAL (companyId NULL)
 * defaults for every prefix the auto-fire listeners use. This test
 * parses the seed and asserts:
 *   1. every prefix the listeners emit has a rule, and
 *   2. the channel lists are valid JSON arrays of known channels.
 *
 * If a new auto-fire event is wired without a routing rule, the event
 * would silently degrade to in_app only — this ratchet catches that.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SEED = readFileSync(
  join(import.meta.dirname!, "../../src/migrations/256_seed_notification_routing_rules.sql"),
  "utf8",
);

const VALID_CHANNELS = new Set(["in_app", "email", "sms", "whatsapp", "push", "webhook"]);

// Every prefix an auto-fire listener (eventListeners.ts / cronScheduler.ts)
// routes through notifyBusinessEvent must appear here.
const REQUIRED_PREFIXES = [
  "leave", "payroll", "invoice", "document", "contract", "approval",
  "task", "support", "fleet", "inventory", "property", "opportunity",
  "overtime", "loan", "exit", "purchase_request", "purchase_order",
  "expense", "lead", "umrah", "user", "discipline", "attendance",
  "receipt", "payment", "project",
];

describe("notification routing rules seed", () => {
  for (const prefix of REQUIRED_PREFIXES) {
    it(`seeds a rule for "${prefix}"`, () => {
      expect(SEED.includes(`('${prefix}',`), `missing routing rule for ${prefix}`).toBe(true);
    });
  }

  it("every channel array is valid JSON with known channels and includes in_app", () => {
    // Pull every '[...]' channel literal out of the VALUES list.
    const arrays = SEED.match(/'\[[^\]]*\]'/g) ?? [];
    expect(arrays.length).toBeGreaterThanOrEqual(REQUIRED_PREFIXES.length);
    for (const raw of arrays) {
      const parsed = JSON.parse(raw.slice(1, -1)) as string[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toContain("in_app");
      for (const ch of parsed) {
        expect(VALID_CHANNELS.has(ch), `unknown channel ${ch}`).toBe(true);
      }
    }
  });

  it("seeds global defaults (companyId NULL) so every tenant inherits", () => {
    expect(SEED).toMatch(/SELECT\s+NULL\s*,\s*t\.prefix/);
  });

  it("is idempotent via WHERE NOT EXISTS on (NULL, prefix)", () => {
    expect(SEED).toContain("WHERE NOT EXISTS");
    expect(SEED).toMatch(/nr\."companyId"\s+IS\s+NULL\s+AND\s+nr\."eventCategory"\s*=\s*t\.prefix/);
  });

  it("carries a rollback annotation (migration policy)", () => {
    expect(SEED).toMatch(/@rollback:/);
  });
});
