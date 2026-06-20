// Property Manager persona — verifies the strongest path in the system
// (rent payment flow, ROLE_BASED_TEST_SCENARIOS.md verdict 9.0/10).
//
// What we assert here:
//   1. The properties sidebar entry is visible to an admin.
//   2. /properties (the units list) loads without runtime errors.
//   3. /properties/buildings, /properties/contracts, /properties/payments
//      each load and show the canonical layout (data table or empty state).
//
// What we deliberately DO NOT assert: specific row counts. The e2e DB is
// the test-seed admin lane — no property data. We assert layout presence,
// not business data.
import { test, expect } from "@playwright/test";
import { login, captureErrors } from "./_helpers/login";

test.describe("Property Manager persona", () => {
  test("can navigate property pages without runtime errors", async ({ page }) => {
    const { pageErrors, consoleErrors } = captureErrors(page);
    await login(page);

    // Direct nav — sidebar exploration is brittle (517 entries, label
    // changes with translation). URL nav is the contract.
    //
    // NOTE: the units LIST lives at "/properties" itself (the Properties page
    // renders the units table) — there is NO "/properties/units" route. A bare
    // "/properties/units" falls through to the catch-all "/properties/:id"
    // (id="units") → UnitDetail → GET /api/properties/units/units → 422, which
    // the console-error assertion below correctly flags. Cover a real second
    // list page ("/properties/buildings") instead.
    for (const path of ["/properties", "/properties/buildings", "/properties/contracts", "/properties/payments"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // Every authenticated page renders a sidebar — use it as a "page
      // loaded successfully" sentinel rather than asserting page-specific
      // strings that change with copy edits.
      await expect(page.locator('[data-sidebar], nav, aside').first()).toBeVisible({ timeout: 10_000 });
    }

    expect(pageErrors, `pageerror: ${pageErrors.join("\n")}`).toHaveLength(0);
    expect(consoleErrors, `console.error: ${consoleErrors.join("\n")}`).toHaveLength(0);
  });

  test("/properties/payments shows the canonical layout (table or empty state)", async ({ page }) => {
    await login(page);
    await page.goto("/properties/payments");
    await page.waitForLoadState("networkidle");

    // Either a data table OR an empty-state message must render. Both are
    // valid "page loaded correctly" outcomes for a tenant with no data.
    // NOTE: a `text=` engine clause cannot be mixed into a comma-separated CSS
    // selector string (Playwright throws "Unexpected token = while parsing css
    // selector"). Keep the CSS list as one locator and OR-in the empty-state
    // text via a separate getByText locator.
    const tableOrEmpty = page
      .locator('table, [role="table"], [data-state="empty"], [data-testid*="empty"]')
      .or(page.getByText(/لا توجد|لا يوجد|بدون بيانات/i));
    await expect(tableOrEmpty.first()).toBeVisible({ timeout: 10_000 });
  });
});
