import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-19-P1 — journey-status helper API (read-only).
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-19 audit §3.1):
 *   - New read-only route GET /umrah/sub-agents/:id/journey
 *   - Returns the 4 journey stages (imported, linked, invoiced,
 *     collected) + outstanding counts (unlinkedPilgrims,
 *     uninvoicedGroups, unpaidInvoices) for one sub-agent.
 *   - Tenant-scoped via the same guard as /sub-agents/:id.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch / no migration / no FE.
 *   - No /import-batches/:id/journey (U-19-P3).
 *   - No /groups/:id/journey (U-19-P3).
 *   - No writes — pure SELECT.
 *
 * Failure modes pinned:
 *   - Route disappears or stops being authorize-gated → §A fails.
 *   - Response shape changes → §B fails.
 *   - Tenant scope guard regresses → §C fails.
 *   - Engine starts writing through this path → §D fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Route exists + authorize-gated
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P1 §A — GET /umrah/sub-agents/:id/journey is wired + RBAC-gated", () => {
  it("declares the GET route on the sub-agents/:id/journey path", () => {
    expect(ROUTES).toMatch(
      /router\.get\(\s*["']\/sub-agents\/:id\/journey["']/,
    );
  });

  it("is gated by authorize({ feature: \"umrah\", action: \"view\" })", () => {
    expect(ROUTES).toMatch(
      /router\.get\(\s*["']\/sub-agents\/:id\/journey["'],\s*authorize\(\s*\{\s*feature:\s*["']umrah["'],\s*action:\s*["']view["']\s*\}\s*\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Response shape — the 4 stages + outstanding rollup
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P1 §B — response carries the 4 stages + outstanding rollup", () => {
  it("includes a `stages` array with the 4 stage names", () => {
    // Each stage is built as a literal object with a `stage: "..."`
    // key. We pin the four canonical stage labels.
    expect(ROUTES).toMatch(/stage:\s*["']imported["']/);
    expect(ROUTES).toMatch(/stage:\s*["']linked["']/);
    expect(ROUTES).toMatch(/stage:\s*["']invoiced["']/);
    expect(ROUTES).toMatch(/stage:\s*["']collected["']/);
  });

  it("includes the `outstanding` rollup keys", () => {
    expect(ROUTES).toMatch(/unlinkedPilgrims:/);
    expect(ROUTES).toMatch(/uninvoicedGroups:/);
    expect(ROUTES).toMatch(/unpaidInvoices:/);
  });

  it("response is wrapped by maskFields (PII masking)", () => {
    // The route MUST go through maskFields (same convention as every
    // other umrah-entities response) so sensitive sub-agent fields
    // don't leak.
    const handler = ROUTES.match(
      /\/sub-agents\/:id\/journey[\s\S]{0,6000}?^\}\);\s*$/m,
    );
    expect(handler, "journey handler not located").toBeTruthy();
    expect(handler![0]).toMatch(/maskFields\(req,/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Tenant scope guard preserved
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P1 §C — sub-agent lookup gates on companyId + deletedAt", () => {
  it("the sub_agent existence SELECT filters by companyId AND deletedAt IS NULL", () => {
    const handler = ROUTES.match(
      /\/sub-agents\/:id\/journey[\s\S]{0,6000}?^\}\);\s*$/m,
    )![0];
    expect(handler).toMatch(
      /FROM\s+umrah_sub_agents[\s\S]{0,400}?WHERE\s+id\s*=\s*\$1\s+AND\s+"companyId"\s*=\s*\$2\s+AND\s+"deletedAt"\s+IS NULL/,
    );
  });

  it("the import/invoice/payment queries all filter by companyId + subAgentId", () => {
    const handler = ROUTES.match(
      /\/sub-agents\/:id\/journey[\s\S]{0,6000}?^\}\);\s*$/m,
    )![0];
    // umrah_pilgrims companyId + subAgentId scope
    expect(handler).toMatch(
      /FROM\s+umrah_pilgrims[\s\S]{0,300}?"companyId"\s*=\s*\$1[\s\S]{0,200}?"subAgentId"\s*=\s*\$2/,
    );
    // umrah_sales_invoices companyId + subAgentId scope
    expect(handler).toMatch(
      /FROM\s+umrah_sales_invoices[\s\S]{0,300}?"companyId"\s*=\s*\$1[\s\S]{0,200}?"subAgentId"\s*=\s*\$2/,
    );
    // umrah_payments companyId + subAgentId scope
    expect(handler).toMatch(
      /FROM\s+umrah_payments[\s\S]{0,300}?"companyId"\s*=\s*\$1[\s\S]{0,200}?"subAgentId"\s*=\s*\$2/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Pure read path (no writes)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P1 §D — journey route makes ZERO writes", () => {
  it("handler does not INSERT", () => {
    const handler = ROUTES.match(
      /\/sub-agents\/:id\/journey[\s\S]{0,6000}?^\}\);\s*$/m,
    )![0];
    expect(handler).not.toMatch(/\bINSERT\s+INTO\b/i);
  });

  it("handler does not UPDATE", () => {
    const handler = ROUTES.match(
      /\/sub-agents\/:id\/journey[\s\S]{0,6000}?^\}\);\s*$/m,
    )![0];
    expect(handler).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
  });

  it("handler does not DELETE", () => {
    const handler = ROUTES.match(
      /\/sub-agents\/:id\/journey[\s\S]{0,6000}?^\}\);\s*$/m,
    )![0];
    expect(handler).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("handler does not call createGuardedJournalEntry / emitEvent / createAuditLog", () => {
    const handler = ROUTES.match(
      /\/sub-agents\/:id\/journey[\s\S]{0,6000}?^\}\);\s*$/m,
    )![0];
    expect(handler).not.toMatch(/createGuardedJournalEntry/);
    expect(handler).not.toMatch(/emitEvent\(/);
    expect(handler).not.toMatch(/createAuditLog\(/);
  });
});
