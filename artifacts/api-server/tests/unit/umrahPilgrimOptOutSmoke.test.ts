import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-17-P5 — pilgrim opt-out + internal-notification dispatch gate.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-17 audit §3.5):
 *   - Migration 368 adds nullable `notifications_opt_out boolean`
 *     to umrah_pilgrims with a partial index on the opted-out set.
 *   - `umrahInternalNotifications.ts` adds an `isPilgrimOptedOut`
 *     helper that returns true only when the column is `true`.
 *   - The 3 notifier entry points (visa expiring / departure /
 *     overstay) early-return 0 when the pilgrim is opted out.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch beyond the opt-out gate.
 *   - No bulk silent backfill — every existing pilgrim stays null
 *     (treated as "not opted out").
 *   - No FE picker — operator sets the flag via API for now.
 *   - The overstay-risk event STILL fires (downstream automations
 *     may need to react regardless); only the operator dispatch is
 *     suppressed.
 *
 * Failure modes pinned:
 *   - Migration loses IF NOT EXISTS / adds NOT NULL or DEFAULT → §A fails.
 *   - Helper drops the deletedAt scope → §B fails.
 *   - Any notifier forgets the opt-out gate → §C fails.
 *   - Risk event suppression regression (gate fires BEFORE emit) → §D fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const MIGRATION = readFileSync(
  join(
    REPO_ROOT,
    "artifacts/api-server/src/migrations/368_umrah_pilgrims_notifications_opt_out.sql",
  ),
  "utf8",
);

const ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInternalNotifications.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Migration shape: additive, idempotent, nullable
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P5 §A — migration adds nullable notifications_opt_out", () => {
  it("uses ADD COLUMN IF NOT EXISTS on umrah_pilgrims", () => {
    expect(MIGRATION).toMatch(
      /ALTER TABLE\s+umrah_pilgrims[\s\S]{0,200}?ADD COLUMN IF NOT EXISTS\s+notifications_opt_out\s+boolean/,
    );
  });

  it("is nullable (no NOT NULL, no DEFAULT)", () => {
    expect(MIGRATION).not.toMatch(/notifications_opt_out\s+boolean\s+NOT NULL/i);
    expect(MIGRATION).not.toMatch(/notifications_opt_out\s+boolean\s+DEFAULT/i);
  });

  it("partial index on the opted-out subset", () => {
    expect(MIGRATION).toMatch(
      /CREATE INDEX IF NOT EXISTS\s+idx_umrah_pilgrims_notifications_opt_out[\s\S]{0,300}?\("companyId",\s*id\)[\s\S]{0,150}?WHERE\s+notifications_opt_out\s*=\s*true/,
    );
  });

  it("carries the @rollback annotation (migration-policy gate)", () => {
    expect(MIGRATION).toMatch(/@rollback:/);
  });

  it("no UPDATE / INSERT (zero backfill)", () => {
    expect(MIGRATION).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(MIGRATION).not.toMatch(/\bUPDATE\s+umrah_pilgrims\s+SET\b/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — isPilgrimOptedOut helper is tenant + soft-delete scoped
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P5 §B — isPilgrimOptedOut helper scopes on tenant + soft-delete", () => {
  it("helper declares the right name + boolean return", () => {
    expect(ENGINE).toMatch(
      /async\s+function\s+isPilgrimOptedOut\([\s\S]{0,200}?\):\s*Promise<boolean>/,
    );
  });

  it("SELECT filters by id + companyId + deletedAt IS NULL", () => {
    expect(ENGINE).toMatch(
      /FROM\s+umrah_pilgrims[\s\S]{0,400}?WHERE\s+id\s*=\s*\$1\s+AND\s+"companyId"\s*=\s*\$2\s+AND\s+"deletedAt"\s+IS NULL/,
    );
  });

  it("treats only explicit true as opted-out (null → false)", () => {
    expect(ENGINE).toMatch(/\.optedOut\s*===\s*true/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Every notifier gates on the opt-out check
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P5 §C — each notifyInternal* function checks opt-out before dispatch", () => {
  for (const fn of [
    "notifyInternalVisaExpiring",
    "notifyInternalDepartureTomorrow",
    "notifyInternalOverstayWarning",
  ]) {
    it(`${fn} early-returns 0 when isPilgrimOptedOut is true`, () => {
      // The function body must include the gate. Scope to the function
      // by anchoring on its name + the early-return shape.
      const re = new RegExp(
        `function\\s+${fn}[\\s\\S]+?if\\s*\\(\\s*await\\s+isPilgrimOptedOut\\(\\s*ctx\\.companyId,\\s*ctx\\.pilgrimId\\s*\\)\\s*\\)\\s*return\\s+0`,
      );
      expect(ENGINE).toMatch(re);
    });
  }

  it("opt-out gate count is exactly 3 (one per notifier function, no orphan check)", () => {
    const hits = ENGINE.match(/if\s*\(\s*await\s+isPilgrimOptedOut\(/g) ?? [];
    expect(hits.length).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Visa-expiring risk event fires BEFORE the opt-out gate
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P5 §D — overstay_risk event still emits even when opted out", () => {
  it("emitEvent for overstay_risk appears before the opt-out gate in the visa-expiring handler", () => {
    // The handler block: emitEvent({...overstay_risk...}) THEN opt-out check.
    // Pinning the ORDER catches a regression that moves the gate up.
    const visaBody =
      ENGINE.match(
        /function\s+notifyInternalVisaExpiring[\s\S]+?(?=^export\s+async\s+function\s+notifyInternalDepartureTomorrow)/m,
      )?.[0] ?? "";
    expect(visaBody).toMatch(
      /umrah\.pilgrim\.overstay_risk[\s\S]+?await\s+isPilgrimOptedOut/,
    );
  });
});
