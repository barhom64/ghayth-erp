import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-05-P2 — commission JE carries umrahAgentId dimension.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-05 audit §3.2):
 *   - employee_commission_plans gained nullable agentId + subAgentId
 *     in migration 348 (U-05-P1).
 *   - This slice surfaces `agentId` on the commission JE line as the
 *     `umrahAgentId` dimension so finance reports can split commission
 *     expense by marketer.
 *   - Sub-agent attribution is intentionally NOT carried here yet;
 *     journal_entry_lines has no subAgentId column today and adding
 *     one is a separate migration slice.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No new migration. No schema change. No FE.
 *   - No bulk silent backfill — existing plans without agentId stay
 *     `undefined` on the JE line (the nullable column is honored).
 *   - No new accounting mapping — the same expense/payable codes apply.
 *
 * Failure modes pinned:
 *   - CommissionPlan stops reading agentId → §A fails.
 *   - JE line stops passing umrahAgentId → §B fails.
 *   - Someone passes subAgentId to a column that doesn't exist on
 *     journal_entry_lines → §C fails (would 500 on commit).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahCommissionEngine.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — CommissionPlan reads agentId from the plan row
// ─────────────────────────────────────────────────────────────────────────────
describe("U-05-P2 §A — CommissionPlan reads the nullable agent columns", () => {
  // Anchor on the interface block once.
  const PLAN_BLOCK =
    ENGINE.match(/interface\s+CommissionPlan\s*\{[\s\S]+?^\}/m)?.[0] ?? "";

  it("interface declares agentId: number | null", () => {
    expect(PLAN_BLOCK).toMatch(/agentId:\s*number\s*\|\s*null/);
  });

  it("interface declares subAgentId: number | null (for forward use)", () => {
    expect(PLAN_BLOCK).toMatch(/subAgentId:\s*number\s*\|\s*null/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — JE line carries umrahAgentId
// ─────────────────────────────────────────────────────────────────────────────
describe("U-05-P2 §B — commission JE line carries umrahAgentId", () => {
  it("expense + payable lines both pass umrahAgentId: plan.agentId ?? undefined", () => {
    // The body MUST set the dim from plan.agentId so a plan-with-agent
    // produces an agent-tagged GL line and a plan-without-agent stays
    // null-safe.
    const matches = ENGINE.match(/umrahAgentId:\s*plan\.agentId\s*\?\?\s*undefined/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("expense + payable lines still carry umrahSeasonId (no regression on prior dim)", () => {
    const matches = ENGINE.match(/umrahSeasonId:\s*plan\.seasonId/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("expense + payable lines still carry employeeId: plan.employeeId (no regression)", () => {
    const matches = ENGINE.match(/employeeId:\s*plan\.employeeId/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Sub-agent attribution NOT routed onto journal_entry_lines yet
// ─────────────────────────────────────────────────────────────────────────────
describe("U-05-P2 §C — subAgentId is NOT passed onto a JE line (no schema column)", () => {
  it("no JE line passes umrahSubAgentId", () => {
    expect(ENGINE).not.toMatch(/umrahSubAgentId\s*:/);
  });

  it("no JE line passes subAgentId directly", () => {
    // We don't want someone to accidentally write `subAgentId: plan.subAgentId`
    // on a JE line — would 500 on INSERT against journal_entry_lines.
    expect(ENGINE).not.toMatch(/subAgentId:\s*plan\.subAgentId/);
  });
});
