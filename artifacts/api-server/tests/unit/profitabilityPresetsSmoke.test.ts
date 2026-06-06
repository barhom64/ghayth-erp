import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Date-range preset chips wired into the shared profitability page
 * (`/finance/profitability.tsx`). This is the BASE component for
 * four routed wrappers — vehicle / property / project / umrah-agent
 * — so a single integration here amplifies 4× across:
 *
 *   - /finance/profitability/vehicle/:id
 *   - /finance/profitability/property/:id
 *   - /finance/profitability/project/:id
 *   - /finance/profitability/umrah-agent/:id
 *
 * Same boundary mapping as cost-center-pnl (startDate/endDate ↔
 * from/to) so the shared DateRangePresets component stays the single
 * source of truth for the preset windows.
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/profitability.tsx"),
  "utf8",
);
const VEHICLE_WRAPPER = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/profitability-vehicle.tsx"),
  "utf8",
);
const PROPERTY_WRAPPER = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/profitability-property.tsx"),
  "utf8",
);
const PROJECT_WRAPPER = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/profitability-project.tsx"),
  "utf8",
);
const UMRAH_WRAPPER = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/profitability-umrah-agent.tsx"),
  "utf8",
);

describe("profitability page — date-range presets (4× amplification via wrappers)", () => {
  it("imports the shared DateRangePresets component", () => {
    expect(PAGE).toMatch(/import \{ DateRangePresets \} from "@\/components\/shared\/date-range-presets"/);
  });

  it("maps startDate/endDate into from/to at the boundary (no schema duplication)", () => {
    expect(PAGE).toMatch(/value=\{\{ from: startDate, to: endDate \}\}/);
    expect(PAGE).toMatch(/onChange=\{\(r\) => \{ setStartDate\(r\.from\); setEndDate\(r\.to\); \}\}/);
  });

  it("hideAllTime is set — an all-time profitability view masks seasonal trends", () => {
    expect(PAGE).toMatch(/<DateRangePresets[\s\S]{0,300}hideAllTime/);
  });

  it("testidPrefix is scoped to 'profitability-preset' (no clash with sibling pages)", () => {
    expect(PAGE).toMatch(/testidPrefix="profitability-preset"/);
  });

  it("presets render ABOVE the free-form date inputs (visual hierarchy: quick → custom)", () => {
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

describe("wrappers all re-export profitability — drift alarm on the 4× amplification", () => {
  // Each wrapper imports the shared file as default; that's how the
  // preset chips propagate to all four routed surfaces with a single
  // integration.
  it("vehicle wrapper imports the shared base", () => {
    expect(VEHICLE_WRAPPER).toMatch(/from "\.\/profitability"|from "@\/pages\/finance\/profitability"/);
  });

  it("property wrapper imports the shared base", () => {
    expect(PROPERTY_WRAPPER).toMatch(/from "\.\/profitability"|from "@\/pages\/finance\/profitability"/);
  });

  it("project wrapper imports the shared base", () => {
    expect(PROJECT_WRAPPER).toMatch(/from "\.\/profitability"|from "@\/pages\/finance\/profitability"/);
  });

  it("umrah-agent wrapper imports the shared base", () => {
    expect(UMRAH_WRAPPER).toMatch(/from "\.\/profitability"|from "@\/pages\/finance\/profitability"/);
  });
});
