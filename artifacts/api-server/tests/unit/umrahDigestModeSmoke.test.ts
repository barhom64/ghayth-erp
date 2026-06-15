import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-17-P4 — digest mode for the visa-expiry cron.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-17 audit §3.4):
 *   - The visa-expiry cron in umrahVisaExpiryAlerts() reads the
 *     `umrah.notifications.digestMode` policy (catalog key from
 *     U-17-P1).
 *   - When the value is "daily_digest", the cron emits ONE
 *     aggregated notification per recipient with a summary list of
 *     every expiring pilgrim (instead of N per-event dispatches).
 *   - When the value is "per_event" (default), the legacy loop runs
 *     unchanged.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch beyond the cron.
 *   - No new migration.
 *   - No catalog edit (the key already exists; we just consume it).
 *   - No silent default flip — per_event stays the default.
 *
 * Failure modes pinned:
 *   - Cron stops reading digestMode → §A fails.
 *   - daily_digest path forgets to call createNotification → §B fails.
 *   - daily_digest path forgets to early-return after dispatch → §C
 *     fails (would double-notify, both digest AND per-event).
 *   - Default flips off "per_event" → §D fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const CRON = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/cronScheduler.ts"),
  "utf8",
);

// Slice the visa-expiry alerts function so assertions stay scoped.
const HANDLER =
  CRON.match(
    /async function\s+umrahVisaExpiryAlerts\([\s\S]+?(?=^async function\s|^function\s|^export\s)/m,
  )?.[0] ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// §A — Cron reads the digestMode setting
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P4 §A — visa-expiry cron reads umrah.notifications.digestMode", () => {
  it("handler block is located", () => {
    expect(HANDLER.length).toBeGreaterThan(0);
  });

  it("resolveSettings is called with the umrah.notifications.digestMode key", () => {
    expect(HANDLER).toMatch(
      /resolveSettings\(\s*["']umrah\.notifications\.digestMode["']\s*,\s*c\.id\s*\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — daily_digest branch dispatches ONE notification per recipient
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P4 §B — daily_digest branch emits a single digest per recipient", () => {
  it("compares digestMode against the literal \"daily_digest\"", () => {
    expect(HANDLER).toMatch(/digestMode\s*===\s*["']daily_digest["']/);
  });

  it("the digest branch resolves recipients via resolveInternalRecipients", () => {
    expect(HANDLER).toMatch(
      /daily_digest["']\s*\)[\s\S]{0,800}?resolveInternalRecipients\(/,
    );
  });

  it("the digest branch dispatches a createNotification call", () => {
    expect(HANDLER).toMatch(
      /daily_digest["']\s*\)[\s\S]{0,2000}?createNotification\(/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — daily_digest branch early-continues so per-event loop is skipped
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P4 §C — daily_digest branch skips the per-event loop", () => {
  it("ends with a `continue;` before the for-each pilgrim loop", () => {
    // The branch must end with a `continue` to skip the legacy
    // per-event loop below. Otherwise the company gets both digest
    // AND per-event notifications.
    expect(HANDLER).toMatch(
      /daily_digest["']\s*\)[\s\S]{0,2500}?continue;\s*\}\s*for\s*\(\s*const\s+row\s+of\s+expiring\s*\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — per_event stays the default fallback
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P4 §D — per_event remains the default and the legacy loop is preserved", () => {
  it("defaults the local digestMode variable to \"per_event\" on a null setting", () => {
    expect(HANDLER).toMatch(/\?\?\s*["']per_event["']/);
  });

  it("the legacy per-event loop (notifyInternalVisaExpiring) is still wired", () => {
    expect(HANDLER).toMatch(/notifyInternalVisaExpiring\(/);
    expect(HANDLER).toMatch(
      /for\s*\(\s*const\s+row\s+of\s+expiring\s*\)[\s\S]{0,400}?notifyInternalVisaExpiring\(/,
    );
  });
});
