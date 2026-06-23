import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 21 — umrah-entities.ts split smoke (sales invoices) — LEDGER-GRADE.
 *
 * Scope:
 *   - Carves the 4 sales-invoice routes into a dedicated sub-router:
 *       artifacts/api-server/src/routes/umrah-invoices.ts
 *       GET   /invoices
 *       POST  /invoices/generate               (generateSalesInvoice engine)
 *       GET   /sales-wizard/uninvoiced-groups   (listUninvoicedGroups engine)
 *       PATCH /invoices/:id                     (metadata-only, no GL)
 *   - Parent mounts the sub-router via `router.use(invoicesRouter)` so the API
 *     surface stays identical.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch — generateSalesInvoice + listUninvoicedGroups
 *     (lib/umrahInvoicingEngine.ts) are NOT modified; this is a pure route move.
 *   - No route-body change beyond the IGOC audit-helper conversion.
 *   - No API surface change. No change to the invoice GL contract.
 *
 * §F is the ledger guard: it pins that the generate route stays a thin invoker
 * of generateSalesInvoice (no inline GL / journal SQL leaked into the route),
 * and that the metadata-only PATCH never posts GL — so the carve cannot smuggle
 * posting logic out of the engine boundary.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-invoices.ts"),
  "utf8",
);
const ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);

const ROUTES: [string, string][] = [
  ["get", "/invoices"],
  ["post", "/invoices/generate"],
  ["get", "/sales-wizard/uninvoiced-groups"],
  ["patch", "/invoices/:id"],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file exists + exports a Router as default
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 21 §A — umrah-invoices.ts is a valid sub-router file", () => {
  it("file is non-empty + imports Router from express", () => {
    expect(CHILD.length).toBeGreaterThan(1000);
    expect(CHILD).toMatch(/import\s*\{\s*Router\s*\}\s+from\s+["']express["']/);
  });

  it("creates a Router + exports it as default", () => {
    expect(CHILD).toMatch(/const\s+router\s*=\s*Router\(\)/);
    expect(CHILD).toMatch(/^export\s+default\s+router;?\s*$/m);
  });

  it("uses auditFromRequest (IGOC ratchet) — not the legacy createAuditLog directly", () => {
    expect(CHILD).toMatch(/auditFromRequest/);
    expect(CHILD).not.toMatch(/\bcreateAuditLog\s*\(/);
    expect(CHILD).not.toMatch(/import\s*\{[^}]*createAuditLog[^}]*\}\s*from/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Parent imports + mounts the sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 21 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(/import\s+invoicesRouter\s+from\s+["']\.\/umrah-invoices\.js["']/);
  });

  it("parent mounts the sub-router with router.use(invoicesRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*invoicesRouter\s*\)/);
  });

  it("parent no longer imports generateSalesInvoice / listUninvoicedGroups (moved with the routes)", () => {
    expect(PARENT).not.toMatch(/import\s*\{[^}]*generateSalesInvoice[^}]*\}\s*from/);
    expect(PARENT).not.toMatch(/await\s+generateSalesInvoice\s*\(/);
    expect(PARENT).not.toMatch(/await\s+listUninvoicedGroups\s*\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 4 routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 21 §C — all 4 moved routes are present in the child", () => {
  for (const [method, route] of ROUTES) {
    it(`child declares router.${method}("${route}", ...)`, () => {
      expect(CHILD).toMatch(new RegExp(`router\\.${method}\\(\\s*["']${esc(route)}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — The same routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 21 §D — parent no longer declares the moved routes", () => {
  for (const [method, route] of ROUTES) {
    it(`parent does NOT declare router.${method}("${route}", ...)`, () => {
      expect(PARENT).not.toMatch(new RegExp(`router\\.${method}\\(\\s*["']${esc(route)}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Parent file shrunk (regression-prevent floor)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 21 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 900 lines (was ~977 before this carve, ~861 after)", () => {
    expect(PARENT.split("\n").length).toBeLessThan(900);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §F — LEDGER CONTRACT: the generate route stays a thin engine invoker; the GL /
//      posting logic remains inside the engine, which is untouched. The
//      metadata-only PATCH never posts GL.
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 21 §F — invoice GL contract preserved by the carve", () => {
  it("the engine still exports the invoice + wizard functions (not modified by this carve)", () => {
    expect(ENGINE).toMatch(/export\s+(async\s+)?function\s+generateSalesInvoice\s*\(/);
    expect(ENGINE).toMatch(/export\s+(async\s+)?function\s+listUninvoicedGroups\s*\(/);
  });

  it("child imports both engine functions (not a re-implementation)", () => {
    expect(CHILD).toMatch(/import\s*\{[^}]*generateSalesInvoice[^}]*\}\s*from\s+["']\.\.\/lib\/umrahInvoicingEngine\.js["']/);
    expect(CHILD).toMatch(/import\s*\{[^}]*listUninvoicedGroups[^}]*\}\s*from\s+["']\.\.\/lib\/umrahInvoicingEngine\.js["']/);
  });

  it("POST /invoices/generate delegates to generateSalesInvoice with the tenant context (no inline posting)", () => {
    const handler = CHILD.match(/router\.post\("\/invoices\/generate"[\s\S]*?\n\}\);/);
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/await generateSalesInvoice\(/);
    expect(handler![0]).toMatch(/companyId:\s*scope\.companyId/);
    expect(handler![0]).toMatch(/branchId:\s*scope\.branchId/);
    expect(handler![0]).toMatch(/userId:\s*scope\.userId/);
  });

  it("POST /invoices/generate still fires BOTH the legacy + canonical events (catalog contract)", () => {
    const handler = CHILD.match(/router\.post\("\/invoices\/generate"[\s\S]*?\n\}\);/);
    expect(handler![0]).toMatch(/action: "umrah\.invoice\.generated"/);
    expect(handler![0]).toMatch(/action: "umrah\.sales_invoice\.created"/);
  });

  it("PATCH /invoices/:id is metadata-only — updates umrah_sales_invoices, never journal tables", () => {
    const handler = CHILD.match(/router\.patch\("\/invoices\/:id"[\s\S]*?\n\}\);/);
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/UPDATE\s+umrah_sales_invoices/);
    expect(handler![0]).not.toMatch(/journal_(entries|lines)/i);
  });

  it("child contains NO inline GL / journal posting (the engine boundary holds)", () => {
    expect(CHILD).not.toMatch(/createGuardedJournalEntry\s*\(|createJournalEntry\s*\(/);
    expect(CHILD).not.toMatch(/INSERT\s+INTO\s+journal_(entries|lines)/i);
    expect(CHILD).not.toMatch(/UPDATE\s+journal_(entries|lines)/i);
    expect(CHILD).not.toMatch(/DELETE\s+FROM\s+journal_(entries|lines)/i);
    expect(CHILD).not.toMatch(/getAccountCodeFromMapping/);
  });
});
