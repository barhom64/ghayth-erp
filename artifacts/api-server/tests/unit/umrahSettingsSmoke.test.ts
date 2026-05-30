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
    // empty state, not a 500.
    expect(ROUTE).toMatch(/res\.json\(row \?\? \{\s*nuskSupplierId: null,\s*nuskSupplierName: null,\s*nuskSupplierCode: null\s*\}\)/);
  });
});

describe("PATCH /umrah/settings — write", () => {
  it("registers under feature: umrah, action: update (writes are gated)", () => {
    expect(ROUTE).toMatch(/router\.patch\("\/settings",\s*authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"update"\s*\}\)/);
  });

  it("zod schema treats '' and undefined as null (matches PR #1428 pattern)", () => {
    expect(ROUTE).toMatch(/umrahSettingsPatchSchema = z\.object/);
    expect(ROUTE).toMatch(/nuskSupplierId: z\.preprocess/);
    expect(ROUTE).toMatch(/v === "" \|\| v === undefined \? null : v/);
  });

  it("validates the supplier belongs to THIS company before saving (defence-in-depth)", () => {
    // A cross-tenant id must not be silently accepted via API.
    expect(ROUTE).toMatch(/SELECT id FROM suppliers\s+WHERE id=\$1 AND "companyId"=\$2/);
    expect(ROUTE).toMatch(/throw new ValidationError\(`المورد رقم \$\{b\.nuskSupplierId\} غير موجود`/);
  });

  it("writes via single-statement UPDATE on companies (no migration here)", () => {
    expect(ROUTE).toMatch(/UPDATE companies SET "nuskSupplierId" = \$1 WHERE id = \$2/);
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
    expect(PAGE).toMatch(/const dirty = selectedSupplierId !== \(settings\?\.nuskSupplierId/);
    expect(PAGE).toMatch(/disabled=\{!dirty \|\| saving\}/);
  });

  it("shows a warning banner when nuskSupplierId is still unset", () => {
    expect(PAGE).toMatch(/settings\?\.nuskSupplierId == null && \(/);
    expect(PAGE).toContain("لم يتم تحديد مورد NUSK");
  });

  it("empty selection maps to null on save (clears the link)", () => {
    expect(PAGE).toMatch(/nuskSupplierId: selectedSupplierId === "" \? null : Number\(selectedSupplierId\)/);
  });
});
