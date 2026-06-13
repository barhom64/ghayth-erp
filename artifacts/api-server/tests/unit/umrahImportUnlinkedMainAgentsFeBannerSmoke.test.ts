import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BILL-MAIN P6 FE banner — surfaces the backend's
 * `unlinkedMainAgents` list on the import wizard preview.
 *
 * Scope (autonomous-class):
 *   - Add a new banner above the existing Phase 3a sub-agent
 *     banner block. Renders ONLY when the backend list is
 *     non-empty.
 *   - Names the active policy direction
 *     (operational_until_linked vs main_agent_client) and points
 *     the operator at PUT /umrah/agents/:id/link-client (the
 *     BILL-MAIN P3 linker) as the recovery path.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch.
 *   - No new state, no new API call from the FE.
 *   - No auto-link button.
 *
 * Failure modes pinned:
 *   - Preview type does not declare the field → §A fails.
 *   - Banner renders unconditionally / loses its non-empty guard
 *     → §B fails.
 *   - Banner forgets to name the link recovery path → §B fails.
 *   - Banner ends up suggesting silent linkage → §C fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const IMPORT_WIZARD_FE = readFileSync(
  join(
    REPO_ROOT,
    "artifacts/ghayth-erp/src/pages/umrah/import-wizard.tsx",
  ),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Preview type carries unlinkedMainAgents
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P6 FE §A — Preview type declares unlinkedMainAgents", () => {
  it("Preview type interface includes the field with the canonical shape", () => {
    expect(IMPORT_WIZARD_FE).toMatch(
      /unlinkedMainAgents\?:\s*\{[\s\S]{0,300}?agentId:\s*number;[\s\S]{0,200}?name:\s*string;[\s\S]{0,200}?nuskAgentNumber:\s*string\s*\|\s*null;[\s\S]{0,100}?\}\[\]/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Banner: conditional render, names the policy, points at P3 linker
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P6 FE §B — banner renders conditionally with the right copy", () => {
  it("banner renders ONLY when the list is non-empty (length > 0 guard)", () => {
    expect(IMPORT_WIZARD_FE).toMatch(
      /preview\.unlinkedMainAgents\s*&&\s*preview\.unlinkedMainAgents\.length\s*>\s*0/,
    );
  });

  it("banner has a data-testid for e2e selectors", () => {
    expect(IMPORT_WIZARD_FE).toMatch(
      /data-testid="import-unlinked-main-agents-banner"/,
    );
  });

  it("banner heading names the unlinked main-agents count", () => {
    expect(IMPORT_WIZARD_FE).toMatch(
      /وكلاء رئيسيون غير مربوطين بعميل/,
    );
  });

  it("banner names BOTH policy directions (operational_until_linked + main_agent_client)", () => {
    expect(IMPORT_WIZARD_FE).toMatch(/operational_until_linked/);
    expect(IMPORT_WIZARD_FE).toMatch(/main_agent_client/);
  });

  it("banner points the operator at the BILL-MAIN P3 linker route", () => {
    expect(IMPORT_WIZARD_FE).toMatch(
      /PUT\s+\/umrah\/agents\/:id\/link-client/,
    );
  });

  it("banner renders the agent name + nusk number table", () => {
    expect(IMPORT_WIZARD_FE).toMatch(
      /data-testid="import-unlinked-main-agents-table"/,
    );
    // First 10 rows only — long lists are truncated with a "+ N آخرين".
    expect(IMPORT_WIZARD_FE).toMatch(
      /preview\.unlinkedMainAgents\.slice\(0,\s*10\)/,
    );
    expect(IMPORT_WIZARD_FE).toMatch(/آخرين/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — No silent-linkage UI elements
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P6 FE §C — banner does NOT offer auto-link / silent-link UI", () => {
  it("banner does NOT carry a 'ربط الكل' / bulk-link button label", () => {
    // The sub-agents banner has a per-row "ربط الآن" button — that's
    // operator-confirmed and OK. A "ربط الكل" button would be a bulk
    // path, forbidden under §2 of the roadmap. We only check Arabic
    // copy here; auto-link URL paths are pinned in the next test.
    expect(IMPORT_WIZARD_FE).not.toMatch(/ربط\s+الكل/);
  });

  it("banner does NOT POST to a non-canonical linker endpoint", () => {
    // The only sanctioned writer is PUT /umrah/agents/:id/link-client.
    // Anchoring on the literal forbidden endpoint shapes.
    expect(IMPORT_WIZARD_FE).not.toMatch(/\/umrah\/agents\/bulk-link/i);
    expect(IMPORT_WIZARD_FE).not.toMatch(/\/umrah\/agents\/auto-link/i);
  });
});
