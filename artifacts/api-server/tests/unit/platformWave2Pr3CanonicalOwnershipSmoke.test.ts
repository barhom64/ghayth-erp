/**
 * PR-3 (#2163) — Smoke pin: Canonical Ownership for Cross-Module Duplicates
 *
 * يحرس التكرارات الأربعة:
 * 1. attendance-categories: canonical = /hr/attendance-categories, admin = back-compat redirect
 * 2. scoring-weights: canonical = /hr/scoring-weights, admin = back-compat redirect
 * 3. vendors vs suppliers: wrapper split — لكل مسار صفحته وAPI الخاص
 * 4. properties/guide: canonical = /properties/guide, /guide/properties = redirect
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const FRONTEND  = join(REPO_ROOT, "artifacts/ghayth-erp/src");

function read(rel: string): string {
  return readFileSync(join(FRONTEND, rel), "utf-8");
}
function exists(rel: string): boolean {
  return existsSync(join(FRONTEND, rel));
}

describe("PR-3 — Canonical Ownership: attendance-categories", () => {
  it("HR canonical page exists at pages/hr/attendance-categories.tsx", () => {
    expect(exists("pages/hr/attendance-categories.tsx")).toBe(true);
  });

  it("admin/attendance-categories is a redirect shell (no PageShell)", () => {
    const content = read("pages/admin/attendance-categories.tsx");
    expect(content).toContain("setLocation");
    expect(content).toContain("/hr/attendance-categories");
    expect(content).not.toContain("PageShell");
  });

  it("hrRoutes imports from pages/hr/attendance-categories not pages/admin/", () => {
    const content = read("routes/hrRoutes.tsx");
    expect(content).toContain("pages/hr/attendance-categories");
    expect(content).not.toMatch(/import.*admin\/attendance-categories/);
  });
});

describe("PR-3 — Canonical Ownership: scoring-weights", () => {
  it("HR canonical page exists at pages/hr/scoring-weights.tsx", () => {
    expect(exists("pages/hr/scoring-weights.tsx")).toBe(true);
  });

  it("admin/scoring-weights is a redirect shell (no PageShell)", () => {
    const content = read("pages/admin/scoring-weights.tsx");
    expect(content).toContain("setLocation");
    expect(content).toContain("/hr/scoring-weights");
    expect(content).not.toContain("PageShell");
  });

  it("hrRoutes imports from pages/hr/scoring-weights not pages/admin/", () => {
    const content = read("routes/hrRoutes.tsx");
    expect(content).toContain("pages/hr/scoring-weights");
    expect(content).not.toMatch(/import.*admin\/scoring-weights/);
  });
});

describe("PR-3 — Wrapper Split: vendors vs suppliers", () => {
  it("warehouse suppliers-create.tsx exists as independent page", () => {
    expect(exists("pages/create/warehouse/suppliers-create.tsx")).toBe(true);
  });

  it("warehouse suppliers-create calls /warehouse/suppliers, not /finance/vendors", () => {
    const content = read("pages/create/warehouse/suppliers-create.tsx");
    expect(content).toContain("/warehouse/suppliers");
    expect(content).not.toContain("/finance/vendors");
  });

  it("finance vendors-create still points to /finance/vendors (unchanged)", () => {
    const content = read("pages/create/finance/vendors-create.tsx");
    expect(content).toContain("/finance/vendors");
  });

  it("miscRoutes uses warehouse suppliers-create wrapper", () => {
    const content = read("routes/miscRoutes.tsx");
    expect(content).toContain("pages/create/warehouse/suppliers-create");
    expect(content).not.toMatch(/WarehouseSuppliersCreate.*finance\/vendors-create/);
  });
});

describe("PR-3 — Properties Guide Canonical", () => {
  it("guide-redirect page exists for /guide/properties", () => {
    expect(exists("pages/properties/guide-redirect.tsx")).toBe(true);
  });

  it("guide-redirect redirects to /properties/guide (no PageShell)", () => {
    const content = read("pages/properties/guide-redirect.tsx");
    expect(content).toContain("/properties/guide");
    expect(content).not.toContain("PageShell");
  });

  it("propertyRoutes uses redirect for /guide/properties", () => {
    const content = read("routes/propertyRoutes.tsx");
    expect(content).toContain("guide-redirect");
    expect(content).toContain('"/properties/guide"');
  });

  it("navigation.registry points to /properties/guide not /guide/properties", () => {
    const content = read("components/layout/navigation.registry.ts");
    expect(content).not.toContain('"/guide/properties"');
    expect(content).toContain('"/properties/guide"');
  });
});
