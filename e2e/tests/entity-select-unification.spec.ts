// Behavioral coverage for the entity-select unification (#2741–#2773).
//
// The migration replaced raw native <select> / shadcn <Select> dropdowns with
// the unified searchable component (components/shared/entity-selects.tsx →
// SearchableSelectField, built on cmdk + a Radix Popover). Static checks (tsc
// + source smoke tests) proved the code compiles and wires the right
// component, but could NOT prove it MOUNTS and OPENS at runtime. This spec
// closes that gap.
//
// Contract: on a real create page, clicking the unified [role=combobox] opens
// a cmdk search box ([cmdk-input]) — the runtime proof the Popover + Command
// render without error (a raw shadcn <Select> opens a listbox, no cmdk).
//
// Resilience: the e2e DB is the seedless admin lane, and individual create
// pages may gate on a reference query (render a spinner/error) or otherwise
// not expose the form there. So we probe several migrated create pages and
// require the contract to hold on AT LEAST ONE — enough to prove the unified
// component works at runtime, without coupling the test to one page's
// environment-specific quirks. We do NOT assert option contents (empty lane).
import { test, expect, type Page } from "@playwright/test";
import { login } from "./_helpers/login";

// Migrated create pages, each rendering at least one unified entity-select.
const CANDIDATES = [
  "/properties/maintenance/create", // UnitSelect + SupplierSelect (no page gate)
  "/properties/buildings/create",   // PropertyOwnerSelect
  "/properties/contracts/create",   // PropertyOwnerSelect
  "/properties/create",             // BuildingSelect + PropertyOwnerSelect
  "/hr/recruitment/create",         // department search
  "/crm/create",                    // ClientSelect
];

// Click each [role=combobox] until one opens the cmdk search box.
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
  test("a unified searchable select mounts and opens its cmdk popover on a migrated create page", async ({ page }) => {
    await login(page);

    let provenOn: string | null = null;
    const visited: string[] = [];
    for (const path of CANDIDATES) {
      try {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
      } catch {
        continue;
      }
      visited.push(path);
      // Skip pages that didn't expose any combobox in this lane (gated/redirect).
      const hasCombo = await page
        .locator('[role="combobox"]')
        .first()
        .isVisible({ timeout: 4000 })
        .catch(() => false);
      if (!hasCombo) continue;

      if (await aComboboxOpensCmdk(page)) {
        provenOn = path;
        break;
      }
    }

    expect(
      provenOn,
      `unified searchable select never opened a cmdk popover on any candidate create page. visited: ${visited.join(", ")}`,
    ).not.toBeNull();
  });
});
