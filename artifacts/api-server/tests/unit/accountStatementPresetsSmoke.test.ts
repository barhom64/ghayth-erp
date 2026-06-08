import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Date-range preset chips wired into the shared account-statement
 * page. This page is the BASE for two routed wrappers — customer-
 * statement.tsx + vendor-statement.tsx — so a single integration
 * amplifies 2× across:
 *
 *   /clients/:id/statement              (customer)
 *   /finance/vendors/:id/statement       (vendor)
 *
 * Same boundary mapping as cost-center-pnl and profitability
 * (startDate/endDate ↔ from/to) so the shared component stays the
 * single source of truth for the preset windows.
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/account-statement.tsx"),
  "utf8",
);
const CUSTOMER_WRAPPER = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/customer-statement.tsx"),
  "utf8",
);
const VENDOR_WRAPPER = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/vendor-statement.tsx"),
  "utf8",
);

describe("account-statement page — date-range presets (2× amplification via wrappers)", () => {
  it("imports the shared DateRangePresets component", () => {
    expect(PAGE).toMatch(/import \{ DateRangePresets \} from "@\/components\/shared\/date-range-presets"/);
  });

  it("maps startDate/endDate into from/to at the boundary (no schema duplication)", () => {
    expect(PAGE).toMatch(/value=\{\{ from: startDate, to: endDate \}\}/);
    expect(PAGE).toMatch(/onChange=\{\(r\) => \{ setStartDate\(r\.from\); setEndDate\(r\.to\); \}\}/);
  });

  it("hideAllTime is set — an all-time customer/vendor statement would dump everything (use the entity-360 sheet instead)", () => {
    expect(PAGE).toMatch(/<DateRangePresets[\s\S]{0,300}hideAllTime/);
  });

  it("testidPrefix is scoped to 'account-statement-preset' (no clash with sibling preset rows)", () => {
    expect(PAGE).toMatch(/testidPrefix="account-statement-preset"/);
  });

  it("presets render ABOVE the free-form date inputs (visual hierarchy)", () => {
    const presetIdx = PAGE.indexOf("<DateRangePresets");
    const fromInputIdx = PAGE.indexOf('value={startDate} onChange={(e) => setStartDate(e.target.value)}');
    expect(presetIdx).toBeGreaterThan(0);
    expect(fromInputIdx).toBeGreaterThan(presetIdx);
  });

  it("free-form date inputs survive (presets are SHORTCUT, not replacement)", () => {
    expect(PAGE).toMatch(/value=\{startDate\} onChange=\{\(e\) => setStartDate\(e\.target\.value\)\}/);
    expect(PAGE).toMatch(/value=\{endDate\} onChange=\{\(e\) => setEndDate\(e\.target\.value\)\}/);
  });
});

describe("wrappers re-export account-statement — drift alarm on the 2× amplification", () => {
  it("customer-statement wrapper imports the shared base", () => {
    expect(CUSTOMER_WRAPPER).toMatch(/from "\.\/account-statement"|from "@\/pages\/finance\/account-statement"/);
  });

  it("vendor-statement wrapper imports the shared base", () => {
    expect(VENDOR_WRAPPER).toMatch(/from "\.\/account-statement"|from "@\/pages\/finance\/account-statement"/);
  });
});
