import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 20 — umrah-entities.ts split smoke (payments + reclassify) — LEDGER-GRADE.
 *
 * Scope:
 *   - Carves the 3 finance routes into a dedicated sub-router:
 *       artifacts/api-server/src/routes/umrah-payments.ts
 *       GET  /payments
 *       POST /payments              (registerPayment engine)
 *       POST /reclassify-revenue     (reclassifyRevenueForInvoices engine)
 *   - Parent mounts the sub-router via `router.use(paymentsRouter)` so the API
 *     surface stays identical (paths still resolve at /umrah/payments and
 *     /umrah/reclassify-revenue).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch — registerPayment (lib/umrahInvoicingEngine.ts) and
 *     reclassifyRevenueForInvoices (lib/umrahReclassifyEngine.ts) are NOT
 *     modified; this is a pure route move.
 *   - No route-body change beyond the IGOC audit-helper conversion.
 *   - No API surface change. No change to the payment / reclassification GL
 *     contract.
 *
 * §F is the ledger guard: it pins that BOTH finance routes stay thin invokers of
 * their engines (no inline GL / journal SQL leaked into the route during the
 * move), so the carve cannot smuggle posting logic out of the engine boundary.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-payments.ts"),
  "utf8",
);
const PAY_ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);
const RECLASS_ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahReclassifyEngine.ts"),
  "utf8",
);

const ROUTES: [string, string][] = [
  ["get", "/payments"],
  ["post", "/payments"],
  ["post", "/reclassify-revenue"],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file exists + exports a Router as default
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 20 §A — umrah-payments.ts is a valid sub-router file", () => {
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
describe("U-07 Phase 20 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(/import\s+paymentsRouter\s+from\s+["']\.\/umrah-payments\.js["']/);
  });

  it("parent mounts the sub-router with router.use(paymentsRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*paymentsRouter\s*\)/);
  });

  it("parent no longer imports registerPayment / reclassifyRevenueForInvoices (moved with the routes)", () => {
    // The explanatory mount comment names the engines; the guard is that the
    // parent no longer *imports* or *calls* them — that logic moved to the child.
    expect(PARENT).not.toMatch(/import\s*\{[^}]*\bregisterPayment\b[^}]*\}\s*from/);
    expect(PARENT).not.toMatch(/import\s*\{[^}]*reclassifyRevenueForInvoices[^}]*\}\s*from/);
    expect(PARENT).not.toMatch(/await\s+registerPayment\s*\(/);
    expect(PARENT).not.toMatch(/await\s+reclassifyRevenueForInvoices\s*\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 3 routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 20 §C — all 3 moved routes are present in the child", () => {
  for (const [method, route] of ROUTES) {
    it(`child declares router.${method}("${route}", ...)`, () => {
      expect(CHILD).toMatch(new RegExp(`router\\.${method}\\(\\s*["']${esc(route)}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — The same routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 20 §D — parent no longer declares the moved routes", () => {
  for (const [method, route] of ROUTES) {
    it(`parent does NOT declare router.${method}("${route}", ...)`, () => {
      expect(PARENT).not.toMatch(new RegExp(`router\\.${method}\\(\\s*["']${esc(route)}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Parent file shrunk (regression-prevent floor)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 20 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 1000 lines (was ~1087 before this carve, ~977 after)", () => {
    expect(PARENT.split("\n").length).toBeLessThan(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §F — LEDGER CONTRACT: both finance routes stay thin engine invokers; the GL /
//      posting logic remains inside the engines, which are untouched.
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 20 §F — payment + reclassify GL contracts preserved by the carve", () => {
  it("the engines still export their posting functions (not modified by this carve)", () => {
    expect(PAY_ENGINE).toMatch(/export\s+(async\s+)?function\s+registerPayment\s*\(/);
    expect(RECLASS_ENGINE).toMatch(/export\s+(async\s+)?function\s+reclassifyRevenueForInvoices\s*\(/);
  });

  it("child imports both engine functions (not a re-implementation)", () => {
    expect(CHILD).toMatch(/import\s*\{\s*registerPayment\s*\}\s*from\s+["']\.\.\/lib\/umrahInvoicingEngine\.js["']/);
    expect(CHILD).toMatch(/import\s*\{\s*reclassifyRevenueForInvoices\s*\}\s*from\s+["']\.\.\/lib\/umrahReclassifyEngine\.js["']/);
  });

  it("POST /payments delegates to registerPayment with the tenant context (no inline posting)", () => {
    const handler = CHILD.match(/router\.post\("\/payments"[\s\S]*?\n\}\);/);
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/await registerPayment\(/);
    expect(handler![0]).toMatch(/companyId:\s*scope\.companyId/);
    expect(handler![0]).toMatch(/branchId:\s*scope\.branchId/);
    expect(handler![0]).toMatch(/userId:\s*scope\.userId/);
  });

  it("POST /reclassify-revenue delegates to reclassifyRevenueForInvoices(scope, body) — no inline GL", () => {
    const handler = CHILD.match(/router\.post\("\/reclassify-revenue"[\s\S]*?\n\}\);/);
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/const result = await reclassifyRevenueForInvoices\(scope, body\)/);
  });

  it("child contains NO inline GL / journal posting (the engine boundary holds)", () => {
    expect(CHILD).not.toMatch(/createGuardedJournalEntry\s*\(|createJournalEntry\s*\(/);
    expect(CHILD).not.toMatch(/INSERT\s+INTO\s+journal_(entries|lines)/i);
    expect(CHILD).not.toMatch(/UPDATE\s+journal_(entries|lines)/i);
    expect(CHILD).not.toMatch(/DELETE\s+FROM\s+journal_(entries|lines)/i);
  });
});
