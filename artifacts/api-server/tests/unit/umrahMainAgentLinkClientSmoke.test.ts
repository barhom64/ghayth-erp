import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UMRAH_POLICY_CATEGORIES,
} from "../../src/lib/umrahSettingsPoliciesCatalog.js";

/**
 * BILL-MAIN P3 — explicit-confirmation linker for `umrah_agents.clientId`.
 *
 * Scope (per the owner's autonomous-class authorisation in
 * UMRAH_REMAINING_WORK_ROADMAP.md §5 + §4):
 *   - New route `PUT /umrah/agents/:id/link-client` linking a main
 *     agent to an EXISTING financial client, with explicit operator
 *     confirmation. Optional `reason` string is recorded on the
 *     audit log + event details.
 *
 * Non-goals (Permanent Hard Rails for #2080 — never crossed):
 *   - No `createNew` branch / no client creation on this route.
 *   - No AR opening / no subsidiary provisioning here.
 *   - No engine touch — invoicing still gates exclusively on
 *     subAgent.clientId. The new column on `umrah_agents` stays
 *     dormant from the engine's perspective.
 *   - No `main_agent_client` activation; catalog default stays
 *     `operational_until_linked`.
 *   - No bulk linker added.
 *
 * Failure modes pinned:
 *   - Route missing → §A fails.
 *   - Route INSERTs into `clients` or carries a `createNew` branch
 *     → §B fails.
 *   - Engine starts reading `agent.clientId` ahead of P4 → §C
 *     fails.
 *   - Catalog default flips → §D fails.
 *   - A new bulk-link route appears → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const UMRAH_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah.ts"),
  "utf8",
);
const INVOICING_ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);

// Pull the handler body for the link-client route so the §A / §B
// assertions don't leak into unrelated handlers in the same file.
function extractLinkClientHandler(src: string): string {
  const start = src.match(/router\.put\(\s*"\/agents\/:id\/link-client"/);
  if (!start || start.index === undefined) return "";
  const rest = src.slice(start.index);
  const stop = rest.match(/\nrouter\.(?:get|post|patch|put|delete)\(/);
  return stop && stop.index !== undefined ? rest.slice(0, stop.index) : rest;
}

// ─────────────────────────────────────────────────────────────────────────────
// §A — Route exists with the right shape (audit + event + reason)
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P3 §A — PUT /agents/:id/link-client wires audit + event + reason", () => {
  it("declares the route exactly once", () => {
    const decls = UMRAH_ROUTE.match(
      /router\.put\(\s*"\/agents\/:id\/link-client"/g,
    ) ?? [];
    expect(decls.length).toBe(1);
  });

  it("zod schema accepts clientId + optional reason capped at 500 chars", () => {
    expect(UMRAH_ROUTE).toMatch(
      /linkAgentClientSchema\s*=[\s\S]{0,400}?clientId:\s*z\.coerce\.number/,
    );
    expect(UMRAH_ROUTE).toMatch(
      /linkAgentClientSchema\s*=[\s\S]{0,600}?reason:\s*z\.string\(\)\.max\(500\)\.optional\(\)/,
    );
  });

  it("handler verifies the target client exists before any UPDATE", () => {
    const body = extractLinkClientHandler(UMRAH_ROUTE);
    expect(body.length).toBeGreaterThan(0);
    const verifyClientIdx = body.search(
      /SELECT\s+id\s+FROM\s+clients\s+WHERE\s+id=\$1\s+AND\s+"companyId"=\$2/i,
    );
    const updateIdx = body.search(/UPDATE\s+umrah_agents\s+SET\s+"clientId"/i);
    expect(verifyClientIdx).toBeGreaterThan(0);
    expect(updateIdx).toBeGreaterThan(verifyClientIdx);
    // Missing client → 404.
    expect(body).toMatch(/if\s*\(!existingClient\)\s*throw\s+new\s+NotFoundError/);
  });

  it("handler captures before.clientId by SELECTing the agent BEFORE the UPDATE", () => {
    const body = extractLinkClientHandler(UMRAH_ROUTE);
    const selectAgentIdx = body.search(
      /SELECT\s+id,\s*"clientId",\s*name\s+FROM\s+umrah_agents/i,
    );
    const updateIdx = body.search(/UPDATE\s+umrah_agents\s+SET\s+"clientId"/i);
    expect(selectAgentIdx).toBeGreaterThan(0);
    expect(updateIdx).toBeGreaterThan(selectAgentIdx);
    expect(body).toMatch(/beforeClientId\s*=\s*existingAgent\.clientId/);
  });

  it("createAuditLog receives before + after + reason on entity 'umrah_agents' with real entityId", () => {
    const body = extractLinkClientHandler(UMRAH_ROUTE);
    expect(body).toMatch(/createAuditLog\(\{[\s\S]{0,800}?entity:\s*"umrah_agents"/);
    expect(body).toMatch(/before:\s*\{\s*clientId:\s*beforeClientId\s*\}/);
    expect(body).toMatch(/after:\s*\{\s*clientId\s*\}/);
    expect(body).toMatch(/reason,?\s*\n/);
    // Real entityId, not 0.
    expect(body).toMatch(/entityId:\s*id\b/);
    expect(body).not.toMatch(/createAuditLog\(\{[\s\S]{0,800}?entityId:\s*0/);
  });

  it("emitEvent uses the canonical action `umrah.agent.linked_to_client` with operator-confirmed source", () => {
    const body = extractLinkClientHandler(UMRAH_ROUTE);
    expect(body).toMatch(/action:\s*"umrah\.agent\.linked_to_client"/);
    expect(body).toMatch(/beforeClientId/);
    expect(body).toMatch(/source:\s*"operator_confirmed_link_agent_client"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — No silent client creation / AR opening / engine activation here
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P3 §B — no silent client creation / AR opening on this route", () => {
  const body = extractLinkClientHandler(UMRAH_ROUTE);

  it("handler does NOT INSERT INTO clients", () => {
    expect(body).not.toMatch(/INSERT\s+INTO\s+clients\b/i);
  });

  it("handler does NOT provision any subsidiary_accounts row", () => {
    expect(body).not.toMatch(/INSERT\s+INTO\s+subsidiary_accounts\b/i);
    expect(body).not.toMatch(/createSubsidiaryAccountsForEntity\(/i);
  });

  it("handler does NOT expose a `createNew` branch (existing-client only)", () => {
    expect(body).not.toMatch(/\bcreateNew\b/);
  });

  it("handler does NOT touch `umrah_sub_agents.clientId` (only the main agent column)", () => {
    expect(body).not.toMatch(/UPDATE\s+umrah_sub_agents/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Invoicing engine is untouched (P4 is hard-pause)
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P3 §C — invoicing engine still reads only subAgent.clientId", () => {
  it("engine still throws ConflictError when subAgent.clientId is missing", () => {
    expect(INVOICING_ENGINE).toMatch(
      /if\s*\(\s*!subAgent\.clientId\s*\)\s*\{[\s\S]{0,2000}?throw\s+new\s+ConflictError\(/,
    );
  });

  it("engine does NOT yet read agent.clientId / billingClientId (P4 fallback not landed)", () => {
    expect(INVOICING_ENGINE).not.toMatch(/\bagent\.clientId\b/);
    expect(INVOICING_ENGINE).not.toMatch(/"agentClientId"/);
    expect(INVOICING_ENGINE).not.toMatch(/billingClientId/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Catalog default stays dormant
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P3 §D — catalog default stays `operational_until_linked`", () => {
  const autoLink = UMRAH_POLICY_CATEGORIES.find((c) => c.id === "auto_link");
  const policyField = autoLink?.fields.find(
    (f) => f.key === "clientLinkagePolicy",
  );

  it("policy field still exists with the safe default", () => {
    expect(policyField?.defaultValue).toBe("operational_until_linked");
  });

  it("policy field still exposes all four ratified values", () => {
    const values = new Set((policyField?.options ?? []).map((o) => o.value));
    expect(values.has("operational_until_linked")).toBe(true);
    expect(values.has("sub_agent_client_required")).toBe(true);
    expect(values.has("main_agent_client")).toBe(true);
    expect(values.has("operator_confirmed_on_import")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — No bulk silent linker
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P3 §E — no bulk silent linker was added", () => {
  it("no /agents/bulk-link or /agents/auto-link route exists", () => {
    expect(UMRAH_ROUTE).not.toMatch(
      /router\.(post|put)\(\s*"\/agents\/bulk-link/i,
    );
    expect(UMRAH_ROUTE).not.toMatch(
      /router\.(post|put)\(\s*"\/agents\/auto-link/i,
    );
  });

  it("linkAgentClientSchema requires a singular clientId (no array form)", () => {
    expect(UMRAH_ROUTE).toMatch(
      /linkAgentClientSchema\s*=[\s\S]{0,400}?clientId:\s*z\.coerce\.number/,
    );
    expect(UMRAH_ROUTE).not.toMatch(
      /linkAgentClientSchema\s*=[\s\S]{0,400}?clientIds:\s*z\.array/,
    );
  });
});
