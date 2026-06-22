import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UMRAH_POLICY_CATEGORIES,
} from "../../src/lib/umrahSettingsPoliciesCatalog.js";

/**
 * U-11 Phase 3b — explicit-confirmation link from the import wizard.
 *
 * Scope (per the owner's explicit narrow authorisation on #2080):
 *   - Two-step UX in the import wizard's existing "ربط الآن" dialog:
 *     step 1 picks an EXISTING client (no client creation surfaced),
 *     step 2 shows a summary + optional reason and confirms with
 *     "تأكيد الربط الصريح".
 *   - Backend route `POST /umrah/sub-agents/link-by-nusk` is the
 *     official wrapper that already owned this entry point; Phase
 *     3b enriches its audit/event with `before.clientId`,
 *     `after.clientId`, `reason`, real `entityId`, and a `source`
 *     marker — same UPDATE statement, no logic duplication.
 *
 * Non-goals (forbidden by the owner):
 *   - No new client creation (the `createNew` branch lives only on
 *     the detail-page linker, never reached from the import wizard).
 *   - No AR opening.
 *   - No journal entries.
 *   - No issued-invoice edits.
 *   - No historical-data edits except the chosen sub-agent's
 *     clientId (after explicit confirmation).
 *   - No migrations.
 *   - No hard-coded accounting mapping.
 *   - No `main_agent_client` migration.
 *   - No bulk silent linking — every call carries an explicit
 *     `nuskCode + clientId` from the operator-confirmed flow.
 *   - U-12 / U-02b untouched.
 *
 * Failure modes pinned:
 *   - Dropping the `reason` field, the before/after audit, or the
 *     real entityId → §A fails.
 *   - Sneaking a client INSERT/UPDATE or a `createNew` branch into
 *     the import-wizard path → §B fails.
 *   - Loosening the invoicing gate or flipping the catalog default
 *     → §C fails.
 *   - Removing the two-step UX or the policy display on step 2 →
 *     §D fails.
 *   - Adding a bulk silent linker → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

// U-07 Phase 6: link-by-nusk route now lives in the dedicated sub-router.
const UMRAH_SUB_AGENTS_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-sub-agents.ts"),
  "utf8",
);
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

// Pulls the body of the `POST /sub-agents/link-by-nusk` handler from
// umrah-sub-agents.ts. Anchors on the route declaration + the next
// `router.` line so the matched block is exactly the handler body.
function extractLinkByNuskHandler(src: string): string {
  const start = src.match(
    /router\.post\(\s*"\/sub-agents\/link-by-nusk"/,
  );
  if (!start || start.index === undefined) return "";
  const rest = src.slice(start.index);
  const stop = rest.match(/\nrouter\.(?:get|post|patch|put|delete)\(/);
  return stop && stop.index !== undefined
    ? rest.slice(0, stop.index)
    : rest;
}

// ─────────────────────────────────────────────────────────────────────────────
// §A — Backend route: enriched audit/event + reason + before/after
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 Phase 3b §A — link-by-nusk records before/after + reason + real entityId", () => {
  it("zod schema includes optional `reason` capped at 500 chars", () => {
    expect(UMRAH_SUB_AGENTS_ROUTE).toMatch(
      /linkByNuskSchema\s*=[\s\S]{0,800}?reason:\s*z\.string\(\)\.max\(500\)\.optional\(\)/,
    );
  });

  it("route SELECTs the sub-agent BEFORE the UPDATE to capture before.clientId", () => {
    const body = extractLinkByNuskHandler(UMRAH_SUB_AGENTS_ROUTE);
    expect(body.length).toBeGreaterThan(0);
    // Order matters: SELECT must appear above the UPDATE so the
    // captured `existingSubAgent.clientId` is the prior value, not
    // the post-update value.
    const selectIdx = body.search(
      /SELECT\s+id,\s*"clientId"\s+FROM\s+umrah_sub_agents/i,
    );
    const updateIdx = body.search(/UPDATE\s+umrah_sub_agents\s+SET/i);
    expect(selectIdx).toBeGreaterThan(0);
    expect(updateIdx).toBeGreaterThan(selectIdx);
  });

  it("auditFromRequest records before + after + reason with REAL entityId (subAgentId, not 0)", () => {
    const body = extractLinkByNuskHandler(UMRAH_SUB_AGENTS_ROUTE);
    // U-07 Phase 6: converted from createAuditLog to auditFromRequest (IGOC ratchet).
    // entityId is now the 4th positional argument — subAgentId.
    expect(body).toMatch(/auditFromRequest\(\s*req,\s*"update",\s*"umrah_sub_agents",\s*subAgentId/);
    expect(body).toMatch(/before:\s*\{\s*clientId:\s*beforeClientId\s*\}/);
    expect(body).toMatch(/after:\s*\{\s*nuskCode,\s*clientId\s*\}/);
    expect(body).toMatch(/reason[,}]/);
    // The old `entityId: 0` pattern (legacy bug) must NOT return.
    expect(body).not.toMatch(/auditFromRequest[\s\S]{0,200}?,\s*0[,)]/);
  });

  it("emitEvent details carry beforeClientId + reason + source = import_wizard_explicit_confirmation", () => {
    const body = extractLinkByNuskHandler(UMRAH_SUB_AGENTS_ROUTE);
    expect(body).toMatch(/emitEvent\(\{[\s\S]{0,1200}?action:\s*"umrah\.sub_agent\.linked_by_nusk"/);
    expect(body).toMatch(/beforeClientId/);
    expect(body).toMatch(/source:\s*"import_wizard_explicit_confirmation"/);
  });

  it("404 path: route raises NotFoundError when no matching sub-agent exists", () => {
    const body = extractLinkByNuskHandler(UMRAH_SUB_AGENTS_ROUTE);
    expect(body).toMatch(
      /if\s*\(!existingSubAgent\)\s*throw\s+new\s+NotFoundError/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Silent client creation / mutation is still forbidden
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 Phase 3b §B — no client creation, no createNew branch on the import-wizard path", () => {
  it("link-by-nusk handler does NOT INSERT INTO clients", () => {
    const body = extractLinkByNuskHandler(UMRAH_SUB_AGENTS_ROUTE);
    expect(body).not.toMatch(/INSERT\s+INTO\s+clients\b/i);
  });

  it("link-by-nusk handler does NOT have a `createNew` branch (only existing-client linkage)", () => {
    const body = extractLinkByNuskHandler(UMRAH_SUB_AGENTS_ROUTE);
    expect(body).not.toMatch(/\bcreateNew\b/);
  });

  it("import engine is still silent on the clients table (Phase 3a guarantee re-pinned)", () => {
    expect(IMPORT_ENGINE).not.toMatch(/INSERT\s+INTO\s+clients\b/i);
    expect(IMPORT_ENGINE).not.toMatch(/UPDATE\s+clients\b/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Invoicing gate intact + catalog default unchanged
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 Phase 3b §C — invoicing gate intact + catalog default unchanged", () => {
  it("generateSalesInvoice still throws ConflictError when subAgent.clientId is missing", () => {
    expect(INVOICING_ENGINE).toMatch(
      /if\s*\(\s*!subAgent\.clientId\s*\)\s*\{[\s\S]{0,2000}?throw\s+new\s+ConflictError\(/,
    );
  });

  it("catalog default is still `operational_until_linked`", () => {
    const autoLink = UMRAH_POLICY_CATEGORIES.find((c) => c.id === "auto_link");
    const policyField = autoLink?.fields.find(
      (f) => f.key === "clientLinkagePolicy",
    );
    expect(policyField?.defaultValue).toBe("operational_until_linked");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — FE wires the two-step explicit-confirmation UX
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 Phase 3b §D — FE two-step explicit-confirmation UX", () => {
  it("dialog declares the `linkReviewStep` state for the second step", () => {
    expect(IMPORT_WIZARD_FE).toMatch(/setLinkReviewStep/);
    expect(IMPORT_WIZARD_FE).toMatch(/linkReviewStep,\s*setLinkReviewStep/);
  });

  it("step 1 helper text reminds the operator only existing clients are picked", () => {
    expect(IMPORT_WIZARD_FE).toMatch(/اختيار عميل موجود فقط/);
    expect(IMPORT_WIZARD_FE).toMatch(/لا يُنشأ عميل جديد من هذه الشاشة/);
  });

  it("step 2 summary names the sub-agent, the picked client, and the active policy", () => {
    expect(IMPORT_WIZARD_FE).toMatch(/راجع التفاصيل قبل التأكيد/);
    expect(IMPORT_WIZARD_FE).toMatch(/الوكيل الفرعي:/);
    expect(IMPORT_WIZARD_FE).toMatch(/العميل المختار:/);
    expect(IMPORT_WIZARD_FE).toMatch(/السياسة الحالية:/);
    expect(IMPORT_WIZARD_FE).toMatch(
      /preview\?\.clientLinkagePolicy\s*\?\?\s*"operational_until_linked"/,
    );
  });

  it("confirm button is labelled \"تأكيد الربط الصريح\" (not \"ربط\")", () => {
    expect(IMPORT_WIZARD_FE).toMatch(/تأكيد الربط الصريح/);
  });

  it("doLinkSubAgent posts to /sub-agents/link-by-nusk and includes the optional reason", () => {
    expect(IMPORT_WIZARD_FE).toMatch(/\/umrah\/sub-agents\/link-by-nusk/);
    expect(IMPORT_WIZARD_FE).toMatch(
      /reasonTrimmed[\s\S]{0,200}?reason:\s*reasonTrimmed/,
    );
  });

  it("on success the invoicing hint clears when the unlinked list empties", () => {
    expect(IMPORT_WIZARD_FE).toMatch(
      /unlinkedSubAgentInvoicingHint:\s*\n?\s*remaining\.length\s*===\s*0\s*\?\s*null/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — No bulk silent linker
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 Phase 3b §E — no bulk silent linker was added", () => {
  it("no new POST/PUT endpoint named `/sub-agents/bulk-link` exists", () => {
    // Bulk linkers are the most common shape Phase 3b could regress
    // into; pin a few likely names so a future PR that introduces
    // any of them shows up here.
    expect(UMRAH_SUB_AGENTS_ROUTE).not.toMatch(
      /router\.(post|put)\(\s*"\/sub-agents\/bulk-link"/i,
    );
    expect(UMRAH_SUB_AGENTS_ROUTE).not.toMatch(
      /router\.(post|put)\(\s*"\/sub-agents\/bulk-link-by-nusk"/i,
    );
    expect(UMRAH_SUB_AGENTS_ROUTE).not.toMatch(
      /router\.(post|put)\(\s*"\/sub-agents\/auto-link"/i,
    );
  });

  it("link-by-nusk schema still requires a single nuskCode + clientId (no arrays)", () => {
    // A bulk shape would change `nuskCode` to `nuskCodes: z.array(...)`
    // or accept `clientId` as a many-to-many shape. Pin the singular
    // shape so any such drift fails here.
    expect(UMRAH_SUB_AGENTS_ROUTE).toMatch(
      /linkByNuskSchema\s*=[\s\S]{0,400}?nuskCode:\s*z\.string\(\)/,
    );
    expect(UMRAH_SUB_AGENTS_ROUTE).not.toMatch(
      /linkByNuskSchema\s*=[\s\S]{0,400}?nuskCodes:\s*z\.array/,
    );
  });

  it("import engine confirmMutamersImport still does NOT auto-link sub-agents to clients", () => {
    // Catches a future PR that wires the import preview's policy
    // read into a silent linkage path on confirm.
    expect(IMPORT_ENGINE).not.toMatch(
      /UPDATE\s+umrah_sub_agents[\s\S]{0,200}?SET[\s\S]{0,200}?"clientId"/i,
    );
  });
});
