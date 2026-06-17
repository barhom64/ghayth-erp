/**
 * CIP (construction-in-progress) UI smoke.
 *
 * The CIP engine (finance-algorithms.ts: GET /finance/cip + capitalise) had no
 * page (FINANCE hidden-services). Pins page→route→nav and the capitalise wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance/cip.tsx"),
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

describe("CIP page — exists + wired to the engine", () => {
  it("default export CipPage", () => {
    expect(PAGE_SRC).toMatch(/export default function CipPage\(/);
  });
  it("lists GET /finance/cip and capitalises via POST /finance/cip/:id/capitalize", () => {
    expect(PAGE_SRC).toMatch(/`\/finance\/cip\$\{scopeSuffix\}`/);
    expect(PAGE_SRC).toMatch(/\/finance\/cip\/\$\{body\.id\}\/capitalize/);
    expect(PAGE_SRC).toMatch(/capitalizationDate: todayLocal\(\)/);
  });
  it("creates a project (POST /finance/cip) and adds cost lines (POST .../:id/costs)", () => {
    expect(PAGE_SRC).toMatch(/useApiMutation<\{ data: unknown \}, Record<string, unknown>>\(\s*"\/finance\/cip"/);
    expect(PAGE_SRC).toMatch(/\/finance\/cip\/\$\{body\.cipId\}\/costs/);
  });
  it("registered in router + nav", () => {
    expect(ROUTES_SRC).toMatch(/const Cip = lazy\(\(\) => import\("@\/pages\/finance\/cip"\)\)/);
    expect(ROUTES_SRC).toMatch(/\{ path: "\/finance\/cip", component: Cip \}/);
    expect(NAV_SRC).toMatch(/label: "الأعمال الرأسمالية \(CIP\)", path: "\/finance\/cip"/);
  });
});
