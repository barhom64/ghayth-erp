/**
 * PR-3 / #2163 — Canonical Ownership for Cross-Module Duplicates.
 *
 * The audit (#2166 PR-0 §4) listed 4 duplicates that needed an owner
 * decision. Product-owner ruling (#2179 comment): canonical follows
 * BUSINESS OWNERSHIP, not file location. PR-3 implements:
 *
 *   1. /admin/attendance-categories → wouter <Redirect> to /hr/attendance-categories
 *      (canonical = HR; admin had no business owning attendance policy)
 *
 *   2. /admin/scoring-weights → wouter <Redirect> to /hr/scoring-weights
 *      (canonical = HR; weights drive evaluation/promotion/penalties)
 *
 *   3. /finance/vendors/create + /warehouse/suppliers/create — kept
 *      BOTH canonical with a wrapper-split: a shared form body
 *      (components/shared/vendor-party-form.tsx) consumed by two thin
 *      wrappers — FinanceVendorCreate (WHT-aware, POST /finance/vendors)
 *      and WarehouseSupplierCreate (no WHT, POST /warehouse/suppliers).
 *      Same Party Master table, different domain wrappers.
 *
 *   4. /guide/properties → wouter <Redirect> to /properties/guide
 *      (canonical = Properties; /guide/* was a legacy alias)
 *
 * This pin keeps the regressions trapped:
 *   - The legacy paths must NOT bind a live page component anymore.
 *   - The HR canonicals must keep using the actual HR-policy page.
 *   - The vendor/supplier routes must point to DIFFERENT components
 *     (regression trap: a future PR re-binding both to the finance
 *     page would erase the wrapper split).
 *   - The shared form must accept an `intent` config (otherwise the
 *     two wrappers would re-fork into copy-paste).
 *   - The Party Master fact stays: both wrappers' backends still INSERT
 *     INTO suppliers (no duplicate identity for the same party).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const FE = join(REPO_ROOT, "artifacts/ghayth-erp/src");

const ADMIN_ROUTES = readFileSync(join(FE, "routes/adminRoutes.tsx"), "utf8");
const HR_ROUTES    = readFileSync(join(FE, "routes/hrRoutes.tsx"), "utf8");
const MISC_ROUTES  = readFileSync(join(FE, "routes/miscRoutes.tsx"), "utf8");
const FIN_ROUTES   = readFileSync(join(FE, "routes/financeRoutes.tsx"), "utf8");
const PROP_ROUTES  = readFileSync(join(FE, "routes/propertyRoutes.tsx"), "utf8");
const REDIR_TO     = readFileSync(join(FE, "components/shared/redirect-to.tsx"), "utf8");
const FORM         = readFileSync(join(FE, "components/shared/vendor-party-form.tsx"), "utf8");
const FIN_VENDOR   = readFileSync(join(FE, "pages/create/finance/vendors-create.tsx"), "utf8");
const WH_SUPPLIER  = readFileSync(join(FE, "pages/create/warehouse/suppliers-create.tsx"), "utf8");

describe("PR-3 (#2163) — RedirectTo helper exists + uses wouter Redirect", () => {
  it("redirectTo() factory returns a wouter <Redirect /> component", () => {
    expect(REDIR_TO).toMatch(/import\s+\{\s*Redirect\s*\}\s+from\s+"wouter"/);
    expect(REDIR_TO).toMatch(/export\s+function\s+redirectTo\(target:\s*string\)/);
    expect(REDIR_TO).toMatch(/<Redirect\s+to=\{target\}\s*\/>/);
  });
});

describe("PR-3 (#2163) — admin → HR redirects (canonical = HR business)", () => {
  it("/admin/attendance-categories binds the redirect wrapper, NOT a live page", () => {
    expect(ADMIN_ROUTES).toMatch(/RedirectToHrAttendanceCategories\s*=\s*redirectTo\("\/hr\/attendance-categories"\)/);
    expect(ADMIN_ROUTES).toMatch(
      /path:\s*"\/admin\/attendance-categories",\s*component:\s*RedirectToHrAttendanceCategories/,
    );
    // The legacy admin path no longer imports the live page (regression
    // trap: a future PR reintroducing the AdminAttendanceCategories
    // lazy import re-establishes dual ownership).
    expect(ADMIN_ROUTES).not.toMatch(/AdminAttendanceCategories\s*=\s*lazy/);
  });

  it("/admin/scoring-weights binds the redirect wrapper, NOT a live page", () => {
    expect(ADMIN_ROUTES).toMatch(/RedirectToHrScoringWeights\s*=\s*redirectTo\("\/hr\/scoring-weights"\)/);
    expect(ADMIN_ROUTES).toMatch(
      /path:\s*"\/admin\/scoring-weights",\s*component:\s*RedirectToHrScoringWeights/,
    );
    expect(ADMIN_ROUTES).not.toMatch(/AdminScoringWeights\s*=\s*lazy/);
  });

  it("/hr/attendance-categories + /hr/scoring-weights still bind the live HR-policy pages", () => {
    expect(HR_ROUTES).toMatch(
      /path:\s*"\/hr\/attendance-categories",\s*component:\s*AttendanceCategoriesHr/,
    );
    expect(HR_ROUTES).toMatch(
      /path:\s*"\/hr\/scoring-weights",\s*component:\s*ScoringWeightsHr/,
    );
  });
});

describe("PR-3 (#2163) — properties guide canonical + legacy redirect", () => {
  it("/properties/guide binds the live page (canonical owner = Properties)", () => {
    expect(PROP_ROUTES).toMatch(
      /path:\s*"\/properties\/guide",\s*component:\s*PropertiesGuide/,
    );
  });
  it("/guide/properties is now wouter <Redirect> to /properties/guide", () => {
    expect(PROP_ROUTES).toMatch(
      /path:\s*"\/guide\/properties",\s*component:\s*redirectTo\("\/properties\/guide"\)/,
    );
  });
});

describe("PR-3 (#2163) — vendor/supplier wrapper-split", () => {
  it("a shared form body lives at components/shared/vendor-party-form.tsx", () => {
    expect(existsSync(join(FE, "components/shared/vendor-party-form.tsx"))).toBe(true);
    expect(FORM).toMatch(/export\s+(interface|type)\s+VendorPartyFormIntent/);
    expect(FORM).toMatch(/export\s+default\s+function\s+VendorPartyForm\(\{\s*intent\s*\}/);
    // Intent shape carries per-domain config.
    for (const field of ["title", "backPath", "postUrl", "draftKey", "showWht", "invalidateKeys"]) {
      expect(FORM, `intent.${field} pin`).toMatch(new RegExp(`${field}\\s*:`));
    }
    // WHT block hides on showWht=false (regression trap: re-adding
    // unconditional WHT rendering would push WHT into the warehouse
    // path again).
    expect(FORM).toMatch(/intent\.showWht\s+&&/);
  });

  it("FinanceVendorCreate wraps the form with finance intent (POST /finance/vendors, WHT shown)", () => {
    expect(FIN_VENDOR).toMatch(/from\s+"@\/components\/shared\/vendor-party-form"/);
    expect(FIN_VENDOR).toMatch(/postUrl:\s*"\/finance\/vendors"/);
    expect(FIN_VENDOR).toMatch(/showWht:\s*true/);
    expect(FIN_VENDOR).toMatch(/draftKey:\s*"finance_vendors_create"/);
    expect(FIN_VENDOR).toMatch(/invalidateKeys:\s*\[\["vendors"\]\]/);
    expect(FIN_VENDOR).toMatch(/backPath:\s*"\/finance\/vendors"/);
  });

  it("WarehouseSupplierCreate wraps the form with warehouse intent (POST /warehouse/suppliers, WHT hidden)", () => {
    expect(WH_SUPPLIER).toMatch(/from\s+"@\/components\/shared\/vendor-party-form"/);
    expect(WH_SUPPLIER).toMatch(/postUrl:\s*"\/warehouse\/suppliers"/);
    expect(WH_SUPPLIER).toMatch(/showWht:\s*false/);
    expect(WH_SUPPLIER).toMatch(/draftKey:\s*"warehouse_suppliers_create"/);
    expect(WH_SUPPLIER).toMatch(/invalidateKeys:\s*\[\["suppliers"\]\]/);
    expect(WH_SUPPLIER).toMatch(/backPath:\s*"\/warehouse\/suppliers"/);
  });

  it("the two routes point at DIFFERENT page components (no re-merge)", () => {
    expect(FIN_ROUTES).toMatch(
      /VendorsCreate\s*=\s*lazy\(\(\)\s*=>\s*import\("@\/pages\/create\/finance\/vendors-create"\)\)/,
    );
    expect(MISC_ROUTES).toMatch(
      /WarehouseSuppliersCreate\s*=\s*lazy\(\(\)\s*=>\s*import\("@\/pages\/create\/warehouse\/suppliers-create"\)\)/,
    );
    // Regression trap: the warehouse route MUST NOT re-import the
    // finance vendor page.
    expect(MISC_ROUTES).not.toMatch(
      /WarehouseSuppliersCreate\s*=\s*lazy\(\(\)\s*=>\s*import\("@\/pages\/create\/finance\/vendors-create"\)\)/,
    );
  });
});

describe("PR-3 (#2163) — Party Master invariant survives the wrapper split", () => {
  it("warehouse.ts /suppliers POST still INSERTs into the shared suppliers table", () => {
    const wh = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/warehouse.ts"), "utf8");
    expect(wh).toMatch(/router\.post\("\/suppliers"[\s\S]{0,200}authorize\(\{\s*feature:\s*"warehouse\.inventory"/);
    expect(wh).toMatch(/INSERT INTO suppliers/);
  });
  it("finance-vendors.ts /vendors POST still INSERTs into the same suppliers table", () => {
    const fv = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/finance-vendors.ts"), "utf8");
    expect(fv).toMatch(/INSERT INTO suppliers/);
  });
});
