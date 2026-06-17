/**
 * Classification-center UI smoke (#2197).
 *
 * The accounting-engine classification center (summary + analytic-accounts +
 * posting-failures worklists) had no page (FINANCE hidden-services). v1 is the
 * read surface; pins page→route→nav and the three GETs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance/classification-center.tsx"),
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

describe("Classification-center page — exists + wired", () => {
  it("default export ClassificationCenterPage", () => {
    expect(PAGE_SRC).toMatch(/export default function ClassificationCenterPage\(/);
  });
  it("reads summary + both worklists", () => {
    expect(PAGE_SRC).toMatch(/`\/finance\/classification-center\$\{scopeSuffix\}`/);
    expect(PAGE_SRC).toMatch(/\/finance\/classification-center\/analytic-accounts\?status=needs_linking/);
    expect(PAGE_SRC).toMatch(/\/finance\/classification-center\/posting-failures/);
  });
  it("registered in router + nav", () => {
    expect(ROUTES_SRC).toMatch(/const ClassificationCenter = lazy\(\(\) => import\("@\/pages\/finance\/classification-center"\)\)/);
    expect(ROUTES_SRC).toMatch(/\{ path: "\/finance\/classification-center", component: ClassificationCenter \}/);
    expect(NAV_SRC).toMatch(/label: "مركز التصنيف", path: "\/finance\/classification-center"/);
  });
});
