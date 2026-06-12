import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UMRAH_POLICY_CATEGORIES,
} from "../../src/lib/umrahSettingsPoliciesCatalog.js";

/**
 * U-11 — Agent / Sub-Agent → Financial Client Linkage Audit (regression
 * smoke).
 *
 * Scope: investigation pass per the owner's explicit "investigate before
 * build" directive. This smoke does NOT modify behaviour. It freezes the
 * observed current state so that when the owner ratifies a policy
 * (cases A / B / C / D in the audit doc), the resulting implementation
 * PR will fail these sentinels on purpose — making the policy change a
 * visible diff in code review.
 *
 * Companion doc:
 *   docs/governance/umrah-inventory-organization-repair/findings/
 *   U-11_agent_client_linkage_audit.md
 *
 * What the smoke pins (each is a fact verified at PR write time):
 *
 *   §A  Engine gate: generateSalesInvoice requires subAgent.clientId
 *       and throws ConflictError when it's missing. Today this is the
 *       only place in the system that hard-blocks for a missing client
 *       linkage.
 *
 *   §B  Import path is silent on clients: resolveAgent /
 *       resolveSubAgent / confirmMutamersImport do NOT touch the
 *       `clients` table. Auto-created sub-agents ship with
 *       clientId = NULL.
 *
 *   §C  Schema asymmetry: umrah_agents has NO clientId column;
 *       umrah_sub_agents has clientId as a nullable integer.
 *
 *   §D  Explicit linker exists: PUT /sub-agents/:id/link is the only
 *       path that creates/links a `clients` row to a sub-agent.
 *
 *   §E  Settings catalog has no client-linkage policy field today —
 *       the `auto_link` category covers agents and groups only.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const INVOICING_ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);
const IMPORT_ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahImportEngine.ts"),
  "utf8",
);
const UMRAH_ENTITIES_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const SUB_AGENTS_MIGRATION = readFileSync(
  join(
    REPO_ROOT,
    "artifacts/api-server/src/migrations/093_umrah_phase2_tables.sql",
  ),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pulls the body of a helper function declared as
 * `async function NAME(...)` and returns up to the matching closing
 * brace at column 0 (heuristic — works because the import engine puts
 * each top-level function flush-left). Returns "" if not found.
 */
