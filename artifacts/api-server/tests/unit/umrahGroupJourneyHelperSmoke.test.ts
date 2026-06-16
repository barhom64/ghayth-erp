import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-19-P1b — group journey-status helper (read-only).
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-19 audit §3.1):
 *   - New read-only route GET /umrah/groups/:id/journey
 *   - Returns the 4 journey stages (imported, linked, invoiced,
 *     collected) for one group.
 *   - Tenant-scoped via umrah_groups companyId + deletedAt IS NULL.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch / no migration / no FE.
 *   - No /import-batches/:id/journey yet (U-19-P3 territory).
 *   - No writes — pure SELECT.
 *
 * Failure modes pinned:
 *   - Route disappears or stops being authorize-gated → §A fails.
 *   - Response shape changes → §B fails.
 *   - Tenant scope guard regresses → §C fails.
 *   - Handler starts writing → §D fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-journey-reports.ts"),
  "utf8",
);

// Slice the group journey handler so negative assertions are scoped
// per-handler (mirrors the U-19-P1 smoke pattern).
const HANDLER =
  ROUTES.match(/router\.get\(\s*\n?\s*["']\/groups\/:id\/journey["'][\s\S]+?(?=^router\.|^\/\/ ─{3}|^export default)/m)?.[0] ??
  "";

// ─────────────────────────────────────────────────────────────────────────────
// §A — Route exists + authorize-gated
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P1b §A — GET /umrah/groups/:id/journey is wired + RBAC-gated", () => {
  it("declares the GET route on the groups/:id/journey path", () => {
    expect(ROUTES).toMatch(
      /router\.get\(\s*\n?\s*["']\/groups\/:id\/journey["']/,
    );
  });

  it("is gated by authorize({ feature: \"umrah\", action: \"view\" })", () => {
    expect(HANDLER).toMatch(
      /authorize\(\s*\{\s*feature:\s*["']umrah["'],\s*action:\s*["']view["']\s*\}\s*\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Response shape — the 4 stages
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P1b §B — response carries the 4 stages keyed to the group", () => {
  it("includes the 4 stage names", () => {
    expect(HANDLER).toMatch(/stage:\s*["']imported["']/);
    expect(HANDLER).toMatch(/stage:\s*["']linked["']/);
    expect(HANDLER).toMatch(/stage:\s*["']invoiced["']/);
    expect(HANDLER).toMatch(/stage:\s*["']collected["']/);
  });

  it("response is wrapped by maskFields (PII masking)", () => {
    expect(HANDLER).toMatch(/maskFields\(req,/);
  });

  it("response includes a `group` summary block (id + name + agent/subAgent)", () => {
    expect(HANDLER).toMatch(/group:\s*\{/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Tenant scope guard preserved
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P1b §C — group lookup gates on companyId + deletedAt", () => {
  it("the umrah_groups existence SELECT filters by companyId AND deletedAt IS NULL", () => {
    expect(HANDLER).toMatch(
      /FROM\s+umrah_groups[\s\S]{0,400}?WHERE\s+id\s*=\s*\$1\s+AND\s+"companyId"\s*=\s*\$2\s+AND\s+"deletedAt"\s+IS NULL/,
    );
  });

  it("every aggregate SELECT carries companyId + groupId scope (no cross-tenant read)", () => {
    // umrah_pilgrims imported scope
    expect(HANDLER).toMatch(
      /FROM\s+umrah_pilgrims[\s\S]{0,400}?"companyId"\s*=\s*\$1[\s\S]{0,200}?"groupId"\s*=\s*\$2/,
    );
    // invoices and payments scope through companyId + groupRefs LIKE
    expect(HANDLER).toMatch(
      /FROM\s+umrah_sales_invoices[\s\S]{0,400}?"companyId"\s*=\s*\$1[\s\S]{0,200}?"groupRefs"\s+LIKE/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Pure read path (no writes)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P1b §D — group journey route makes ZERO writes", () => {
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
