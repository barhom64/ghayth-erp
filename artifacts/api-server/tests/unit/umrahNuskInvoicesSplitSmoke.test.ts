import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 19 — umrah-entities.ts split smoke (nusk invoices) — LEDGER-GRADE.
 *
 * Scope:
 *   - Carves the 5 nusk-invoice routes into a dedicated sub-router:
 *       artifacts/api-server/src/routes/umrah-nusk-invoices.ts
 *       GET    /nusk-invoices
 *       GET    /nusk-invoices/:id
 *       POST   /nusk-invoices        (withTransaction + postNuskJournalEntries)
 *       PATCH  /nusk-invoices/:id     (withTransaction + postNuskJournalEntries)
 *       DELETE /nusk-invoices/:id
 *   - Parent mounts the sub-router via `router.use(nuskInvoicesRouter)` so the
 *     API surface stays identical (paths still resolve at /umrah/nusk-invoices).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch — postNuskJournalEntries (lib/umrahImportEngine.ts) is NOT
 *     modified; this is a pure route move.
 *   - No route-body change beyond the IGOC audit-helper conversion.
 *   - No API surface change.
 *   - No change to the AP / refund journal contract.
 *
 * §F is the ledger guard: it pins that the AP-posting engine invocation is
 * preserved byte-for-byte inside withTransaction on BOTH the create and update
 * paths, with the idempotency guards intact — so the carve cannot silently drop
 * or alter a journal posting.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-nusk-invoices.ts"),
  "utf8",
);
const ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahImportEngine.ts"),
  "utf8",
);

const ROUTES: [string, string][] = [
  ["get", "/nusk-invoices"],
  ["get", "/nusk-invoices/:id"],
  ["post", "/nusk-invoices"],
  ["patch", "/nusk-invoices/:id"],
  ["delete", "/nusk-invoices/:id"],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file exists + exports a Router as default
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 19 §A — umrah-nusk-invoices.ts is a valid sub-router file", () => {
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
describe("U-07 Phase 19 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(/import\s+nuskInvoicesRouter\s+from\s+["']\.\/umrah-nusk-invoices\.js["']/);
  });

  it("parent mounts the sub-router with router.use(nuskInvoicesRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*nuskInvoicesRouter\s*\)/);
  });

  it("parent no longer imports postNuskJournalEntries (moved with the routes)", () => {
    expect(PARENT).not.toMatch(/import\s*\{[^}]*postNuskJournalEntries[^}]*\}\s*from/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 5 routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 19 §C — all 5 moved routes are present in the child", () => {
  for (const [method, route] of ROUTES) {
    it(`child declares router.${method}("${route}", ...)`, () => {
      expect(CHILD).toMatch(new RegExp(`router\\.${method}\\(\\s*["']${esc(route)}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — The same routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 19 §D — parent no longer declares the moved routes", () => {
  for (const [method, route] of ROUTES) {
    it(`parent does NOT declare router.${method}("${route}", ...)`, () => {
      expect(PARENT).not.toMatch(new RegExp(`router\\.${method}\\(\\s*["']${esc(route)}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Parent file shrunk (regression-prevent floor)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 19 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 1100 lines (was ~1301 before this carve, ~1087 after)", () => {
    expect(PARENT.split("\n").length).toBeLessThan(1100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §F — LEDGER CONTRACT: the AP-posting engine invocation is preserved verbatim
//      inside withTransaction on BOTH create + update paths, with idempotency
//      guards intact, and the engine itself is untouched.
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 19 §F — nusk AP journal contract is preserved by the carve", () => {
  it("the engine still exports postNuskJournalEntries (not modified by this carve)", () => {
    expect(ENGINE).toMatch(/export\s+async\s+function\s+postNuskJournalEntries\s*\(/);
  });

  it("child imports postNuskJournalEntries from the engine (not a re-implementation)", () => {
    expect(CHILD).toMatch(
      /import\s*\{\s*postNuskJournalEntries\s*\}\s*from\s+["']\.\.\/lib\/umrahImportEngine\.js["']/,
    );
  });

  it("POST handler posts the AP entry inside a single withTransaction", () => {
    const handler = CHILD.match(/router\.post\("\/nusk-invoices"[\s\S]*?\n\}\);/);
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/withTransaction\(async \(client\) =>/);
    expect(handler![0]).toMatch(/await postNuskJournalEntries\(\s*client,/);
    // create path posts a fresh entry — no existing JE ids.
    expect(handler![0]).toMatch(/existingApJeId:\s*null/);
    expect(handler![0]).toMatch(/existingRefundJeId:\s*null/);
  });

  it("PATCH handler re-evaluates the AP/refund entries inside withTransaction with idempotency guards", () => {
    const handler = CHILD.match(/router\.patch\("\/nusk-invoices\/:id"[\s\S]*?\n\}\);/);
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/withTransaction\(async \(client\) =>/);
    expect(handler![0]).toMatch(/await postNuskJournalEntries\(\s*client,/);
    // update path passes the existing JE ids so the engine stays idempotent.
    expect(handler![0]).toMatch(/existingApJeId:\s*row\.purchaseInvoiceId\s*\?\?\s*null/);
    expect(handler![0]).toMatch(/existingRefundJeId:\s*row\.journalEntryId\s*\?\?\s*null/);
  });

  it("both engine invocations pass the same tenant context shape", () => {
    const calls = CHILD.match(/postNuskJournalEntries\(\s*client,\s*\{[^}]*\}/g);
    expect(calls).not.toBeNull();
    expect(calls!.length).toBe(2);
    for (const c of calls!) {
      expect(c).toMatch(/companyId:\s*scope\.companyId/);
      expect(c).toMatch(/branchId:\s*scope\.branchId\s*\|\|\s*0/);
      expect(c).toMatch(/userId:\s*scope\.userId/);
      expect(c).toMatch(/seasonId:\s*0/);
    }
  });

  it("the paid-invoice mutation guards are preserved (no silent ledger bypass)", () => {
    expect(CHILD).toContain("لا يمكن تعديل فاتورة نسك مدفوعة");
    expect(CHILD).toContain("لا يمكن حذف فاتورة نسك مدفوعة");
  });
});