function extractTopLevelAsyncFn(src: string, name: string): string {
  const headerRe = new RegExp(
    `async\\s+function\\s+${name}\\s*\\([^)]*\\)[^{]*\\{`,
  );
  const m = src.match(headerRe);
  if (!m || m.index === undefined) return "";
  const startIdx = m.index;
  // Find the next line that starts with `}` (column 0). Top-level
  // functions in this file end with a flush-left close brace.
  const tail = src.slice(startIdx);
  const closeMatch = tail.match(/\n\}\n/);
  if (!closeMatch || closeMatch.index === undefined) return tail;
  return tail.slice(0, closeMatch.index + 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// §A — Engine gate: generateSalesInvoice hard-blocks on subAgent.clientId
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 §A — generateSalesInvoice gates on subAgent.clientId", () => {
  it("engine selects subAgent.clientId via the canonical LEFT JOIN clients query", () => {
    // Anchoring on the LEFT JOIN clauses guarantees the field is
    // actually loaded (and named "clientName" for the error path).
    expect(INVOICING_ENGINE).toMatch(
      /FROM\s+umrah_sub_agents\s+sa[\s\S]*?LEFT\s+JOIN\s+clients\s+c\s+ON\s+c\.id\s*=\s*sa\."clientId"/,
    );
  });

  it("engine throws ConflictError when subAgent.clientId is falsy (policy-aware after U-11 impl)", () => {
    // The gate's STRUCTURE survives U-11: the engine still hard-blocks
    // when subAgent.clientId is missing — silent invoicing is still
    // impossible. The error MESSAGE is now policy-aware (4 branches),
    // but every branch ends with a ConflictError. The four-string
    // assertion below pins each policy's hint so a refactor that
    // collapses them back to a single generic message has to update
    // this smoke deliberately.
    expect(INVOICING_ENGINE).toMatch(
      /if\s*\(\s*!subAgent\.clientId\s*\)\s*\{[\s\S]*?throw\s+new\s+ConflictError\(/,
    );
    // operational_until_linked (default)
    expect(INVOICING_ENGINE).toMatch(/تشغيلي ولم يُربط بعميل بعد/);
    // sub_agent_client_required
    expect(INVOICING_ENGINE).toMatch(
      /تتطلب ربط الوكيل الفرعي بعميل صريح/,
    );
    // main_agent_client (deliberately routed to the same hard block —
    // schema work for agent.clientId is out of scope)
    expect(INVOICING_ENGINE).toMatch(
      /main_agent_client[\s\S]*?ربط الوكيل الرئيسي بعميل/,
    );
  });

  it("engine declares the 4 known policies as a single source of truth", () => {
    // KNOWN_CLIENT_LINKAGE_POLICIES is the canonical list. If a new
    // policy lands or one is renamed, this assertion flips and forces
    // a smoke update + audit-doc update.
    expect(INVOICING_ENGINE).toMatch(/KNOWN_CLIENT_LINKAGE_POLICIES/);
    expect(INVOICING_ENGINE).toMatch(/"operational_until_linked"/);
    expect(INVOICING_ENGINE).toMatch(/"sub_agent_client_required"/);
    expect(INVOICING_ENGINE).toMatch(/"main_agent_client"/);
    expect(INVOICING_ENGINE).toMatch(/"operator_confirmed_on_import"/);
  });

  it("engine resolves the active policy via resolveSettings on `umrah.auto_link.clientLinkagePolicy`", () => {
    // Anchoring on the exact settings key + the helper signature
    // catches a silent rename of the catalog key.
    expect(INVOICING_ENGINE).toMatch(
      /resolveSettings\(\s*"umrah\.auto_link\.clientLinkagePolicy"\s*,\s*companyId\s*,?\s*\)/,
    );
    expect(INVOICING_ENGINE).toMatch(
      /async\s+function\s+resolveClientLinkagePolicy\(/,
    );
  });

  it("policy resolver falls back to the safe default when no setting / unknown value", () => {
    // Pin the literal default-return so a refactor that silently
    // changes the default (e.g. to `sub_agent_client_required`) has
    // to update this assertion. The default is the company-safe
    // option per U-11's owner ratification.
    expect(INVOICING_ENGINE).toMatch(
      /return\s+"operational_until_linked"/,
    );
  });

  it("engine writes subAgent.clientId onto umrah_sales_invoices and onto every GL dimension", () => {
    // The dimension stamp (clientId) is what makes per-client AR
    // aging work without a separate AR balance table. If a refactor
    // drops the clientId dimension stamp, the AR aging breaks and
    // this catches it.
    expect(INVOICING_ENGINE).toMatch(
      /clientId:\s*\(subAgent\.clientId\s+as\s+number\s*\|\s*null\)/,
    );
  });

  it("engine never reads agent.clientId (the column doesn't exist today)", () => {
    // Case A in the audit doc would change this; a future PR that
    // adds an agent-clientId fallback should also delete this
    // assertion. Keeping it here documents the current contract.
    expect(INVOICING_ENGINE).not.toMatch(/\bagent\.clientId\b/);
    expect(INVOICING_ENGINE).not.toMatch(/\"agentClientId\"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Import path is silent on the clients table
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 §B — import path does not touch the clients table", () => {
  it("resolveAgent does not reference the clients table", () => {
    const body = extractTopLevelAsyncFn(IMPORT_ENGINE, "resolveAgent");
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/\bFROM\s+clients\b/i);
    expect(body).not.toMatch(/\bINSERT\s+INTO\s+clients\b/i);
    expect(body).not.toMatch(/\bUPDATE\s+clients\b/i);
  });

  it("resolveSubAgent does not reference the clients table", () => {
    const body = extractTopLevelAsyncFn(IMPORT_ENGINE, "resolveSubAgent");
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/\bFROM\s+clients\b/i);
    expect(body).not.toMatch(/\bINSERT\s+INTO\s+clients\b/i);
    expect(body).not.toMatch(/\bUPDATE\s+clients\b/i);
  });

  it("confirmMutamersImport does not write to the clients table", () => {
    const body = extractTopLevelAsyncFn(
      IMPORT_ENGINE,
      "confirmMutamersImport",
    );
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/\bINSERT\s+INTO\s+clients\b/i);
    expect(body).not.toMatch(/\bUPDATE\s+clients\b/i);
  });

  it("resolveSubAgent inserts umrah_sub_agents WITHOUT a clientId column in the INSERT", () => {
    // Documenting that auto-created sub-agents ship with clientId
    // = NULL. A future PR that backfills via the import will need
    // to delete this assertion.
    const body = extractTopLevelAsyncFn(IMPORT_ENGINE, "resolveSubAgent");
    const insertMatch = body.match(
      /INSERT\s+INTO\s+umrah_sub_agents\s*\(([^)]*)\)/i,
    );
    expect(insertMatch).not.toBeNull();
    expect(insertMatch![1]).not.toMatch(/"clientId"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Schema asymmetry between agent and sub-agent
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 §C — schema asymmetry (agent has no clientId; sub-agent has nullable clientId)", () => {
  it("umrah_sub_agents migration declares `clientId` as nullable integer (no NOT NULL)", () => {
    // The literal column declaration from migration 093.
    expect(SUB_AGENTS_MIGRATION).toMatch(/"clientId"\s+integer\s*,/i);
    // No NOT NULL on clientId in that migration.
    expect(SUB_AGENTS_MIGRATION).not.toMatch(
      /"clientId"\s+integer\s+NOT\s+NULL/i,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Explicit linker is the sole bridge to clients
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 §D — PUT /sub-agents/:id/link is the only sub-agent → clients bridge", () => {
  it("explicit link route is declared in routes/umrah-entities.ts", () => {
    expect(UMRAH_ENTITIES_ROUTE).toMatch(
      /router\.put\(\s*"\/sub-agents\/:id\/link"/,
    );
  });

  it("`unlinked` discovery route exists (GET /sub-agents/unlinked)", () => {
    expect(UMRAH_ENTITIES_ROUTE).toMatch(
      /router\.get\(\s*"\/sub-agents\/unlinked"/,
    );
  });

  it("explicit linker is allowed to INSERT INTO clients (createNew branch)", () => {
    // Anchoring on the INSERT proves that the linker is the
    // CANONICAL place where a sub-agent-driven client gets created.
    // If a future refactor moves the INSERT elsewhere (e.g., into
    // resolveSubAgent), §B will fail too — surfacing the migration.
    const linkBlock = UMRAH_ENTITIES_ROUTE.match(
      /router\.put\(\s*"\/sub-agents\/:id\/link"[\s\S]{0,4000}?(?=\n\}\);|\nrouter\.)/,
    );
    expect(linkBlock).not.toBeNull();
    expect(linkBlock![0]).toMatch(/INSERT\s+INTO\s+clients\b/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Settings catalog declares `clientLinkagePolicy` (post-U-11 impl)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 §E — settings catalog declares clientLinkagePolicy under auto_link", () => {
  const autoLink = UMRAH_POLICY_CATEGORIES.find(
    (c) => c.id === "auto_link",
  );

  it("`auto_link` category still exists with the three pre-existing fields", () => {
    expect(autoLink).toBeDefined();
    const keys = new Set(autoLink!.fields.map((f) => f.key));
    expect(keys.has("autoCreateMissingAgents")).toBe(true);
    expect(keys.has("autoCreateMissingGroups")).toBe(true);
    expect(keys.has("fuzzyMatchMinConfidence")).toBe(true);
  });

  it("auto_link category now has exactly four fields (three legacy + clientLinkagePolicy)", () => {
    expect(autoLink?.fields.length).toBe(4);
  });

  it("clientLinkagePolicy field is declared as a select with the safe default", () => {
    const f = autoLink!.fields.find((x) => x.key === "clientLinkagePolicy");
    expect(f).toBeDefined();
    expect(f!.type).toBe("select");
    expect(f!.defaultValue).toBe("operational_until_linked");
  });

  it("clientLinkagePolicy options expose exactly the 4 ratified values", () => {
    const f = autoLink!.fields.find((x) => x.key === "clientLinkagePolicy");
    expect(f?.options).toBeDefined();
    const values = new Set((f!.options ?? []).map((o) => o.value));
    expect(values.has("operational_until_linked")).toBe(true);
    expect(values.has("sub_agent_client_required")).toBe(true);
    expect(values.has("main_agent_client")).toBe(true);
    expect(values.has("operator_confirmed_on_import")).toBe(true);
    expect(f!.options!.length).toBe(4);
  });

  it("no rival policy key landed under another category (single source of truth)", () => {
    for (const cat of UMRAH_POLICY_CATEGORIES) {
      // The `auto_link` category is the canonical home. Any other
      // category surfacing the same key is a regression worth
      // catching — a refactor that moves the field elsewhere must
      // update this assertion deliberately.
      if (cat.id === "auto_link") continue;
      for (const f of cat.fields) {
        expect(f.key).not.toBe("clientLinkagePolicy");
        expect(f.key).not.toMatch(/subAgentDefaultStatus/i);
        expect(f.key).not.toMatch(/customerEntity/i);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §F — Silent-linkage + silent-invoicing guards (post-U-11 impl)
//
// The owner's two non-negotiables: no silent client creation in import,
// no silent invoicing without a linked client. The §B / §A sections
// already cover these from different angles; §F re-pins the boundary
// using exact-call sentinels so a future refactor can't slide either
// behaviour in under cover of a renamed function.
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 §F — silent-linkage + silent-invoicing guards", () => {
  it("import engine does NOT write to the clients table (Phase 3a may READ the policy but must not auto-create)", () => {
    // U-11 Phase 3a (#2080 follow-up) legitimately READS
    // `umrah.auto_link.clientLinkagePolicy` to surface the active
    // policy on the import preview. That's detection only — the
    // operator-facing wizard banner names the policy and the
    // invoicing-block hint. The HARD line is that no INSERT INTO
    // / UPDATE on the `clients` table happens in the import path.
    // The U-11 Phase 3a smoke
    // (umrahImportUnlinkedDetectionSmoke) re-pins this from its
    // own §B and stays the canonical owner of the constraint;
    // this assertion is the cross-reference.
    expect(IMPORT_ENGINE).not.toMatch(/INSERT\s+INTO\s+clients\b/i);
    expect(IMPORT_ENGINE).not.toMatch(/UPDATE\s+clients\b/i);
  });

  it("explicit linker (PUT /sub-agents/:id/link) still emits umrah.agent.linked event + audit log", () => {
    // Audit + Event on link were observed at audit time; this guards
    // against a silent regression that strips either of them.
    const linkBlock = UMRAH_ENTITIES_ROUTE.match(
      /router\.put\(\s*"\/sub-agents\/:id\/link"[\s\S]{0,6000}?(?=\nrouter\.|\n\}\);)/,
    );
    expect(linkBlock).not.toBeNull();
    expect(linkBlock![0]).toMatch(
      /emitEvent\(\s*\{[\s\S]*?"umrah\.agent\.linked"/,
    );
    expect(linkBlock![0]).toMatch(/createAuditLog\(/);
  });
});
