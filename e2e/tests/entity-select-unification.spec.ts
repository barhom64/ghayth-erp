// Behavioral coverage for the entity-select unification (#2741–#2773).
//
// The migration replaced raw native <select> / shadcn <Select> dropdowns
// across 8 tracks with the unified searchable component
// (components/shared/entity-selects.tsx → SearchableSelectField, built on
// cmdk). Static checks (tsc + source smoke tests) proved the code compiles
// and wires the right component, but could NOT prove the component actually
// MOUNTS and OPENS at runtime on the real pages. This spec closes that gap.
//
// Per migrated CREATE page we assert:
//   1. the page loads (sidebar sentinel) — no crash on mount,
//   2. at least one unified searchable select on the page OPENS its cmdk
//      search popover ([cmdk-input]) when clicked — this uniquely
//      distinguishes the unified component (Popover + Command) from a raw
//      shadcn <Select> (which opens a listbox with no search box), and proves
//      it renders without a runtime error (the bug class static checks miss),
//   3. zero page/console runtime errors across the whole walk.
//
// We do NOT assert option contents: the e2e DB is the test-seed admin lane
// (no clients/units/buildings), so lists may be empty — opening the search
// box is the runtime contract, not the row count (mirrors the persona specs'
// "layout, not data" rule). Pages are limited to the property + HR modules
// the existing persona specs already prove reachable for the e2e admin.
import { test, expect, type Page } from "@playwright/test";
import { login, captureErrors } from "./_helpers/login";

const PAGES: { path: string; label: string }[] = [
  { path: "/properties/create", label: "properties unit create (BuildingSelect/PropertyOwnerSelect)" },
  { path: "/properties/buildings/create", label: "building create (PropertyOwnerSelect)" },
  { path: "/properties/maintenance/create", label: "maintenance create (UnitSelect/SupplierSelect)" },
  { path: "/hr/recruitment/create", label: "recruitment create (department search)" },
];

// Click each role=combobox on the page until one opens the cmdk search box.
// Raw shadcn <Select> triggers also carry role=combobox but open a listbox
// (no [cmdk-input]); only the unified searchable component produces it.
async function opensAUnifiedSearchSelect(page: Page): Promise<boolean> {
  const combos = page.locator('[role="combobox"]');
  const n = await combos.count();
  for (let i = 0; i < n; i++) {
    await combos.nth(i).click();
    const appeared = await page
      .locator("[cmdk-input]")
      .first()
      .waitFor({ state: "visible", timeout: 1500 })
      .then(() => true)
      .catch(() => false);
    await page.keyboard.press("Escape"); // close cmdk popover or raw listbox
    if (appeared) return true;
  }
  return false;
}

test.describe("entity-select unification — runtime mount & open", () => {
  test("each migrated create page mounts a unified searchable select that opens its search popover", async ({ page }) => {
    const { pageErrors, consoleErrors } = captureErrors(page);
    await login(page);

    for (const c of PAGES) {
      await page.goto(c.path);
      await page.waitForLoadState("networkidle");

      await expect(
        page.locator('[data-sidebar], nav, aside').first(),
        `${c.label}: page shell did not render`,
      ).toBeVisible({ timeout: 10_000 });

      const opened = await opensAUnifiedSearchSelect(page);
      expect(opened, `${c.label}: no unified searchable select opened on ${c.path}`).toBe(true);
    }

    expect(pageErrors, `pageerror: ${pageErrors.join("\n")}`).toHaveLength(0);
    expect(consoleErrors, `console.error: ${consoleErrors.join("\n")}`).toHaveLength(0);
  });
});
