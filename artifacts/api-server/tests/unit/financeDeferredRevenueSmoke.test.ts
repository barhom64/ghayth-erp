/**
 * FIN-TIME-SPREADING (#2247) — deferred-revenue UI smoke.
 *
 * Mirror of financeAmortizationSmoke: the deferred-revenue engine
 * (routes/finance-deferred-revenue.ts + deferredRevenueEngine.ts) shipped with
 * no page even though periodCloseCoordinator requires the run endpoint before a
 * period can close. Pins the page → route → nav wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance/deferred-revenue.tsx"),
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

describe("Deferred-revenue page — exists + talks to the real engine", () => {
  it("default export DeferredRevenuePage", () => {
    expect(PAGE_SRC).toMatch(/export default function DeferredRevenuePage\(/);
  });
  it("lists schedules from GET /finance/deferred-revenue/schedules", () => {
    expect(PAGE_SRC).toMatch(/\/finance\/deferred-revenue\/schedules/);
  });
  it("exposes the due-run action via POST /finance/deferred-revenue/run", () => {
    expect(PAGE_SRC).toMatch(/"\/finance\/deferred-revenue\/run"/);
    expect(PAGE_SRC).toMatch(/"POST"/);
  });
});

describe("Deferred-revenue — wired into router + nav", () => {
  it("financeRoutes.tsx lazy-imports + registers the page", () => {
    expect(ROUTES_SRC).toMatch(/const DeferredRevenue = lazy\(\(\) => import\("@\/pages\/finance\/deferred-revenue"\)\)/);
    expect(ROUTES_SRC).toMatch(/\{ path: "\/finance\/deferred-revenue", component: DeferredRevenue \}/);
  });
  it("navigation.registry.ts links it under «اللوحات والإقفال»", () => {
    expect(NAV_SRC).toMatch(/label: "الإيراد المؤجل", path: "\/finance\/deferred-revenue"/);
  });
});
