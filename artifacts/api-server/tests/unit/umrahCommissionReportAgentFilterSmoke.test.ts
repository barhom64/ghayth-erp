import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-04-P4 — agentId filter on commissions-summary + export.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-04 audit §3.4):
 *   - GET /umrah/reports/commissions-summary accepts ?agentId
 *     and chains it through employee_commission_plans (same as
 *     ?seasonId).
 *   - GET /umrah/reports/commissions-summary/export accepts ?agentId
 *     too, so the CSV row set matches the on-screen row set.
 *   - Mirrors the umrahAgentId dim that U-05-P2 surfaces on the JE.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch. No migration. No FE.
 *   - No change to result column set. No reorder.
 *   - Tenant scope still cc."companyId" = $1.
 *
 * Failure modes pinned:
 *   - Filter regresses to a literal interpolation → §A fails.
 *   - Filter forgets the cp."companyId" join → §B fails (cross-tenant
 *     read).
 *   - Export drifts from summary (filter only on one) → §C fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-reports.ts"),
  "utf8",
);

// Slice each handler so assertions are scoped — same approach as
// umrahCommissionReportExportSmoke / KPIs smoke.
const SUMMARY_HANDLER =
  ROUTES.match(
    /\/reports\/commissions-summary["'][\s\S]+?(?=^router\.|^\/\/ ─{3})/m,
  )?.[0] ?? "";

const EXPORT_HANDLER =
  ROUTES.match(
    /\/reports\/commissions-summary\/export[\s\S]+?(?=^router\.|^\/\/ ─{3}|^export default)/m,
  )?.[0] ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// §A — Summary route reads ?agentId and chains via EXISTS on plan
// ─────────────────────────────────────────────────────────────────────────────
describe("U-04-P4 §A — summary route accepts ?agentId via EXISTS on commission plan", () => {
  it("reads agentId from req.query", () => {
    expect(SUMMARY_HANDLER).toMatch(
      /agentId\s*=\s*req\.query\.agentId\s*\?\s*Number\(req\.query\.agentId\)\s*:\s*null/,
    );
  });

  it("uses parameterised EXISTS subquery on cp.\"agentId\"", () => {
    // Filter must use a parameter, not a literal.
    expect(SUMMARY_HANDLER).toMatch(
      /if\s*\(\s*agentId\s*\)[\s\S]{0,200}?params\.push\(agentId\)[\s\S]{0,500}?cp\."agentId"\s*=\s*\$\$\{params\.length\}/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Tenant scope preserved on the agent filter
// ─────────────────────────────────────────────────────────────────────────────
describe("U-04-P4 §B — agentId EXISTS still joins cp.\"companyId\" = cc.\"companyId\"", () => {
  it("summary handler's agent filter joins on companyId", () => {
    // The EXISTS subquery for agentId must constrain cp.companyId
    // to cc.companyId so a different tenant's plan can't leak rows.
    expect(SUMMARY_HANDLER).toMatch(
      /agentId\s*\)[\s\S]{0,400}?cp\."companyId"\s*=\s*cc\."companyId"[\s\S]{0,200}?cp\."agentId"\s*=\s*\$/,
    );
  });

  it("export handler's agent filter joins on companyId", () => {
    expect(EXPORT_HANDLER).toMatch(
      /agentId\s*\)[\s\S]{0,400}?cp\."companyId"\s*=\s*cc\."companyId"[\s\S]{0,200}?cp\."agentId"\s*=\s*\$/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Export carries the same agentId filter so CSV ↔ on-screen match
// ─────────────────────────────────────────────────────────────────────────────
describe("U-04-P4 §C — export route mirrors the summary's agentId filter", () => {
  it("export reads agentId from req.query", () => {
    expect(EXPORT_HANDLER).toMatch(
      /agentId\s*=\s*req\.query\.agentId\s*\?\s*Number\(req\.query\.agentId\)\s*:\s*null/,
    );
  });

  it("export pushes agentId into params and references cp.\"agentId\"", () => {
    expect(EXPORT_HANDLER).toMatch(
      /if\s*\(\s*agentId\s*\)[\s\S]{0,200}?params\.push\(agentId\)[\s\S]{0,500}?cp\."agentId"\s*=\s*\$\$\{params\.length\}/,
    );
  });
});
