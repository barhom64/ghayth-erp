import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-04-P3 — commissions summary CSV export.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-04 audit §3.3):
 *   - New read-only route GET /umrah/reports/commissions-summary/export
 *     returns a UTF-8 BOM-prefixed CSV with the same WHERE filter set
 *     as the summary, but LIMIT 5000 instead of LIMIT 100.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch. No migration. No FE.
 *   - No filter change vs the summary route.
 *   - No write (pure SELECT).
 *
 * Failure modes pinned:
 *   - Route disappears or stops being authorize-gated → §A fails.
 *   - Response is missing Content-Disposition / Content-Type → §B
 *     fails (browser would render in-window instead of downloading).
 *   - Limit drops back to 100 → §C fails (operators would silently
 *     get a truncated monthly close).
 *   - Tenant scope guard regresses → §D fails.
 *   - Engine starts writing through this path → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);

// Slice the route handler so the negative assertions don't pick up
// statements from another route.
const HANDLER =
  ROUTES.match(
    /\/reports\/commissions-summary\/export[\s\S]+?(?=^router\.|^\/\/ ─{3}|^export default)/m,
  )?.[0] ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// §A — Route exists + authorize-gated
// ─────────────────────────────────────────────────────────────────────────────
describe("U-04-P3 §A — GET /umrah/reports/commissions-summary/export is wired + RBAC-gated", () => {
  it("declares the GET route on the export path", () => {
    expect(ROUTES).toMatch(
      /router\.get\(\s*\n?\s*["']\/reports\/commissions-summary\/export["']/,
    );
  });

  it("is gated by authorize({ feature: \"umrah\", action: \"list\" })", () => {
    expect(HANDLER).toMatch(
      /authorize\(\s*\{\s*feature:\s*["']umrah["'],\s*action:\s*["']list["']\s*\}\s*\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — CSV response headers
// ─────────────────────────────────────────────────────────────────────────────
describe("U-04-P3 §B — handler sets Content-Type + Content-Disposition for CSV download", () => {
  it("sets Content-Type to text/csv; charset=utf-8", () => {
    expect(HANDLER).toMatch(
      /Content-Type["']?\s*,\s*["']text\/csv;\s*charset=utf-8["']/,
    );
  });

  it("sets Content-Disposition with attachment + .csv filename", () => {
    expect(HANDLER).toMatch(
      /Content-Disposition["']?\s*,\s*[`"']attachment;\s*filename="umrah-commissions-/,
    );
  });

  it("prepends a UTF-8 BOM so Excel detects Arabic encoding", () => {
    // The BOM literal is the character `﻿`. Codebase convention
    // is to inline it via the actual character (`const BOM = "﻿"`).
    expect(HANDLER).toMatch(/const\s+BOM\s*=\s*["']﻿["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — LIMIT raised to 5000
// ─────────────────────────────────────────────────────────────────────────────
describe("U-04-P3 §C — export limit is 5000 (vs the on-screen 100)", () => {
  it("LIMIT 5000 appears in the export SELECT", () => {
    expect(HANDLER).toMatch(/LIMIT\s+5000/);
  });

  it("LIMIT 100 does NOT appear in the export handler (that's the summary cap)", () => {
    expect(HANDLER).not.toMatch(/LIMIT\s+100\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Tenant scope preserved
// ─────────────────────────────────────────────────────────────────────────────
describe("U-04-P3 §D — every aggregate query is companyId + deletedAt scoped", () => {
  it("WHERE clause filters cc.companyId = $1 + cc.deletedAt IS NULL", () => {
    expect(HANDLER).toMatch(
      /cc\."companyId"\s*=\s*\$1[\s\S]{0,200}?cc\."deletedAt"\s+IS\s+NULL/,
    );
  });

  it("season EXISTS subquery scopes cp.companyId = cc.companyId", () => {
    expect(HANDLER).toMatch(
      /cp\."companyId"\s*=\s*cc\."companyId"/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Pure read path (no writes)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-04-P3 §E — handler makes ZERO writes", () => {
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
