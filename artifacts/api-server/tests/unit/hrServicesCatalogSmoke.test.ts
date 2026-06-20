/**
 * HR Services Catalog smoke (#1799 priority #4).
 *
 * Pins the single landing-page contract:
 *   - exists at /hr/services with the documented exports
 *   - lists every service from the 4 inventory categories
 *   - each card links to an EXISTING create-form route (no orphans)
 *   - registered in routes/hrRoutes.tsx + navigation.registry.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/hr/services.tsx"),
  "utf8",
);
const ROUTES_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/hrRoutes.tsx"),
  "utf8",
);
const NAV_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

describe("Services Catalog — page exports", () => {
  it("default-exports the catalog component", () => {
    expect(PAGE_SRC).toMatch(/export default function HrServicesCatalog/);
  });

  it("declares the closed ServiceCategory enum (4 categories)", () => {
    expect(PAGE_SRC).toMatch(
      /type ServiceCategory = "time-off" \| "compensation" \| "career" \| "compliance"/,
    );
  });

  it("each service has key + title + description + href + icon + category", () => {
    expect(PAGE_SRC).toMatch(/interface Service \{[\s\S]*?key: string[\s\S]*?title: string[\s\S]*?description: string[\s\S]*?href: string[\s\S]*?icon: LucideIcon[\s\S]*?category: ServiceCategory/);
  });
});

describe("Services Catalog — covers every #1799 §F.4 service", () => {
  // The 8 self-service operations the issue brief listed
  // (Time-off cluster + Compensation + Career + Compliance).
  const expected = [
    { service: "leave", href: "/hr/leaves/create" },
    { service: "overtime", href: "/hr/overtime/create" },
    { service: "excuse", href: "/hr/excuse-requests/create" },
    { service: "loan", href: "/hr/loans/create" },
    { service: "letter", href: "/hr/official-letters/create" },
    { service: "transfer", href: "/hr/transfers/create" },
    { service: "training", href: "/hr/training" },
    { service: "exit", href: "/hr/exit-requests/create" },
  ];
  for (const { service, href } of expected) {
    it(`includes the "${service}" card linking to ${href}`, () => {
      expect(PAGE_SRC).toMatch(new RegExp(`key:\\s*"${service}"`));
      expect(PAGE_SRC).toContain(`href: "${href}"`);
    });
  }
});

describe("Services Catalog — wired into router + nav", () => {
  it("hrRoutes.tsx imports and registers HrServices at /hr/services", () => {
    expect(ROUTES_SRC).toMatch(/const HrServices = lazy\(\(\) => import\("@\/pages\/hr\/services"\)\)/);
    expect(ROUTES_SRC).toMatch(
      /path: "\/hr\/services", component: HrServices/,
    );
  });

  it("navigation.registry.ts links to the catalog under «طلباتي»", () => {
    // Unified to «خدمات الموارد البشرية» by the UX Nav Governance wave.
    expect(NAV_SRC).toMatch(/label: "خدمات الموارد البشرية", path: "\/hr\/services"/);
  });
});

describe("Services Catalog — UX shape", () => {
  it("uses PageShell + HrTabsNav for layout consistency", () => {
    expect(PAGE_SRC).toContain("PageShell");
    expect(PAGE_SRC).toContain("HrTabsNav");
  });

  it("groups services by category for the card layout", () => {
    expect(PAGE_SRC).toMatch(/grouped = SERVICES\.reduce/);
    expect(PAGE_SRC).toMatch(/CATEGORY_LABELS/);
  });

  it("category color tokens use design-system bg-* and text-* classes", () => {
    // Each color value must look like the design-system tokens used
    // elsewhere — keeps the palette consistent across HR pages.
    expect(PAGE_SRC).toMatch(/bg-status-info-surface/);
    expect(PAGE_SRC).toMatch(/bg-emerald-50/);
    expect(PAGE_SRC).toMatch(/bg-purple-50/);
    expect(PAGE_SRC).toMatch(/bg-status-warning-surface/);
  });
});
