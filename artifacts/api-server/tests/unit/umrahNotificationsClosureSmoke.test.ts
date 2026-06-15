import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-17-P6 — notifications-flow closure smoke.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-17 audit §3.6):
 *   - One end-to-end source-level pin that the full U-17 chain still
 *     hangs together AFTER P1-P5 shipped. The previous per-phase
 *     smokes each pin ONE invariant; this one pins the integration:
 *       cron → resolveSettings(policy key) → opt-out check
 *            → recipient resolution (manager + GM + agent + sub-agent)
 *            → createNotification (or digest aggregate).
 *   - Static-only — no DB, no network, no live cron. The smoke reads
 *     the three involved source files and checks the wire-up survives
 *     a future refactor.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine change. No new column. No FE.
 *   - No new policy key — every key referenced here was added by an
 *     earlier landed slice.
 *   - The smoke is observation-only.
 *
 * Failure modes pinned:
 *   - Any of the 3 notifier exits (visa / departure / overstay) drops
 *     the opt-out check → §A fails (silent dispatch through opted-out
 *     pilgrims).
 *   - The cron loses the digest-mode branch → §B fails.
 *   - resolveInternalRecipients stops checking sub-agent contact → §C
 *     fails (P3 regression).
 *   - The catalog loses any of the 7 notification keys → §D fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInternalNotifications.ts"),
  "utf8",
);
const CRON = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/cronScheduler.ts"),
  "utf8",
);
const CATALOG = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahSettingsPoliciesCatalog.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Every notifier honours the U-17-P5 opt-out gate
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P6 §A — every notifier early-returns on isPilgrimOptedOut", () => {
  for (const fn of [
    "notifyInternalVisaExpiring",
    "notifyInternalDepartureTomorrow",
    "notifyInternalOverstayWarning",
  ]) {
    it(`${fn} carries the isPilgrimOptedOut guard`, () => {
      const re = new RegExp(
        `function\\s+${fn}[\\s\\S]+?isPilgrimOptedOut\\(\\s*ctx\\.companyId,\\s*ctx\\.pilgrimId\\s*\\)`,
      );
      expect(ENGINE).toMatch(re);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Cron carries the U-17-P4 digest-mode branch
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P6 §B — visa-expiry cron carries the digest-mode branch", () => {
  it("reads the digestMode setting via the catalog key path", () => {
    expect(CRON).toMatch(
      /resolveSettings\(\s*["']umrah\.notifications\.digestMode["']/,
    );
  });

  it("daily_digest branch ends with `continue;` (so per-event loop is skipped)", () => {
    expect(CRON).toMatch(
      /digestMode\s*===\s*["']daily_digest["'][\s\S]{0,3000}?continue;\s*\}\s*for\s*\(\s*const\s+row\s+of\s+expiring\s*\)/,
    );
  });

  it("default fallback is `per_event` so the legacy loop is reachable", () => {
    expect(CRON).toMatch(/\?\?\s*["']per_event["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — resolveInternalRecipients still chains agent + sub-agent contacts
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P6 §C — recipient resolver expands to agent + sub-agent contacts", () => {
  it("sub-agent branch reads contactEmployeeId on umrah_sub_agents", () => {
    expect(ENGINE).toMatch(
      /if\s*\(\s*ctx\.subAgentId\s*\)[\s\S]{0,200}?FROM\s+umrah_sub_agents\s+sa[\s\S]{0,400}?sa\."contactEmployeeId"\s+IS NOT NULL/,
    );
  });

  it("agent branch reads contactEmployeeId on umrah_agents", () => {
    expect(ENGINE).toMatch(
      /if\s*\(\s*ctx\.agentId\s*\)[\s\S]{0,200}?FROM\s+umrah_agents\s+a[\s\S]{0,400}?a\."contactEmployeeId"\s+IS NOT NULL/,
    );
  });

  it("both contact lookups gate on ea.status = 'active'", () => {
    const matches = ENGINE.match(/ea\.status\s*=\s*["']active["']/g) ?? [];
    // GM/owner pool, sub-agent contact, agent contact → at least 3.
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Catalog still exposes the full U-17-P1 notification key set
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P6 §D — catalog still exposes every notification policy key", () => {
  for (const key of [
    "visaExpiringSms",
    "visaExpiringInApp",
    "departureSms",
    "departureInApp",
    "overstaySms",
    "overstayInApp",
    "digestMode",
  ]) {
    it(`catalog declares key: "${key}"`, () => {
      expect(CATALOG).toMatch(new RegExp(`key:\\s*["']${key}["']`));
    });
  }

  it("digestMode default stays 'per_event' (no silent flip)", () => {
    expect(CATALOG).toMatch(
      /key:\s*["']digestMode["'][\s\S]{0,200}?defaultValue:\s*["']per_event["']/,
    );
  });

  it("digestMode declares both 'per_event' + 'daily_digest' option values", () => {
    expect(CATALOG).toMatch(
      /key:\s*["']digestMode["'][\s\S]{0,500}?value:\s*["']per_event["'][\s\S]{0,200}?value:\s*["']daily_digest["']/,
    );
  });
});
