import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-18-P4 — bilingual CSV header policy (Arabic primary + English in
 * parentheses) across umrah exporters.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-18 audit §3.4):
 *   - /umrah/pilgrims/export (routes/umrah.ts) headers carry the
 *     `العربي (English)` form for every column.
 *   - /umrah/reports/commissions-summary/export
 *     (routes/umrah-entities.ts) headers do the same.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No API contract change — the CSV CONTENT (rows) is unchanged.
 *   - No engine touch / migration / FE / route change.
 *   - The legacy Arabic-only labels are explicitly replaced; we don't
 *     ship them as a fallback (no double-label clutter).
 *
 * Failure modes pinned:
 *   - A header drops the English parenthetical → §A fails (the
 *     bilingual policy regresses on that column).
 *   - A header reverts to Arabic-only → §B fails.
 *   - Either exporter loses its UTF-8 BOM (Excel mojibake) → §C fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const UMRAH_ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah.ts"),
  "utf8",
);
const UMRAH_ENTITIES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Pilgrims exporter carries bilingual headers
// ─────────────────────────────────────────────────────────────────────────────
describe("U-18-P4 §A — /umrah/pilgrims/export headers are bilingual", () => {
  for (const [arField, en] of [
    ["nuskNumber", "Nusk No."],
    ["fullName", "Name"],
    ["passportNumber", "Passport No."],
    ["nationality", "Nationality"],
    ["status", "Status"],
    ["hotelName", "Hotel"],
    ["groupName", "Group"],
    ["agentName", "Main Agent"],
    ["subAgentName", "Sub-Agent"],
  ]) {
    it(`"${arField}" header carries the English (${en}) suffix`, () => {
      // The header tuple is `["${arField}", "<arabic> (${en})"]`.
      // We only pin the English suffix — the exact Arabic phrasing
      // is content the audit can tune without breaking this smoke.
      expect(UMRAH_ROUTES).toMatch(
        new RegExp(`"${arField}"\\s*,\\s*"[^"]*\\(${en.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\)"`),
      );
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Commissions exporter carries bilingual headers
// ─────────────────────────────────────────────────────────────────────────────
describe("U-18-P4 §B — commissions CSV export headers are bilingual", () => {
  for (const [arField, en] of [
    ["id", "ID"],
    ["year", "Year"],
    ["month", "Month"],
    ["employeeName", "Employee"],
    ["planName", "Plan"],
    ["status", "Status"],
    ["finalAmount", "Final Amount"],
    ["totalMutamers", "Pilgrim Count"],
    ["conditionMet", "Condition Met"],
    ["hasViolations", "Has Violations"],
  ]) {
    it(`"${arField}" header carries the English (${en}) suffix`, () => {
      expect(UMRAH_ENTITIES).toMatch(
        new RegExp(`"${arField}"\\s*,\\s*"[^"]*\\(${en.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\)"`),
      );
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — BOM stays so Excel reads Arabic + English without mojibake
// ─────────────────────────────────────────────────────────────────────────────
describe("U-18-P4 §C — BOM + Content-Type preserved on both exporters", () => {
  it("pilgrims exporter still prepends a BOM literal", () => {
    expect(UMRAH_ROUTES).toMatch(/const\s+BOM\s*=\s*["']﻿["']/);
  });

  it("commissions exporter still prepends a BOM literal", () => {
    expect(UMRAH_ENTITIES).toMatch(/const\s+BOM\s*=\s*["']﻿["']/);
  });

  it("pilgrims exporter sets text/csv; charset=utf-8", () => {
    expect(UMRAH_ROUTES).toMatch(
      /Content-Type["']?\s*,\s*["']text\/csv;\s*charset=utf-8["']/,
    );
  });

  it("commissions exporter sets text/csv; charset=utf-8", () => {
    expect(UMRAH_ENTITIES).toMatch(
      /Content-Type["']?\s*,\s*["']text\/csv;\s*charset=utf-8["']/,
    );
  });
});
