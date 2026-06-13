import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  UMRAH_POLICY_CATEGORIES,
} from "../../src/lib/umrahSettingsPoliciesCatalog.js";

/**
 * U-13 P2 — main-agent client linkage column (migration only).
 *
 * Scope (per the owner's explicit authorisation on #2080):
 *   - Add `umrah_agents."clientId"` as a nullable integer + a
 *     supporting index. Nothing else.
 *
 * Non-goals — forbidden by the owner for this phase:
 *   - No invoicing-engine change (the engine must NOT yet read
 *     `agent.clientId`).
 *   - No backfill (the migration must not UPDATE any row).
 *   - No client creation (no INSERT INTO clients).
 *   - No AR opening (no subsidiary/receivable provisioning).
 *   - No `main_agent_client` activation (catalog default stays
 *     `operational_until_linked`; the engine still routes
 *     `main_agent_client` to the same hard block as the default).
 *   - No FE change, no new route, no catalog rename, no default
 *     flip.
 *
 * Failure modes pinned:
 *   - Migration adds NOT NULL / DEFAULT / FK / backfill → §A fails.
 *   - Engine starts reading `agent.clientId` (a P4 concern, not P2)
 *     → §B fails.
 *   - Migration creates a client or opens AR → §C fails.
 *   - Catalog default flips or `main_agent_client` is wired live
 *     → §D fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const MIGRATIONS_DIR = join(
  REPO_ROOT,
  "artifacts/api-server/src/migrations",
);
const INVOICING_ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);

// Locate the U-13 P2 migration by its canonical basename. Pinning the
// exact filename means a rename (which would re-order or duplicate the
// migration) surfaces here.
const MIGRATION_FILE = "337_umrah_agents_client_linkage.sql";
const MIGRATION_SRC = readFileSync(
  join(MIGRATIONS_DIR, MIGRATION_FILE),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Migration adds a nullable column + index, nothing heavier
// ─────────────────────────────────────────────────────────────────────────────
describe("U-13 P2 §A — migration adds nullable umrah_agents.clientId + index", () => {
  it("migration file exists exactly once (no duplicate basename)", () => {
    const matches = readdirSync(MIGRATIONS_DIR).filter(
      (f) => f === MIGRATION_FILE,
    );
    expect(matches.length).toBe(1);
  });

  it("adds the column via ADD COLUMN IF NOT EXISTS \"clientId\" integer", () => {
    expect(MIGRATION_SRC).toMatch(
      /ALTER\s+TABLE\s+umrah_agents\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+"clientId"\s+integer/i,
    );
  });

  it("the new column is NOT declared NOT NULL", () => {
    // The ADD COLUMN line must not carry a NOT NULL. Anchoring on the
    // column declaration + a NOT NULL on the same statement.
    expect(MIGRATION_SRC).not.toMatch(
      /ADD\s+COLUMN[^;]*"clientId"[^;]*NOT\s+NULL/i,
    );
  });

  it("the new column has NO default", () => {
    expect(MIGRATION_SRC).not.toMatch(
      /ADD\s+COLUMN[^;]*"clientId"[^;]*DEFAULT/i,
    );
  });

  it("the new column has NO foreign-key constraint (mirrors umrah_sub_agents convention)", () => {
    expect(MIGRATION_SRC).not.toMatch(/REFERENCES\s+clients/i);
    expect(MIGRATION_SRC).not.toMatch(/FOREIGN\s+KEY/i);
  });

  it("creates the supporting index on (companyId, clientId)", () => {
    expect(MIGRATION_SRC).toMatch(
      /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+\w+\s+ON\s+umrah_agents\s*\(\s*"companyId"\s*,\s*"clientId"\s*\)/i,
    );
  });

  it("carries the mandatory @rollback annotation", () => {
    expect(MIGRATION_SRC).toMatch(/--\s*@rollback:/);
    // Rollback must drop the column.
    expect(MIGRATION_SRC).toMatch(
      /DROP\s+COLUMN\s+IF\s+EXISTS\s+"clientId"/i,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Invoicing engine is untouched (no agent.clientId read yet)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-13 P2 §B — invoicing engine still reads only subAgent.clientId", () => {
  it("engine still gates on subAgent.clientId (U-11 guarantee intact)", () => {
    expect(INVOICING_ENGINE).toMatch(
      /if\s*\(\s*!subAgent\.clientId\s*\)\s*\{[\s\S]{0,2000}?throw\s+new\s+ConflictError\(/,
    );
  });

  it("engine does NOT yet read agent.clientId (that's a P4 concern, not P2)", () => {
    // P2 is migration-only. The engine must not start consulting the
    // new column until the separately-authorised P4 fallback lands.
    expect(INVOICING_ENGINE).not.toMatch(/\bagent\.clientId\b/);
    expect(INVOICING_ENGINE).not.toMatch(/"agentClientId"/);
    expect(INVOICING_ENGINE).not.toMatch(/billingClientId/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — No backfill, no client creation, no AR opening in the migration
// ─────────────────────────────────────────────────────────────────────────────
describe("U-13 P2 §C — migration is pure DDL: no backfill / client / AR", () => {
  it("migration performs NO backfill (no UPDATE statement)", () => {
    expect(MIGRATION_SRC).not.toMatch(/\bUPDATE\b/i);
  });

  it("migration does NOT create a client row", () => {
    expect(MIGRATION_SRC).not.toMatch(/INSERT\s+INTO\s+clients\b/i);
  });

  it("migration does NOT open AR / provision a subsidiary account", () => {
    expect(MIGRATION_SRC).not.toMatch(/INSERT\s+INTO\s+subsidiary_accounts\b/i);
    expect(MIGRATION_SRC).not.toMatch(/receivable/i);
  });

  it("migration touches only umrah_agents (no other table altered)", () => {
    // Every ALTER/CREATE INDEX in this file must target umrah_agents.
    const alterTargets = MIGRATION_SRC.match(
      /ALTER\s+TABLE\s+(\w+)/gi,
    ) ?? [];
    for (const t of alterTargets) {
      expect(t).toMatch(/umrah_agents/i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Policy not activated: catalog default + engine routing unchanged
// ─────────────────────────────────────────────────────────────────────────────
describe("U-13 P2 §D — main_agent_client stays dormant", () => {
  it("catalog default is still `operational_until_linked`", () => {
    const autoLink = UMRAH_POLICY_CATEGORIES.find((c) => c.id === "auto_link");
    const policyField = autoLink?.fields.find(
      (f) => f.key === "clientLinkagePolicy",
    );
    expect(policyField?.defaultValue).toBe("operational_until_linked");
  });

  it("catalog still exposes all four ratified policy values", () => {
    const autoLink = UMRAH_POLICY_CATEGORIES.find((c) => c.id === "auto_link");
    const policyField = autoLink?.fields.find(
      (f) => f.key === "clientLinkagePolicy",
    );
    const values = new Set((policyField?.options ?? []).map((o) => o.value));
    expect(values.has("operational_until_linked")).toBe(true);
    expect(values.has("sub_agent_client_required")).toBe(true);
    expect(values.has("main_agent_client")).toBe(true);
    expect(values.has("operator_confirmed_on_import")).toBe(true);
  });

  it("engine still routes main_agent_client to the same hard block (not activated)", () => {
    // Phase 2 deliberately routed main_agent_client to the
    // ConflictError. Until P4, that must remain — the engine must
    // not branch into an agent-clientId fallback.
    expect(INVOICING_ENGINE).toMatch(
      /case\s+"main_agent_client"[\s\S]{0,400}?ConflictError|main_agent_client[\s\S]{0,400}?ربط الوكيل الرئيسي/,
    );
  });
});
