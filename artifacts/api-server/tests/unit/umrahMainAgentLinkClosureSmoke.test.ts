import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BILL-MAIN P7 — static closure smoke for the main-agent linkage loop.
 *
 * Scope (autonomous-class under UMRAH_REMAINING_WORK_ROADMAP.md §5
 * line 106 — "P7 Closure pack: contract/e2e proving import → link →
 * invoice loop on the agent path"):
 *
 *   The dynamic E2E
 *   (`umrahMainAgentLinkClosure.dynamic.test.ts`) proves the loop
 *   end-to-end against a live Postgres. The static smoke below
 *   protects the SOURCE-LEVEL contract that makes the loop work
 *   without spinning a DB. Every CI run executes this — the dynamic
 *   half runs only on the integration job.
 *
 * Failure modes pinned:
 *   §A — preview engine stops reading `clientId` from umrah_agents
 *        at preview time → unlinkedMainAgents would go stale across
 *        a link operation.
 *   §B — preview's unlinkedMainAgents filter no longer gates on
 *        `clientId == null` → the link op stops clearing the banner.
 *   §C — linker route stops writing `clientId` on umrah_agents (or
 *        writes a different column) → BILL-MAIN P6 preview keeps
 *        showing the agent forever.
 *   §D — invoicing engine starts reading `agent.clientId` ahead of
 *        BILL-MAIN P4 (hard-pause) → silent engine-fallback ship
 *        without owner ratification.
 *   §E — a bulk linker appears in the umrah route file → bypasses
 *        the operator-confirmed single-link contract.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch / no migration / no FE / no catalog edit.
 *   - No assertion on per-PR behaviour; only the static contracts
 *     that the dynamic E2E relies on.
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
const UMRAH_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Preview reads `clientId` from `umrah_agents` at preview time
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P7 §A — preview engine reads umrah_agents.clientId at preview time (no cache)", () => {
  it("the umrah_agents SELECT in the import engine pulls `clientId` (not just name/contractRef)", () => {
    // BILL-MAIN P6 widened this SELECT from `SELECT "contractRef"`
    // to `SELECT id, name, "contractRef", "clientId"`. The P7 closure
    // relies on that wider shape — without `clientId` in the SELECT,
    // the matchedMainAgents Map cannot carry the field the filter
    // needs.
    const wideSelects =
      IMPORT_ENGINE.match(
        /SELECT\s+id,\s*name,\s*"contractRef",\s*"clientId"\s+FROM\s+umrah_agents/g,
      ) ?? [];
    expect(wideSelects.length).toBeGreaterThanOrEqual(2);
  });

  it("no caching/memo wrapper sits between the SELECT and the matchedMainAgents Map", () => {
    // A regression that wraps the agent lookup in a process-level
    // memo (e.g. lru-cache, lodash.memoize) would keep the unlinked
    // banner alive across a link operation. Pin the absence of any
    // memo-style helper on the matchedMainAgents path.
    const region = IMPORT_ENGINE.match(
      /matchedMainAgents\s*=\s*new\s+Map[\s\S]{0,15000}?unlinkedMainAgents\s*=/,
    );
    expect(region, "matchedMainAgents region not found").toBeTruthy();
    expect(region![0]).not.toMatch(/memoize|lruCache|new\s+LRU|LRUCache\(/);
    expect(region![0]).not.toMatch(/redis\.|getCache\(|cacheGet\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Preview filter still gates on clientId == null
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P7 §B — unlinkedMainAgents filter pins on clientId == null", () => {
  it("the filter expression compares clientId against null", () => {
    expect(IMPORT_ENGINE).toMatch(
      /matchedMainAgents[\s\S]{0,400}?\.filter\(\(a\)\s*=>\s*a\.clientId\s*==\s*null\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Linker route writes exactly the clientId column
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P7 §C — link-client route writes umrah_agents.clientId, nothing else", () => {
  it("UPDATE umrah_agents SET \"clientId\"=$1 appears in the link-client handler", () => {
    // Pull a window around the handler so we don't accidentally
    // match a different UPDATE elsewhere in the file.
    const handler = UMRAH_ROUTE.match(
      /router\.put\(["']\/agents\/:id\/link-client["'][\s\S]{0,4000}?^\}\);/m,
    );
    expect(handler, "link-client handler not found").toBeTruthy();
    expect(handler![0]).toMatch(
      /UPDATE\s+umrah_agents\s+SET\s+"clientId"=\$1/i,
    );
  });

  it("handler does NOT insert into clients (no silent client creation)", () => {
    const handler = UMRAH_ROUTE.match(
      /router\.put\(["']\/agents\/:id\/link-client["'][\s\S]{0,4000}?^\}\);/m,
    );
    expect(handler![0]).not.toMatch(/INSERT\s+INTO\s+clients\b/i);
  });

  it("handler does NOT INSERT INTO or UPDATE subsidiary_accounts (no silent AR opening)", () => {
    const handler = UMRAH_ROUTE.match(
      /router\.put\(["']\/agents\/:id\/link-client["'][\s\S]{0,4000}?^\}\);/m,
    );
    // We must allow the documentation comment that explains WHY the
    // route doesn't open AR ("No subsidiary_accounts row is created
    // here..."), so the assertion targets SQL writes only.
    expect(handler![0]).not.toMatch(/INSERT\s+INTO\s+subsidiary_accounts\b/i);
    expect(handler![0]).not.toMatch(/UPDATE\s+subsidiary_accounts\b/i);
  });

  it("handler emits the `umrah.agent.linked_to_client` event so the link is observable", () => {
    const handler = UMRAH_ROUTE.match(
      /router\.put\(["']\/agents\/:id\/link-client["'][\s\S]{0,4000}?^\}\);/m,
    );
    expect(handler![0]).toMatch(/umrah\.agent\.linked_to_client/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Invoicing engine stays out of agent.clientId until P4 ships
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P7 §D — invoicing engine boundary preserved (no agent.clientId read)", () => {
  it("invoicing engine does NOT read `agent.clientId`", () => {
    expect(INVOICING_ENGINE).not.toMatch(/\bagent\.clientId\b/);
  });

  it("invoicing engine does NOT mention `billingClientId`", () => {
    expect(INVOICING_ENGINE).not.toMatch(/billingClientId/);
  });

  it("invoicing engine still throws ConflictError on missing subAgent.clientId", () => {
    expect(INVOICING_ENGINE).toMatch(
      /if\s*\(\s*!subAgent\.clientId\s*\)\s*\{[\s\S]{0,2000}?throw\s+new\s+ConflictError\(/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — No bulk linker
// ─────────────────────────────────────────────────────────────────────────────
describe("BILL-MAIN P7 §E — no bulk-link route appears", () => {
  it("no /agents/bulk-link route", () => {
    expect(UMRAH_ROUTE).not.toMatch(/\/agents\/bulk-link/);
  });

  it("no /agents/auto-link route", () => {
    expect(UMRAH_ROUTE).not.toMatch(/\/agents\/auto-link/);
  });
});
