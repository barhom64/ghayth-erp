/**
 * Notification-templates inventory — orphan-key ratchet.
 *
 * The Jun 2026 full-system audit surfaced 10 template keys that are
 * referenced in route/lib code (templateKey: "...") but NEVER seeded in
 * notification_templates — silent failures at send time. Migration 418
 * closes that gap.
 *
 * This smoke test pins:
 *   1. Migration 418 exists and seeds all 10 keys with ar+en pairs.
 *   2. Every code-side templateKey IS seeded by at least one migration
 *      (no NEW orphan can land without this test failing).
 *
 * The check is purely static (no DB) — it parses migration SQL + scans
 * source files for templateKey usage. Catches a regression the moment a
 * new template key is introduced in code without a paired seed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "..", "..", "..", "..");
const SRC = join(REPO_ROOT, "artifacts/api-server/src");
const MIG_DIR = join(SRC, "migrations");

function readAllTemplateKeysFromCode(): Set<string> {
  const keys = new Set<string>();
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (p.endsWith(".ts")) {
        const txt = readFileSync(p, "utf8");
        for (const m of txt.matchAll(/templateKey:\s*"([a-z_]+\.[a-z_.]+)"/g)) {
          keys.add(m[1]!);
        }
      }
    }
  };
  walk(SRC);
  return keys;
}

function readAllSeededTemplateKeys(): Set<string> {
  const keys = new Set<string>();
  for (const f of readdirSync(MIG_DIR)) {
    if (!f.endsWith(".sql")) continue;
    const txt = readFileSync(join(MIG_DIR, f), "utf8");
    if (!txt.includes("notification_templates")) continue;
    // A migration that seeds rows always has these keys quoted as the first
    // column of each VALUES tuple. We match any single-quoted token that
    // looks like a dotted templateKey.
    for (const m of txt.matchAll(/'([a-z_]+\.[a-z_.]+)'/g)) {
      const v = m[1]!;
      if (!/(http|@|:\/\/|\.sa$|\.com$|\.sql$)/.test(v)) keys.add(v);
    }
  }
  return keys;
}

describe("Notification template seed inventory", () => {
  it("migration 418 exists and seeds all 10 audited orphans (ar + en)", () => {
    const mig = readFileSync(
      join(MIG_DIR, "418_seed_orphan_notification_templates.sql"),
      "utf8",
    );
    const expected = [
      "auth.new_device_login.email",
      "employee.self_onboarding",
      "employee.welcome",
      "fleet.cargo.driver_assigned",
      "fleet.trip.driver_assigned",
      "support.csat.survey",
      "umrah.pilgrim.overstay_warning",
      "umrah.transport.driver_assigned",
      "umrah.trip.departure_reminder",
      "umrah.visa.expiring",
    ];
    for (const key of expected) {
      // Each key must appear at least twice: once for ar, once for en.
      const count = mig.split(`'${key}'`).length - 1;
      expect(count, `template ${key} must appear ≥2× (ar+en) in 418`).toBeGreaterThanOrEqual(2);
    }
    // Idempotency guard: WHERE NOT EXISTS must be present so re-running the
    // migration in any environment is safe.
    expect(mig).toContain("WHERE NOT EXISTS");
  });

  it("every templateKey used in code is seeded by some migration (no new orphan)", () => {
    const used = readAllTemplateKeysFromCode();
    const seeded = readAllSeededTemplateKeys();
    const orphans = [...used].filter((k) => !seeded.has(k)).sort();
    expect(
      orphans,
      `code references these templateKeys but no migration seeds them — add a seed before merging:\n  ${orphans.join("\n  ")}`,
    ).toEqual([]);
  });
});
