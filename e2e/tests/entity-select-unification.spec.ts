// Behavioral coverage for the entity-select unification (#2741–#2773).
//
// The migration replaced raw native <select> / shadcn <Select> dropdowns
// with the unified searchable component (components/shared/entity-selects.tsx
// → SearchableSelectField, built on cmdk + a Radix Popover). Static checks
// (tsc + source smoke tests) proved the code compiles and wires the right
// component, but could NOT prove it MOUNTS and OPENS at runtime. This closes
// that gap.
//
// Page choice: /properties/maintenance/create renders UnitSelect + SupplierSelect
// (both unified) and — unlike most create pages — has NO page-level
// loading/error gate, so it renders the form deterministically even on the
// seedless e2e admin lane (where reference lists are empty). That makes it a
// reliable host for the runtime contract.
//
// Contract asserted: clicking a [role=combobox] on the page opens a cmdk
// search box ([cmdk-input]) — the runtime proof that the unified component
// (Popover + Command) renders without error. Raw shadcn <Select> triggers
// also carry role=combobox but open a listbox (no cmdk), so we click through
// the comboboxes until a cmdk box appears. We do NOT assert option contents
// (empty seed lane) — opening the search box is the contract.
import { test, expect, type Page } from "@playwright/test";
import { login, captureErrors } from "./_helpers/login";

async function aComboboxOpensCmdk(page: Page): Promise<boolean> {
  const combos = page.locator('[role="combobox"]');
  const n = await combos.count();
  for (let i = 0; i < n; i++) {
    const combo = combos.nth(i);
    await combo.scrollIntoViewIfNeeded().catch(() => {});
    await combo.click().catch(() => {});
    const opened = await page
      .locator("[cmdk-input]")
      .first()
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    await page.keyboard.press("Escape").catch(() => {});
    if (opened) return true;
  }
  return false;
}

test.describe("entity-select unification — runtime mount & open", () => {
  test("the unified searchable select mounts and opens its cmdk search popover", async ({ page }) => {
    const { pageErrors, consoleErrors } = captureErrors(page);
    await login(page);

    await page.goto("/properties/maintenance/create");
    await page.waitForLoadState("networkidle");

    // Page mounted (sidebar sentinel) — no crash.
    await expect(page.locator('[data-sidebar], nav, aside').first()).toBeVisible({ timeout: 10_000 });
    // The unified UnitSelect/SupplierSelect render unconditionally here.
    await expect(page.locator('[role="combobox"]').first()).toBeVisible({ timeout: 10_000 });

    const opened = await aComboboxOpensCmdk(page);
    expect(opened, "no unified searchable select opened a cmdk popover on /properties/maintenance/create").toBe(true);

    expect(pageErrors, `pageerror: ${pageErrors.join("\n")}`).toHaveLength(0);
    expect(consoleErrors, `console.error: ${consoleErrors.join("\n")}`).toHaveLength(0);
  });
});
