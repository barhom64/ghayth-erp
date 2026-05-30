import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the umrah settings page + endpoints — the UI bridge that
 * actually makes the migration-239 nuskSupplierId integration usable
 * without raw SQL.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/settings.tsx"),
  "utf8",
);
const ROUTES_INDEX = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);

describe("GET /umrah/settings — read", () => {
  it("registers under feature: umrah, action: view", () => {
    expect(ROUTE).toMatch(/router\.get\("\/settings",\s*authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"view"\s*\}\)/);
  });

  it("LEFT JOINs suppliers so the UI shows the name without a 2nd fetch", () => {
    expect(ROUTE).toMatch(/LEFT JOIN suppliers s[\s\S]{0,300}s\."companyId" = c\.id/);
    expect(ROUTE).toMatch(/s\."deletedAt" IS NULL/);
  });

  it("returns null placeholder when no setting exists yet", () => {
    // Operators opening the page on a fresh install must see a sane
    // empty state, not a 500. PR #1469 extended the null placeholder
    // with the 3 new product mapping fields — anchor on the first
    // 3 keys (nuskSupplier*) which remain the leading entries.
    expect(ROUTE).toMatch(/res\.json\(row \?\? \{[\s\S]{0,400}nuskSupplierId: null,\s*nuskSupplierName: null,\s*nuskSupplierCode: null/);
  });
});

describe("PATCH /umrah/settings — write", () => {
  it("registers under feature: umrah, action: update (writes are gated)", () => {
    expect(ROUTE).toMatch(/router\.patch\("\/settings",\s*authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"update"\s*\}\)/);
  });

  it("zod schema uses the shared nullableFkPreproc helper (PR #1469)", () => {
    // PR #1469 refactored the inline preprocess into a shared
    // helper `nullableFkPreproc` reused by all 4 settings FKs.
    // The new shape distinguishes "" (clear) from undefined
    // (preserve) so PATCH actually behaves like PATCH.
    expect(ROUTE).toMatch(/umrahSettingsPatchSchema = z\.object/);
    expect(ROUTE).toMatch(/nuskSupplierId: nullableFkPreproc/);
    expect(ROUTE).toMatch(/const nullableFkPreproc = z\.preprocess\(/);
  });

  it("validates the supplier belongs to THIS company before saving (defence-in-depth)", () => {
    // A cross-tenant id must not be silently accepted via API.
    expect(ROUTE).toMatch(/SELECT id FROM suppliers\s+WHERE id=\$1 AND "companyId"=\$2/);
    expect(ROUTE).toMatch(/throw new ValidationError\(`المورد رقم \$\{b\.nuskSupplierId\} غير موجود`/);
  });

  it("writes via single-statement UPDATE on companies (no migration here)", () => {
    // PR #1469 switched to a dynamic SET clause so PATCH semantics
    // are correct (omit=preserve, null=clear, value=update). The
    // single-statement form would clobber unrelated settings.
    expect(ROUTE).toMatch(/UPDATE companies SET \$\{sets\.join\(", "\)\} WHERE id = \$1/);
  });

  it("emits a settings.updated audit log", () => {
    expect(ROUTE).toMatch(/action:\s*"umrah\.settings\.updated"/);
  });
});

describe("settings page UI", () => {
  it("registered at /umrah/settings with the operations module gate", () => {
    expect(ROUTES_INDEX).toContain('UmrahSettings');
    expect(ROUTES_INDEX).toMatch(/path: "\/umrah\/settings", component: UmrahSettings, module: "operations"/);
  });

  it("save button is gated by umrah:update permission", () => {
    expect(PAGE).toContain('data-testid="umrah-settings-save"');
    expect(PAGE).toMatch(/<GuardedButton[\s\S]{0,400}perm="umrah:update"[\s\S]{0,400}data-testid="umrah-settings-save"/);
  });

  it("supplier picker has a stable data-testid for e2e", () => {
    expect(PAGE).toContain('data-testid="nusk-supplier-select"');
  });

  it("save button disabled when no change (dirty flag)", () => {
    // Without this, hitting Save on an unchanged form would PATCH
    // anyway and trigger a no-op audit log on every page visit.
    // PR #1470 extended the dirty check to span all 4 settings; pin
    // the leading clause + the gate on the save button so future
    // additions don't churn this assertion.
    expect(PAGE).toMatch(/const dirty =\s*[\s\S]{0,200}selectedSupplierId !==/);
    expect(PAGE).toMatch(/disabled=\{!dirty \|\| saving\}/);
  });

  it("shows a warning banner when nuskSupplierId is still unset", () => {
    expect(PAGE).toMatch(/settings\?\.nuskSupplierId == null && \(/);
    expect(PAGE).toContain("لم يتم تحديد مورد NUSK");
  });

  it("empty selection maps to null on save (clears the link)", () => {
    // PR #1470 refactored the inline `"" ? null : Number(v)` expr
    // into a shared toPatchValue helper used by all 4 fields. Pin
    // both the helper definition and that nuskSupplierId routes
    // through it (the contract — clearing on empty string — is
    // unchanged).
    expect(PAGE).toMatch(/const toPatchValue = \(v: string\): number \| null => \(v === "" \? null : Number\(v\)\)/);
    expect(PAGE).toMatch(/nuskSupplierId: toPatchValue\(selectedSupplierId\)/);
  });
});
