/**
 * Subsidiary-account-provisioning failures UI smoke.
 *
 * The accounting-engine retry queue (GET /finance/subsidiary-account-failures +
 * POST .../:id/retry) had no page (FINANCE hidden-services). Pins page→route→nav.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance/subsidiary-account-failures.tsx"),
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

describe("Subsidiary-failures page — exists + wired to the engine", () => {
  it("default export SubsidiaryAccountFailuresPage", () => {
    expect(PAGE_SRC).toMatch(/export default function SubsidiaryAccountFailuresPage\(/);
  });
  it("lists GET /finance/subsidiary-account-failures and retries via POST .../:id/retry", () => {
    expect(PAGE_SRC).toMatch(/\/finance\/subsidiary-account-failures/);
    expect(PAGE_SRC).toMatch(/subsidiary-account-failures\/\$\{body\.id\}\/retry/);
    expect(PAGE_SRC).toMatch(/"POST"/);
  });
  it("registered in router + nav", () => {
    expect(ROUTES_SRC).toMatch(/const SubsidiaryAccountFailures = lazy\(\(\) => import\("@\/pages\/finance\/subsidiary-account-failures"\)\)/);
    expect(ROUTES_SRC).toMatch(/\{ path: "\/finance\/subsidiary-account-failures", component: SubsidiaryAccountFailures \}/);
    expect(NAV_SRC).toMatch(/label: "فشل الحسابات الفرعية", path: "\/finance\/subsidiary-account-failures"/);
  });
});
