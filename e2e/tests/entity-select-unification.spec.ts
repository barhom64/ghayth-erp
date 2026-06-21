// Behavioral coverage for the entity-select unification (#2741–#2773).
//
// The migration replaced raw native <select> / shadcn <Select> dropdowns
// across 8 tracks with the unified searchable component
// (components/shared/entity-selects.tsx → SearchableSelectField, built on
// cmdk + a Radix Popover). Static checks (tsc + source smoke tests) proved
// the code compiles and wires the right component, but could NOT prove the
// component actually MOUNTS and OPENS at runtime on the real pages. This spec
// closes that gap.
//
// Per migrated CREATE page we assert:
//   1. the page loads (sidebar sentinel) — no crash on mount,
//   2. its unified searchable trigger opens the cmdk search popover
//      ([cmdk-input]) when clicked — proving the Popover + Command render
//      without a runtime error (the bug class static checks miss),
//   3. zero page/console runtime errors across the whole walk.
//
// Targeting: the unified trigger is a [role=combobox] that renders a lucide
// `chevrons-up-down` icon (SearchableSelect). Raw shadcn <Select> triggers
// also carry role=combobox but render a `chevron-down` icon and open a
// listbox (no cmdk) — so the icon class selects the unified one directly,
// without clicking through unrelated dropdowns.
//
// We do NOT assert option contents: the e2e DB is the test-seed admin lane
// (no seeded buildings/units), so lists may be empty — opening the search box
// is the runtime contract, not the row count. Pages are limited to the
// property + HR modules the existing persona specs already prove reachable.
import { test, expect, type Page } from "@playwright/test";
import { login, captureErrors } from "./_helpers/login";

const PAGES: { path: string; label: string }[] = [
  { path: "/properties/create", label: "properties unit create (BuildingSelect/PropertyOwnerSelect)" },
  { path: "/properties/buildings/create", label: "building create (PropertyOwnerSelect)" },
  { path: "/properties/maintenance/create", label: "maintenance create (UnitSelect/SupplierSelect)" },
  { path: "/hr/recruitment/create", label: "recruitment create (department search)" },
];

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

      // The unified searchable trigger = a combobox carrying the lucide
      // chevrons-up-down icon (distinct from raw shadcn selects' chevron-down).
      const trigger = page
        .locator('[role="combobox"]')
        .filter({ has: page.locator("svg.lucide-chevrons-up-down") })
        .first();
      await expect(trigger, `${c.label}: unified searchable trigger not found`).toBeVisible({ timeout: 10_000 });
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();

      // Opening must render the cmdk search box — the runtime proof the
      // unified component works (a raw <Select> would show a listbox instead).
      await expect(
        page.locator("[cmdk-input]").first(),
        `${c.label}: search popover did not open`,
      ).toBeVisible({ timeout: 6_000 });

      await page.keyboard.press("Escape");
    }

    expect(pageErrors, `pageerror: ${pageErrors.join("\n")}`).toHaveLength(0);
    expect(consoleErrors, `console.error: ${consoleErrors.join("\n")}`).toHaveLength(0);
  });
});
