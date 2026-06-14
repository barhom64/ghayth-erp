import { describe, it, expect } from "vitest";
import {
  UMRAH_POLICY_CATEGORIES,
  type PolicyCategory,
  type PolicyField,
} from "../../src/lib/umrahSettingsPoliciesCatalog.js";

/**
 * U-17-P1 — notification policy keys catalog.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-17 audit §3.1):
 *   - The `notifications` policy category gains 7 new fields:
 *     SMS/in-app split for the three outbound triggers (visa,
 *     departure, overstay) + `digestMode` select.
 *   - All defaults preserve current behaviour: SMS = false (the
 *     outbound module is dead today, U-17 audit §1.3), in-app =
 *     true (matches the wired internal cron path), digestMode =
 *     "per_event".
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine wiring (U-17-P2, borderline, owner-ratification gated).
 *   - No recipient expansion (U-17-P3).
 *   - No digest aggregation (U-17-P4).
 *   - No opt-out / multi-language (U-17-P5).
 *
 * Failure modes pinned:
 *   - One of the 7 keys is missing → §A fails.
 *   - SMS default flips to true → §B fails (would re-enable a dead
 *     code path silently).
 *   - In-app default flips to false → §B fails (would silence the
 *     manager's existing internal-notifications path).
 *   - digestMode select options change → §C fails (the cron will
 *     need new switch arms).
 */

const notifications = UMRAH_POLICY_CATEGORIES.find(
  (c: PolicyCategory) => c.id === "notifications",
);

const fieldByKey = (key: string): PolicyField | undefined =>
  notifications?.fields.find((f) => f.key === key);

// ─────────────────────────────────────────────────────────────────────────────
// §A — All 7 new keys present + correctly typed
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P1 §A — notifications category carries the 7 new keys", () => {
  it("notifications category exists", () => {
    expect(notifications, "notifications category not found in catalog").toBeTruthy();
  });

  for (const key of [
    "visaExpiringSms",
    "visaExpiringInApp",
    "departureSms",
    "departureInApp",
    "overstaySms",
    "overstayInApp",
  ]) {
    it(`field ${key} exists with type boolean`, () => {
      const f = fieldByKey(key);
      expect(f, `field ${key} missing`).toBeTruthy();
      expect(f!.type).toBe("boolean");
    });
  }

  it("field digestMode exists with type select", () => {
    const f = fieldByKey("digestMode");
    expect(f, "field digestMode missing").toBeTruthy();
    expect(f!.type).toBe("select");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Defaults preserve current behaviour
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P1 §B — defaults preserve current behaviour", () => {
  for (const key of ["visaExpiringSms", "departureSms", "overstaySms"]) {
    it(`${key} default is false (SMS path is dead today; default keeps it off)`, () => {
      expect(fieldByKey(key)?.defaultValue).toBe(false);
    });
  }

  for (const key of ["visaExpiringInApp", "departureInApp", "overstayInApp"]) {
    it(`${key} default is true (matches the wired internal cron path)`, () => {
      expect(fieldByKey(key)?.defaultValue).toBe(true);
    });
  }

  it("digestMode default is 'per_event' (current cron behaviour)", () => {
    expect(fieldByKey("digestMode")?.defaultValue).toBe("per_event");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — digestMode options carry exactly the two known values
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P1 §C — digestMode select options", () => {
  it("digestMode has exactly per_event + daily_digest", () => {
    const opts = fieldByKey("digestMode")?.options ?? [];
    const values = opts.map((o) => o.value).sort();
    expect(values).toEqual(["daily_digest", "per_event"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Existing notification keys preserved (no regression)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P1 §D — pre-existing notification keys preserved", () => {
  for (const key of [
    "notifyVisaExpiring",
    "notifyDepartureTomorrow",
    "notifyOverstay",
    "notifyImportUnlinked",
  ]) {
    it(`pre-existing field ${key} still present`, () => {
      expect(fieldByKey(key), `pre-existing field ${key} dropped`).toBeTruthy();
    });
  }
});
