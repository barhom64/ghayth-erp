import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Dormant-entities lookback presets — quick-pick chip row for the
 * four lookback windows operators actually use. 30/90 cover routine
 * cleanup; 180/365 surface seasonal CCs (umrah seasons, annual
 * contracts) before they're prematurely deleted.
 *
 * The number input stays for free-form values; the chips just
 * skip the typing for the four common windows.
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/dormant-entities.tsx"),
  "utf8",
);

describe("dormant-entities — lookback presets", () => {
  it("declares a closed list of presets (30/90/180/365) — drift alarm on routine windows", () => {
    expect(PAGE).toMatch(/const LOOKBACK_PRESETS:[\s\S]{0,40}\[/);
    for (const d of [30, 90, 180, 365]) {
      expect(PAGE).toMatch(new RegExp(`days: ${d},`));
    }
  });

  it("Arabic labels distinguish the year preset from the day-count presets", () => {
    expect(PAGE).toMatch(/"آخر 30 يوماً"/);
    expect(PAGE).toMatch(/"آخر 90 يوماً"/);
    expect(PAGE).toMatch(/"آخر 180 يوماً"/);
    expect(PAGE).toMatch(/"آخر سنة"/);
  });

  it("each preset renders a button with a templated testid (one place per chip)", () => {
    // testid is composed via `dormant-preset-${p.days}d`, so the four
    // testids dormant-preset-{30,90,180,365}d derive from LOOKBACK_PRESETS.
    expect(PAGE).toMatch(/data-testid=\{`dormant-preset-\$\{p\.days\}d`\}/);
  });

  it("active preset gets the default variant + data-active attribute (selectable in screenshots)", () => {
    expect(PAGE).toMatch(/variant=\{days === p\.days \? "default" : "outline"\}/);
    expect(PAGE).toMatch(/data-active=\{days === p\.days \? "true" : "false"\}/);
  });

  it("clicking a preset sets `days` directly — no roundtrip through the number input", () => {
    expect(PAGE).toMatch(/onClick=\{\(\) => setDays\(p\.days\)\}/);
  });

  it("the free-form number input is still rendered (presets are a SHORTCUT, not a replacement)", () => {
    expect(PAGE).toContain('data-testid="dormant-days-input"');
    expect(PAGE).toMatch(/type="number"/);
    expect(PAGE).toMatch(/min=\{7\}/);
    expect(PAGE).toMatch(/max=\{730\}/);
  });

  it("preset chips live ABOVE the free-form row (visual hierarchy: quick → custom)", () => {
    const presetIdx = PAGE.indexOf("سريع:");
    const inputIdx = PAGE.indexOf('data-testid="dormant-days-input"');
    expect(presetIdx).toBeGreaterThan(0);
    expect(inputIdx).toBeGreaterThan(presetIdx);
  });
});
