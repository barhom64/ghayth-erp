import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-19-P6 — recovery hub aggregate (read-only).
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-19 audit §3.6):
 *   - GET /umrah/reports/recovery-hub returns 4 buckets of stuck
 *     items so a single operator screen can triage:
 *       1. stuckImports          — pilgrims with no group
 *       2. unlinkedSubAgents     — sub-agents missing clientId
 *       3. uninvoicedGroups      — older-than-7d groups w/o invoice
 *       4. unpaidInvoices        — past-30d invoices w/ outstanding
 *   - Tenant-scoped; uses parameterised interval thresholds.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch. No migration. No FE.
 *   - No writes — pure SELECT.
 *   - No threshold default flip (defaults stay 7d / 30d).
 *
 * Failure modes pinned:
 *   - Route disappears / un-gated → §A fails.
 *   - Bucket key disappears from response → §B fails.
 *   - Tenant scope guard regresses on any sub-query → §C fails.
 *   - SQL injection vector (raw $N concat) sneaks in → §D fails.
 *   - Handler starts writing → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-journey-reports.ts"),
  "utf8",
);

// Slice the recovery-hub handler so negative assertions stay scoped.
// Anchored on `router.get("/reports/recovery-hub"` (the actual route
// definition) rather than the bare path so the file-header comment
// block — which now also mentions the path — doesn't confuse the slice.
const HANDLER =
  ROUTES.match(
    /router\.get\(\s*\n?\s*["']\/reports\/recovery-hub["'][\s\S]+?(?=^router\.|^\/\/ ─{3}|^export default)/m,
  )?.[0] ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// §A — Route exists + authorize-gated
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P6 §A — GET /umrah/reports/recovery-hub is wired + RBAC-gated", () => {
  it("declares the GET route", () => {
    expect(ROUTES).toMatch(
      /router\.get\(\s*\n?\s*["']\/reports\/recovery-hub["']/,
    );
  });

  it("is gated by authorize({ feature: \"umrah\", action: \"list\" })", () => {
    expect(HANDLER).toMatch(
      /authorize\(\s*\{\s*feature:\s*["']umrah["'],\s*action:\s*["']list["']\s*\}\s*\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Response shape — 4 buckets + thresholds
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P6 §B — response carries the 4 buckets + the threshold echo", () => {
  it("response wraps with maskFields", () => {
    expect(HANDLER).toMatch(/maskFields\(req,/);
  });

  for (const key of [
    "stuckImports",
    "unlinkedSubAgents",
    "uninvoicedGroups",
    "unpaidInvoices",
  ]) {
    it(`exposes the bucket key '${key}'`, () => {
      expect(HANDLER).toMatch(new RegExp(`${key}:`));
    });
  }

  it("echoes the thresholds back to the caller", () => {
    expect(HANDLER).toMatch(/thresholds:\s*\{/);
    expect(HANDLER).toMatch(/uninvoicedDays/);
    expect(HANDLER).toMatch(/unpaidDays/);
  });

  it("default thresholds stay at 7 days uninvoiced / 30 days unpaid", () => {
    // The literals are pinned to catch a default flip — operators
    // shouldn't get a silently-different threshold on next deploy.
    expect(HANDLER).toMatch(/uninvoicedDays\s*=\s*Number\(req\.query\.uninvoicedDays\)\s*>\s*0\s*\?\s*Number\(req\.query\.uninvoicedDays\)\s*:\s*7/);
    expect(HANDLER).toMatch(/unpaidDays\s*=\s*Number\(req\.query\.unpaidDays\)\s*>\s*0\s*\?\s*Number\(req\.query\.unpaidDays\)\s*:\s*30/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Tenant scope guard preserved on every sub-query
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P6 §C — every sub-query gates on companyId + deletedAt", () => {
  it("umrah_pilgrims stuck-imports query is tenant + soft-delete scoped", () => {
    expect(HANDLER).toMatch(
      /FROM\s+umrah_pilgrims[\s\S]{0,400}?"companyId"\s*=\s*\$1[\s\S]{0,200}?"deletedAt"\s+IS NULL/,
    );
  });

  it("umrah_sub_agents unlinked query is tenant + soft-delete scoped", () => {
    expect(HANDLER).toMatch(
      /FROM\s+umrah_sub_agents[\s\S]{0,400}?"companyId"\s*=\s*\$1[\s\S]{0,200}?"deletedAt"\s+IS NULL/,
    );
  });

  it("umrah_groups uninvoiced query is tenant + soft-delete scoped + EXISTS join on companyId", () => {
    expect(HANDLER).toMatch(
      /FROM\s+umrah_groups\s+g[\s\S]{0,400}?g\."companyId"\s*=\s*\$1[\s\S]{0,200}?g\."deletedAt"\s+IS NULL/,
    );
    expect(HANDLER).toMatch(
      /si\."companyId"\s*=\s*g\."companyId"[\s\S]{0,200}?si\."deletedAt"\s+IS NULL/,
    );
  });

  it("umrah_sales_invoices unpaid query is tenant + soft-delete scoped", () => {
    expect(HANDLER).toMatch(
      /FROM\s+umrah_sales_invoices[\s\S]{0,400}?"companyId"\s*=\s*\$1[\s\S]{0,200}?"deletedAt"\s+IS NULL/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — No SQL injection vector via the threshold params
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P6 §D — interval thresholds flow through parameterised cast, no string concat", () => {
  it("uses the canonical `($N || ' days')::interval` parameter form", () => {
    // The handler builds the interval out of a parameter so a
    // malicious query string can't smuggle SQL via the threshold.
    expect(HANDLER).toMatch(/\(\$2\s*\|\|\s*['"]\s*days['"]\s*\)::interval/);
  });

  it("does NOT inline the days number into the SQL via interpolation", () => {
    // Defensive: catch a regression that ever turns ${uninvoicedDays}
    // into the SQL string directly.
    expect(HANDLER).not.toMatch(/INTERVAL\s+['"]\$\{[^}]+\}/);
    expect(HANDLER).not.toMatch(/\$\{uninvoicedDays\}\s+days/);
    expect(HANDLER).not.toMatch(/\$\{unpaidDays\}\s+days/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Pure read path (no writes)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P6 §E — handler makes ZERO writes", () => {
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
