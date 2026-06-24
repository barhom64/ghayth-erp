/**
 * Misparented-subsidiaries datafix UI smoke (#2090, READ-ONLY).
 *
 * The report-only inventory (GET /finance/datafix/misparented-subsidiaries) had
 * no page (FINANCE hidden-services). Pins page→route→nav. The page must stay
 * read-only — no mutation endpoint exists by owner-approved scope.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance/misparented-subsidiaries.tsx"),
  "utf8",
);
const ROUTES_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/financeRoutes.tsx"),
  "utf8",
);
const NAV_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

describe("Misparented-subsidiaries page — exists, read-only, wired", () => {
  it("default export MisparentedSubsidiariesPage", () => {
    expect(PAGE_SRC).toMatch(/export default function MisparentedSubsidiariesPage\(/);
  });
  it("reads the report endpoint", () => {
    expect(PAGE_SRC).toMatch(/\/finance\/datafix\/misparented-subsidiaries/);
  });
  it("stays READ-ONLY — no mutation hook", () => {
    expect(PAGE_SRC).not.toMatch(/useApiMutation/);
  });
  it("registered in router + nav", () => {
    expect(ROUTES_SRC).toMatch(/const MisparentedSubsidiaries = lazy\(\(\) => import\("@\/pages\/finance\/misparented-subsidiaries"\)\)/);
    expect(ROUTES_SRC).toMatch(/\{ path: "\/finance\/datafix\/misparented-subsidiaries", component: MisparentedSubsidiaries \}/);
    expect(NAV_SRC).toMatch(/label: "تشخيص أبوّة الحسابات", path: "\/finance\/datafix\/misparented-subsidiaries"/);
  });
});
