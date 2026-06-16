import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-05-P1 — schema additive migration for the commission-plan agent
 * attribution columns.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-05 audit §3.1):
 *   - Migration `347_umrah_commission_plan_agent_columns.sql` adds
 *     nullable `agentId` + `subAgentId` columns to
 *     `employee_commission_plans`.
 *   - No FK constraint. No backfill. No engine touch.
 *   - Two partial indexes support the future commission_report
 *     breakdown queries (U-04-P1 dependency).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine wiring of the new dim — that's U-05-P2 (borderline,
 *     owner-ratification gated).
 *   - No FE picker on the plan editor — that's U-05-P4.
 *   - No commission_report tab using the columns — that's U-04-P1.
 *   - No catalog edit. No silent linkage.
 *
 * Failure modes pinned:
 *   - Migration drops the IF NOT EXISTS guard → §A fails on re-run.
 *   - Migration adds a NOT NULL or DEFAULT → §B fails (would break
 *     legacy rows without backfill).
 *   - Migration adds a FK constraint → §C fails (no FK by design).
 *
 * Note: the original §D "engine still skips agent dim (P2 hard-pause)"
 * block was removed when U-05-P2 shipped the engine wiring; the new
 * positive pin lives in `umrahCommissionJeDimsSmoke.test.ts`.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/348_umrah_commission_plan_agent_columns.sql"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Migration shape: additive, idempotent, nullable
// ─────────────────────────────────────────────────────────────────────────────
describe("U-05-P1 §A — migration adds nullable agentId + subAgentId additively", () => {
  it("uses ADD COLUMN IF NOT EXISTS for both columns (idempotent re-run)", () => {
    expect(MIGRATION).toMatch(
      /ADD COLUMN IF NOT EXISTS\s+"agentId"\s+integer/,
    );
    expect(MIGRATION).toMatch(
      /ADD COLUMN IF NOT EXISTS\s+"subAgentId"\s+integer/,
    );
  });

  it("operates on employee_commission_plans (the plan table, not the calc table)", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE\s+employee_commission_plans/);
    expect(MIGRATION).not.toMatch(/ALTER TABLE\s+employee_commission_calculations/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — No NOT NULL, no DEFAULT, no backfill
// ─────────────────────────────────────────────────────────────────────────────
describe("U-05-P1 §B — columns are nullable with no DEFAULT and no backfill", () => {
  it("agentId column has no NOT NULL constraint", () => {
    expect(MIGRATION).not.toMatch(/"agentId"\s+integer\s+NOT NULL/i);
  });

  it("subAgentId column has no NOT NULL constraint", () => {
    expect(MIGRATION).not.toMatch(/"subAgentId"\s+integer\s+NOT NULL/i);
  });

  it("agentId column has no DEFAULT clause", () => {
    expect(MIGRATION).not.toMatch(/"agentId"\s+integer\s+DEFAULT/i);
  });

  it("subAgentId column has no DEFAULT clause", () => {
    expect(MIGRATION).not.toMatch(/"subAgentId"\s+integer\s+DEFAULT/i);
  });

  it("no UPDATE statement (zero backfill)", () => {
    // Same column comment in BILL-MAIN P2 migration. Backfill of
    // legacy plans is operator's job via the editor (P4) — the
    // migration only adds the shape.
    expect(MIGRATION).not.toMatch(/UPDATE\s+employee_commission_plans/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — No FK constraint
// ─────────────────────────────────────────────────────────────────────────────
describe("U-05-P1 §C — no FK constraint on either column", () => {
  it("no REFERENCES clause for agentId", () => {
    expect(MIGRATION).not.toMatch(/"agentId"[\s\S]{0,200}?REFERENCES\s+umrah_agents/i);
  });

  it("no REFERENCES clause for subAgentId", () => {
    expect(MIGRATION).not.toMatch(/"subAgentId"[\s\S]{0,200}?REFERENCES\s+umrah_sub_agents/i);
  });

  it("no ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY", () => {
    expect(MIGRATION).not.toMatch(/ADD CONSTRAINT[\s\S]{0,200}?FOREIGN KEY/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Partial indexes for the breakdown queries
// ─────────────────────────────────────────────────────────────────────────────
describe("U-05-P1 §E — partial indexes support future breakdown reports", () => {
  it("indexes companyId+agentId where agentId IS NOT NULL", () => {
    expect(MIGRATION).toMatch(
      /CREATE INDEX IF NOT EXISTS\s+idx_employee_commission_plans_agent[\s\S]{0,400}?\("companyId",\s*"agentId"\)[\s\S]{0,200}?WHERE\s+"agentId"\s+IS NOT NULL/,
    );
  });

  it("indexes companyId+subAgentId where subAgentId IS NOT NULL", () => {
    expect(MIGRATION).toMatch(
      /CREATE INDEX IF NOT EXISTS\s+idx_employee_commission_plans_sub_agent[\s\S]{0,400}?\("companyId",\s*"subAgentId"\)[\s\S]{0,200}?WHERE\s+"subAgentId"\s+IS NOT NULL/,
    );
  });
});
