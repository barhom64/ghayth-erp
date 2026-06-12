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

  it("engine throws ConflictError when subAgent.clientId is falsy", () => {
    // The error message is in Arabic and references the linkage step
    // operators must take. Pinning the literal message catches a
    // silent rephrase that might confuse a future regression hunt.
    expect(INVOICING_ENGINE).toMatch(
      /if\s*\(\s*!subAgent\.clientId\s*\)\s*throw\s+new\s+ConflictError\(/,
    );
    expect(INVOICING_ENGINE).toMatch(
      /الوكيل الفرعي غير مربوط بعميل/,
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
// §E — Settings catalog has no client-linkage policy field today
// ─────────────────────────────────────────────────────────────────────────────
describe("U-11 §E — settings catalog has no client-linkage policy field today", () => {
  const autoLink = UMRAH_POLICY_CATEGORIES.find(
    (c) => c.id === "auto_link",
  );

  it("`auto_link` category exists with exactly its three pre-existing fields", () => {
    expect(autoLink).toBeDefined();
    const keys = new Set(autoLink!.fields.map((f) => f.key));
    expect(keys.has("autoCreateMissingAgents")).toBe(true);
    expect(keys.has("autoCreateMissingGroups")).toBe(true);
    expect(keys.has("fuzzyMatchMinConfidence")).toBe(true);
    expect(autoLink!.fields.length).toBe(3);
  });

  it("no field in `auto_link` mentions client linkage today", () => {
    // The policy field for U-11 cases A/B/C/D (if any) would land
    // here. Today there is nothing — confirm by sweeping the field
    // keys for likely names.
    const keys = autoLink!.fields.map((f) => f.key);
    const forbiddenSubstrings = [
      "client",
      "Client",
      "customer",
      "Customer",
      "linkClient",
    ];
    for (const key of keys) {
      for (const sub of forbiddenSubstrings) {
        expect(key).not.toContain(sub);
      }
    }
  });

  it("no other catalog category has snuck in a client-linkage policy field", () => {
    // Catch a future PR that adds the policy field under a
    // different category by mistake.
    for (const cat of UMRAH_POLICY_CATEGORIES) {
      for (const f of cat.fields) {
        expect(f.key).not.toMatch(/clientLinkagePolicy/i);
        expect(f.key).not.toMatch(/subAgentDefaultStatus/i);
        expect(f.key).not.toMatch(/customerEntity/i);
      }
    }
  });
});
