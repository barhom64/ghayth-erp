import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BILL-MAIN P6 — detection-only surfacing of unlinked main agents
 * on the import preview.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §5):
 *   - `ImportDiff` gains an `unlinkedMainAgents` field listing the
 *     main agents that this file references and that already exist
 *     in `umrah_agents` but carry `clientId = NULL`.
 *   - The preview engine NEVER acts on the list — no auto-link, no
 *     client creation, no behaviour change. Listing is informational
 *     so an operator preparing to switch to `main_agent_client` mode
 *     can see who needs a `PUT /umrah/agents/:id/link-client` call
 *     first.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch.
 *   - No catalog default flip / no `main_agent_client` activation.
 *   - No write on clients / sub_agents / umrah_agents from this code
 *     path.
 *   - No bulk linker.
 *
 * Failure modes pinned:
 *   - Field removed or shape changed → §A fails.
 *   - Population logic drops the `clientId IS NULL` filter → §B
 *     fails.
 *   - Import engine starts mutating clients or umrah_agents.clientId
 *     → §C fails.
 *   - Invoicing engine starts reading `agent.clientId` ahead of P4
 *     → §D fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const IMPORT_ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahImportEngine.ts"),
  "utf8",
);
const INVOICING_ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Surface: field shape
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P6 §A — ImportDiff carries unlinkedMainAgents with the canonical shape", () => {
  it("declares `unlinkedMainAgents: { agentId, name, nuskAgentNumber }[]`", () => {
    expect(IMPORT_ENGINE).toMatch(
      /unlinkedMainAgents:\s*\{[\s\S]{0,400}?agentId:\s*number;[\s\S]{0,400}?name:\s*string;[\s\S]{0,400}?nuskAgentNumber:\s*string\s*\|\s*null;[\s\S]{0,200}?\}\[\]/,
    );
  });

  it("diff initialiser seeds an empty array", () => {
    expect(IMPORT_ENGINE).toMatch(/unlinkedMainAgents:\s*\[\]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Population logic respects the clientId-is-null filter
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P6 §B — population is restricted to existing main agents with clientId = NULL", () => {
  it("SELECT on umrah_agents reads `id, name, contractRef, clientId` (not just contractRef/name)", () => {
    // Both the nuskNumber lookup and the name lookup must fetch the
    // four fields so the matched-agents map carries the clientId
    // needed for the filter.
    const selectMatches =
      IMPORT_ENGINE.match(
        /SELECT\s+id,\s*name,\s*"contractRef",\s*"clientId"\s+FROM\s+umrah_agents/gi,
      ) ?? [];
    expect(selectMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("filter keeps only agents whose clientId is null", () => {
    expect(IMPORT_ENGINE).toMatch(
      /matchedMainAgents[\s\S]{0,200}?\.filter\(\(a\)\s*=>\s*a\.clientId\s*==\s*null\)/,
    );
  });

  it("output is sorted by name for stable display", () => {
    expect(IMPORT_ENGINE).toMatch(
      /unlinkedMainAgents\s*=[\s\S]{0,1200}?\.sort\(\(a,\s*b\)\s*=>\s*a\.name\.localeCompare\(b\.name\)\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Import path stays silent on writes (P6 is detection-only)
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P6 §C — import path makes NO writes to clients / umrah_agents.clientId", () => {
  it("no INSERT INTO clients in the import engine", () => {
    expect(IMPORT_ENGINE).not.toMatch(/INSERT\s+INTO\s+clients\b/i);
  });

  it("no UPDATE clients in the import engine", () => {
    expect(IMPORT_ENGINE).not.toMatch(/UPDATE\s+clients\b/i);
  });

  it("no UPDATE umrah_agents SET \"clientId\" in the import engine", () => {
    // P6 surfaces the gap. Filling it is the operator's job via
    // BILL-MAIN P3's explicit linker route.
    expect(IMPORT_ENGINE).not.toMatch(
      /UPDATE\s+umrah_agents[\s\S]{0,200}?SET[\s\S]{0,200}?"clientId"/i,
    );
  });

  it("INSERT INTO umrah_agents still omits clientId", () => {
    const inserts =
      IMPORT_ENGINE.match(
        /INSERT\s+INTO\s+umrah_agents\s*\(([^)]*)\)/gi,
      ) ?? [];
    for (const ins of inserts) {
      expect(ins).not.toMatch(/"clientId"/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Invoicing engine unchanged
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P6 §D — invoicing engine still gates on subAgent.clientId only", () => {
  it("engine still throws ConflictError on missing subAgent.clientId", () => {
    expect(INVOICING_ENGINE).toMatch(
      /if\s*\(\s*!subAgent\.clientId\s*\)\s*\{[\s\S]{0,2000}?throw\s+new\s+ConflictError\(/,
    );
  });

  it("engine does NOT read agent.clientId / billingClientId yet (P4 hard-pause)", () => {
    expect(INVOICING_ENGINE).not.toMatch(/\bagent\.clientId\b/);
    expect(INVOICING_ENGINE).not.toMatch(/billingClientId/);
  });
});
