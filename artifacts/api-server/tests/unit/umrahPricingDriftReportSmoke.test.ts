import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-15-P5 — packages vs. allocations pricing-drift report.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-15 audit §3.5):
 *   - New read-only GET /umrah/reports/packages-vs-allocations-
 *     pricing-drift returns packages whose cost differs from the
 *     expected (duration × latest ratePerNight) by more than the
 *     thresholdPct query param (default 10%).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch. No migration. No FE.
 *   - No writes — pure SELECT + CTE.
 *   - No engine wire for U-15-P3 (FE picker) or P4 (hotelName
 *     deprecation).
 *
 * Failure modes pinned:
 *   - Route disappears or stops being authorize-gated → §A fails.
 *   - The CTE that picks the latest block per hotel regresses to
 *     pick an arbitrary block → §B fails.
 *   - Divide-by-zero protection drops → §C fails.
 *   - Tenant scope guard regresses → §D fails.
 *   - Engine starts writing through this path → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);

// Slice the handler so negative assertions don't pick up statements
// from another route.
const HANDLER =
  ROUTES.match(
    /\/reports\/packages-vs-allocations-pricing-drift[\s\S]+?(?=^router\.|^\/\/ ─{3}|^export default)/m,
  )?.[0] ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// §A — Route exists + authorize-gated
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P5 §A — GET /reports/packages-vs-allocations-pricing-drift is wired + RBAC-gated", () => {
  it("declares the GET route on the pricing-drift path", () => {
    expect(ROUTES).toMatch(
      /router\.get\(\s*\n?\s*["']\/reports\/packages-vs-allocations-pricing-drift["']/,
    );
  });

  it("is gated by authorize({ feature: \"umrah\", action: \"list\" })", () => {
    expect(HANDLER).toMatch(
      /authorize\(\s*\{\s*feature:\s*["']umrah["'],\s*action:\s*["']list["']\s*\}\s*\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Latest-block selection uses DISTINCT ON deterministically
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P5 §B — latest_block CTE picks the latest block per hotel deterministically", () => {
  it("uses DISTINCT ON (\"hotelId\") + ORDER BY \"hotelId\", id DESC", () => {
    expect(HANDLER).toMatch(
      /DISTINCT\s+ON\s*\(\s*"hotelId"\s*\)[\s\S]{0,800}?ORDER\s+BY\s+"hotelId",\s*id\s+DESC/,
    );
  });

  it("filters out blocks without ratePerNight (CTE prereq)", () => {
    expect(HANDLER).toMatch(
      /"ratePerNight"\s+IS\s+NOT\s+NULL/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Divide-by-zero protection on cost-price 0 packages
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P5 §C — driftFraction is NULL when package costPrice is 0", () => {
  it("CASE WHEN p.costPrice = 0 THEN NULL handles divide-by-zero", () => {
    expect(HANDLER).toMatch(
      /CASE\s+WHEN\s+p\."costPrice"\s*=\s*0\s+THEN\s+NULL/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Tenant scope preserved
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P5 §D — every aggregate query is companyId + deletedAt scoped", () => {
  it("latest_block CTE filters by companyId = $1 + deletedAt IS NULL", () => {
    expect(HANDLER).toMatch(
      /umrah_room_blocks[\s\S]{0,200}?"companyId"\s*=\s*\$1[\s\S]{0,200}?"deletedAt"\s+IS\s+NULL/,
    );
  });

  it("packages anchor filters by companyId = $1 + deletedAt IS NULL", () => {
    expect(HANDLER).toMatch(
      /FROM\s+umrah_packages\s+p[\s\S]{0,1500}?p\."companyId"\s*=\s*\$1[\s\S]{0,300}?p\."deletedAt"\s+IS\s+NULL/,
    );
  });

  it("hotels JOIN scopes h.companyId = p.companyId + h.deletedAt IS NULL", () => {
    expect(HANDLER).toMatch(
      /umrah_hotels\s+h[\s\S]{0,300}?h\."companyId"\s*=\s*p\."companyId"[\s\S]{0,200}?h\."deletedAt"\s+IS\s+NULL/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Pure read path (no writes)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P5 §E — handler makes ZERO writes", () => {
  it("no INSERT INTO", () => {
    expect(HANDLER).not.toMatch(/\bINSERT\s+INTO\b/i);
  });

  it("no UPDATE … SET", () => {
    expect(HANDLER).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
  });

  it("no DELETE FROM", () => {
    expect(HANDLER).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("no JE / event / audit log emitted", () => {
    expect(HANDLER).not.toMatch(/createGuardedJournalEntry/);
    expect(HANDLER).not.toMatch(/emitEvent\(/);
    expect(HANDLER).not.toMatch(/createAuditLog\(/);
  });
});
