import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-17-P3 — sub-agent + main agent contact-employee recipient expansion.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-17 audit §3.3):
 *   - Migration 367 adds nullable `contactEmployeeId` to umrah_agents
 *     and umrah_sub_agents with partial indexes (no FK, no default).
 *   - `resolveInternalRecipients` in umrahInternalNotifications.ts
 *     reads the columns to pull in the operator assigned to liaise
 *     with the agent / sub-agent that owns the pilgrim event.
 *   - `InternalNotifyContext` gains an optional `subAgentId`.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No FE picker — operators populate via API for now.
 *   - No silent default (NULL contactEmployeeId stays NULL — no
 *     recipient added in that case).
 *   - No catalog edit. No bulk silent linkage.
 *
 * Failure modes pinned:
 *   - Migration loses IF NOT EXISTS / adds NOT NULL or DEFAULT → §A fails.
 *   - Engine stops reading contactEmployeeId from sub_agents/agents → §B fails.
 *   - Tenant scope (companyId + deletedAt + ea.status='active') drops → §C fails.
 *   - InternalNotifyContext loses subAgentId field → §D fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const MIGRATION = readFileSync(
  join(
    REPO_ROOT,
    "artifacts/api-server/src/migrations/367_umrah_agents_contact_employee_columns.sql",
  ),
  "utf8",
);

const ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInternalNotifications.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Migration shape: additive, idempotent, nullable, no FK
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P3 §A — migration adds nullable contactEmployeeId on both tables", () => {
  it("uses ADD COLUMN IF NOT EXISTS on umrah_agents", () => {
    expect(MIGRATION).toMatch(
      /ALTER TABLE\s+umrah_agents[\s\S]{0,200}?ADD COLUMN IF NOT EXISTS\s+"contactEmployeeId"\s+integer/,
    );
  });

  it("uses ADD COLUMN IF NOT EXISTS on umrah_sub_agents", () => {
    expect(MIGRATION).toMatch(
      /ALTER TABLE\s+umrah_sub_agents[\s\S]{0,200}?ADD COLUMN IF NOT EXISTS\s+"contactEmployeeId"\s+integer/,
    );
  });

  it("contactEmployeeId is nullable (no NOT NULL, no DEFAULT)", () => {
    expect(MIGRATION).not.toMatch(/"contactEmployeeId"\s+integer\s+NOT NULL/i);
    expect(MIGRATION).not.toMatch(/"contactEmployeeId"\s+integer\s+DEFAULT/i);
  });

  it("no FK constraint on either column", () => {
    expect(MIGRATION).not.toMatch(/"contactEmployeeId"[\s\S]{0,200}?REFERENCES/i);
    expect(MIGRATION).not.toMatch(/ADD CONSTRAINT[\s\S]{0,200}?FOREIGN KEY/i);
  });

  it("partial indexes exist for both tables on (companyId, contactEmployeeId) WHERE NOT NULL", () => {
    expect(MIGRATION).toMatch(
      /CREATE INDEX IF NOT EXISTS\s+idx_umrah_agents_contact_employee[\s\S]{0,300}?\("companyId",\s*"contactEmployeeId"\)[\s\S]{0,150}?WHERE\s+"contactEmployeeId"\s+IS NOT NULL/,
    );
    expect(MIGRATION).toMatch(
      /CREATE INDEX IF NOT EXISTS\s+idx_umrah_sub_agents_contact_employee[\s\S]{0,300}?\("companyId",\s*"contactEmployeeId"\)[\s\S]{0,150}?WHERE\s+"contactEmployeeId"\s+IS NOT NULL/,
    );
  });

  it("carries the @rollback annotation (migration-policy gate)", () => {
    expect(MIGRATION).toMatch(/@rollback:/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Engine reads contactEmployeeId on both lookups
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P3 §B — resolveInternalRecipients reads contactEmployeeId from both tables", () => {
  it("sub-agent branch SELECTs umrah_sub_agents joined to employee_assignments", () => {
    expect(ENGINE).toMatch(
      /if\s*\(\s*ctx\.subAgentId\s*\)[\s\S]{0,200}?FROM\s+umrah_sub_agents\s+sa[\s\S]{0,300}?JOIN\s+employee_assignments\s+ea[\s\S]{0,300}?sa\."contactEmployeeId"\s+IS NOT NULL/,
    );
  });

  it("agent branch SELECTs umrah_agents joined to employee_assignments", () => {
    expect(ENGINE).toMatch(
      /if\s*\(\s*ctx\.agentId\s*\)[\s\S]{0,200}?FROM\s+umrah_agents\s+a[\s\S]{0,300}?JOIN\s+employee_assignments\s+ea[\s\S]{0,300}?a\."contactEmployeeId"\s+IS NOT NULL/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Tenant scope preserved on both lookups
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P3 §C — both lookups gate on companyId + deletedAt + status='active'", () => {
  it("sub-agent lookup joins ea.companyId = sa.companyId + ea.status = 'active'", () => {
    expect(ENGINE).toMatch(
      /umrah_sub_agents\s+sa[\s\S]{0,400}?ea\."companyId"\s*=\s*sa\."companyId"[\s\S]{0,150}?ea\.status\s*=\s*['"]active['"]/,
    );
  });

  it("sub-agent lookup filters sa.deletedAt IS NULL", () => {
    expect(ENGINE).toMatch(
      /umrah_sub_agents\s+sa[\s\S]{0,800}?sa\."deletedAt"\s+IS NULL/,
    );
  });

  it("agent lookup joins ea.companyId = a.companyId + ea.status = 'active'", () => {
    expect(ENGINE).toMatch(
      /umrah_agents\s+a[\s\S]{0,400}?ea\."companyId"\s*=\s*a\."companyId"[\s\S]{0,150}?ea\.status\s*=\s*['"]active['"]/,
    );
  });

  it("agent lookup filters a.deletedAt IS NULL", () => {
    expect(ENGINE).toMatch(
      /umrah_agents\s+a[\s\S]{0,800}?a\."deletedAt"\s+IS NULL/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — InternalNotifyContext carries the new optional subAgentId field
// ─────────────────────────────────────────────────────────────────────────────
describe("U-17-P3 §D — InternalNotifyContext exposes subAgentId (optional, nullable)", () => {
  it("interface declares subAgentId?: number | null", () => {
    expect(ENGINE).toMatch(
      /interface\s+InternalNotifyContext[\s\S]+?subAgentId\?:\s*number\s*\|\s*null/,
    );
  });

  it("agentId stays nullable (no regression on the existing field)", () => {
    expect(ENGINE).toMatch(
      /interface\s+InternalNotifyContext[\s\S]+?agentId:\s*number\s*\|\s*null/,
    );
  });
});
