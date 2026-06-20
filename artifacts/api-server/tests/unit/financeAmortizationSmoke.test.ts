/**
 * FIN-TIME-SPREADING (#2247) — prepaid-amortization UI smoke.
 *
 * The engine (routes/finance-amortization.ts + prepaidAmortizationEngine.ts)
 * shipped without any page, even though periodCloseCoordinator requires the
 * run endpoint before a period can close (CROSS_MODULE_DUPLICATION_AUDIT /
 * FINANCE hidden-services). This pins the new page → route → nav wiring so the
 * service can't silently lose its UI again.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance/amortization.tsx"),
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

describe("Amortization page — exists + talks to the real engine", () => {
  it("default export AmortizationPage", () => {
    expect(PAGE_SRC).toMatch(/export default function AmortizationPage\(/);
  });
  it("lists schedules from GET /finance/amortization/schedules", () => {
    expect(PAGE_SRC).toMatch(/\/finance\/amortization\/schedules/);
  });
  it("exposes the due-run action via POST /finance/amortization/run", () => {
    expect(PAGE_SRC).toMatch(/"\/finance\/amortization\/run"/);
    expect(PAGE_SRC).toMatch(/"POST"/);
  });
});

describe("Amortization — wired into router + nav", () => {
  it("financeRoutes.tsx lazy-imports + registers the page", () => {
    expect(ROUTES_SRC).toMatch(/const Amortization = lazy\(\(\) => import\("@\/pages\/finance\/amortization"\)\)/);
    expect(ROUTES_SRC).toMatch(/\{ path: "\/finance\/amortization", component: Amortization \}/);
  });
  it("navigation.registry.ts links it under «اللوحات والإقفال»", () => {
    expect(NAV_SRC).toMatch(/label: "إطفاء المصروفات المقدمة", path: "\/finance\/amortization"/);
  });
});
