/**
 * Insurance-premium UI smoke (finance-insurance.ts).
 *
 * The insurance engine OPENS a prepaid premium + amortization schedule via
 * POST /finance/insurance/premium but had no page (FINANCE hidden-services).
 * Pins page→route→nav and the engine-verified default account purposes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance/insurance-premium.tsx"),
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

describe("Insurance-premium page — exists + wired", () => {
  it("default export InsurancePremiumPage", () => {
    expect(PAGE_SRC).toMatch(/export default function InsurancePremiumPage\(/);
  });
  it("posts the generic premium endpoint", () => {
    expect(PAGE_SRC).toMatch(/"\/finance\/insurance\/premium"/);
    expect(PAGE_SRC).toMatch(/"POST"/);
  });
  it("defaults the engine-valid account purposes", () => {
    expect(PAGE_SRC).toMatch(/fleet_prepaid_insurance/);
    expect(PAGE_SRC).toMatch(/general_expense/);
    expect(PAGE_SRC).toMatch(/fleet_cash_source/);
  });
  it("uses entity pickers for the vendor + medical insured party", () => {
    expect(PAGE_SRC).toMatch(/import \{ VendorSelect, EmployeeSelect \} from "@\/components\/shared\/entity-selects"/);
    expect(PAGE_SRC).toMatch(/<VendorSelect/);
    expect(PAGE_SRC).toMatch(/<EmployeeSelect/);
  });
  it("registered in router + nav", () => {
    expect(ROUTES_SRC).toMatch(/const InsurancePremium = lazy\(\(\) => import\("@\/pages\/finance\/insurance-premium"\)\)/);
    expect(ROUTES_SRC).toMatch(/\{ path: "\/finance\/insurance", component: InsurancePremium \}/);
    expect(NAV_SRC).toMatch(/label: "تسجيل قسط تأمين", path: "\/finance\/insurance"/);
  });
});
