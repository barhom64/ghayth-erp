import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UMRAH_POLICY_CATEGORIES,
} from "../../src/lib/umrahSettingsPoliciesCatalog.js";

/**
 * U-11 Phase 3a — detection-only enrichment of the import preview.
 *
 * Scope (per the owner's explicit narrow authorisation on #2080):
 *   - `previewMutamersImport` / `previewVouchersImport` surface the
 *     active `clientLinkagePolicy` + an invoicing-block hint when
 *     the import would touch sub-agents that lack a `clientId`.
 *   - The FE import wizard renders a banner with the three Phase
 *     3a guarantees (operational ok, no auto-link, invoicing blocked
 *     until explicit linkage).
 *   - The preview engine NEVER acts on the policy. Reading the
 *     value is informational only.
 *
 * Non-goals (forbidden by the owner):
 *   - No client creation.
 *   - No AR opening.
 *   - No auto-linkage (silent or otherwise).
 *   - No historical edits, no migration, no issued-invoice edit,
 *     no hard-coded mapping, no JE.
 *   - No `main_agent_client` schema work.
 *   - U-12 / U-02b untouched.
 *
 * Failure modes pinned:
 *   - Removing the `clientLinkagePolicy` / `unlinkedSubAgentInvoicingHint`
 *     surface on `ImportDiff` → §A fails.
 *   - Routing the import to INSERT INTO clients or to silently
 *     update `umrah_sub_agents.clientId` → §B fails.
 *   - Weakening the engine gate on `subAgent.clientId` → §C fails.
 *   - Flipping the catalog default away from
 *     `operational_until_linked` → §D fails.
 *   - FE removing the banner → §E fails.
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
const IMPORT_WIZARD_FE = readFileSync(
  join(
    REPO_ROOT,
    "artifacts/ghayth-erp/src/pages/umrah/import-wizard.tsx",
  ),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — preview surfaces clientLinkagePolicy + invoicing-block hint
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 Phase 3a §A — preview surfaces policy + invoicing-block hint", () => {
  it("ImportDiff declares `clientLinkagePolicy: string`", () => {
    // Anchored on the field type so a refactor that downgrades it
    // (e.g. to optional or to a union with null) fails here.
    expect(IMPORT_ENGINE).toMatch(
      /clientLinkagePolicy:\s*string\s*;/,
    );
  });

  it("ImportDiff declares `unlinkedSubAgentInvoicingHint` with the four expected sub-fields", () => {
    expect(IMPORT_ENGINE).toMatch(
      /unlinkedSubAgentInvoicingHint:\s*\n?\s*\|\s*\{[\s\S]{0,800}?willBlockInvoicing:\s*boolean;[\s\S]{0,800}?unlinkedSubAgentCount:\s*number;[\s\S]{0,800}?activePolicy:\s*string;[\s\S]{0,800}?arabicHint:\s*string;/,
    );
  });

  it("previewImport reads the policy via resolveSettings on the canonical key", () => {
    // Same key as the invoicing engine (single source of truth).
    expect(IMPORT_ENGINE).toMatch(
      /resolveSettings\(\s*"umrah\.auto_link\.clientLinkagePolicy"\s*,\s*scope\.companyId\s*,?\s*\)/,
    );
  });

  it("previewImport falls back to `operational_until_linked` when no setting is set", () => {
    // The safe default fires when policy is missing OR not a string.
    // Pinning the literal default-return so a silent change to a
    // different fallback (e.g. sub_agent_client_required) must update
    // this assertion deliberately.
    expect(IMPORT_ENGINE).toMatch(
      /activePolicy\s*=[\s\S]{0,200}?"operational_until_linked"/,
    );
  });

  it("preview populates the hint ONLY when unlinkedSubAgents.length > 0", () => {
    // The hint must be null when nothing is unlinked (so the banner
    // doesn't render on a clean import). Anchoring on the literal
    // guard catches an over-eager population that would always
    // render the banner.
    expect(IMPORT_ENGINE).toMatch(
      /diff\.unlinkedSubAgents\.length\s*>\s*0[\s\S]{0,400}?diff\.unlinkedSubAgentInvoicingHint\s*=\s*\{/,
    );
  });

  it("hint's arabicHint mentions PUT /umrah/sub-agents/:id/link (the only sanctioned linker)", () => {
    // Steers the operator to the canonical explicit linker. If the
    // hint is ever rewritten to suggest a silent auto-link path,
    // this fails.
    expect(IMPORT_ENGINE).toMatch(
      /PUT\s+\/umrah\/sub-agents\/:id\/link/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — silent-linkage / silent-client-creation guards in the import path
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 Phase 3a §B — import path stays silent on client + linkage writes", () => {
  it("import engine does NOT INSERT INTO clients (no silent client creation)", () => {
    // The catalog policy is INFORMATIONAL here. If a future PR
    // decides to auto-create on policy=operator_confirmed_on_import,
    // it MUST belong in a separate route + a separate audit smoke,
    // not in the silent import path.
    expect(IMPORT_ENGINE).not.toMatch(/INSERT\s+INTO\s+clients\b/i);
  });

  it("import engine does NOT UPDATE clients", () => {
    expect(IMPORT_ENGINE).not.toMatch(/UPDATE\s+clients\b/i);
  });

  it("import engine does NOT UPDATE umrah_sub_agents SET \"clientId\" (no silent backfill linkage)", () => {
    // resolveSubAgent already updates `agentId` to backfill the
    // parent FK — that's umrah-domain only. Touching `clientId`
    // here would be silent linkage, which the owner explicitly
    // forbade.
    expect(IMPORT_ENGINE).not.toMatch(
      /UPDATE\s+umrah_sub_agents[\s\S]{0,200}?SET[\s\S]{0,200}?"clientId"/i,
    );
  });

  it("INSERT INTO umrah_sub_agents in the import path still omits the clientId column", () => {
    // Auto-created sub-agents ship with clientId = NULL (the U-11
    // Phase 1 gap assertion). Phase 3a does NOT change this.
    const inserts =
      IMPORT_ENGINE.match(/INSERT\s+INTO\s+umrah_sub_agents\s*\(([^)]*)\)/gi) ??
      [];
    expect(inserts.length).toBeGreaterThan(0);
    for (const ins of inserts) {
      expect(ins).not.toMatch(/"clientId"/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — invoicing engine gate intact (no policy-driven loosening)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 Phase 3a §C — invoicing gate on subAgent.clientId is intact", () => {
  it("generateSalesInvoice still throws ConflictError when subAgent.clientId is missing", () => {
    // Phase 3a is purely a detection layer. The hard block at
    // invoice time MUST stay. If a future Phase 3b refactors this
    // to a softer warning, that's a deliberate decision logged on
    // its own PR.
    expect(INVOICING_ENGINE).toMatch(
      /if\s*\(\s*!subAgent\.clientId\s*\)\s*\{[\s\S]{0,2000}?throw\s+new\s+ConflictError\(/,
    );
  });

  it("engine still consults the policy via the canonical key (no rival key sneaked in)", () => {
    expect(INVOICING_ENGINE).toMatch(
      /resolveSettings\(\s*"umrah\.auto_link\.clientLinkagePolicy"\s*,\s*companyId\s*,?\s*\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — catalog defaultValue unchanged
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 Phase 3a §D — catalog default is still `operational_until_linked`", () => {
  const autoLink = UMRAH_POLICY_CATEGORIES.find(
    (c) => c.id === "auto_link",
  );
  const policyField = autoLink?.fields.find(
    (f) => f.key === "clientLinkagePolicy",
  );

  it("policy field still exists under auto_link", () => {
    expect(policyField).toBeDefined();
  });

  it("policy field defaultValue is still `operational_until_linked`", () => {
    expect(policyField?.defaultValue).toBe("operational_until_linked");
  });

  it("policy field still exposes all four ratified values", () => {
    const values = new Set(
      (policyField?.options ?? []).map((o) => o.value),
    );
    expect(values.has("operational_until_linked")).toBe(true);
    expect(values.has("sub_agent_client_required")).toBe(true);
    expect(values.has("main_agent_client")).toBe(true);
    expect(values.has("operator_confirmed_on_import")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — FE banner is wired to the new hint
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 Phase 3a §E — FE banner is wired to the invoicing-block hint", () => {
  it("FE Preview type declares clientLinkagePolicy + unlinkedSubAgentInvoicingHint", () => {
    expect(IMPORT_WIZARD_FE).toMatch(
      /clientLinkagePolicy\?:\s*string\s*;/,
    );
    expect(IMPORT_WIZARD_FE).toMatch(
      /unlinkedSubAgentInvoicingHint\?:[\s\S]{0,400}?willBlockInvoicing:\s*boolean;/,
    );
  });

  it("FE renders the banner conditionally on the hint being non-null", () => {
    // Anchoring on the conditional + the heading copy: if the banner
    // is removed, both anchors fail.
    expect(IMPORT_WIZARD_FE).toMatch(
      /preview\.unlinkedSubAgentInvoicingHint\s*&&/,
    );
    expect(IMPORT_WIZARD_FE).toMatch(
      /الفوترة محظورة حتى الربط الصريح/,
    );
  });

  it("banner names the active policy and the three Phase 3a guarantees", () => {
    expect(IMPORT_WIZARD_FE).toMatch(/السياسة الحالية للربط/);
    // Operational allowed
    expect(IMPORT_WIZARD_FE).toMatch(/التشغيل مسموح/);
    // Invoicing blocked
    expect(IMPORT_WIZARD_FE).toMatch(/الفوترة ممنوعة/);
    // No auto-link
    expect(IMPORT_WIZARD_FE).toMatch(/لا يوجد ربط تلقائي/);
  });
});
