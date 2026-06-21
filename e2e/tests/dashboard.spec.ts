// Dashboard renders without console errors.
//
// This is a low-cost regression catcher: every time we ship a frontend
// change, we want to know if the main dashboard breaks before users see
// it. We don't assert specific numbers (data depends on seed) — just that
// the layout renders and no runtime errors land in the console.

import { test, expect } from "@playwright/test";
import { login, captureErrors } from "./_helpers/login";

test.describe("Dashboard", () => {
  test("renders KPI cards and sidebar without runtime errors", async ({ page }) => {
    // Attach capturers BEFORE navigating so we don't miss early errors.
    const { pageErrors, consoleErrors } = captureErrors(page);

    await login(page);

    // Sidebar is always present on authenticated pages. The layout
    // renders <aside> containing a <nav>; both match the selector, so
    // pin to the first hit to satisfy Playwright strict mode.
    await expect(page.locator('[data-sidebar], nav, aside').first()).toBeVisible({ timeout: 10_000 });

    // At least one element that looks like a KPI card / stat.
    const cards = page.locator('[data-testid*="kpi"], [class*="card"], [class*="stat"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    // Uncaught exceptions are always a regression — fail with all of them.
    expect(pageErrors, `pageerror: ${pageErrors.join("\n")}`).toHaveLength(0);
    // Console.error after filtering known noise.
    expect(consoleErrors, `console.error: ${consoleErrors.join("\n")}`).toHaveLength(0);
  });

  test("opens the employees list page", async ({ page }) => {
    await login(page);

    // Direct URL navigation. The sidebar (sidebar-layout.tsx:115) renders
    // "الموظفون" as a collapsed-by-default <button> that toggles its
    // children, not a link — and the actual "قائمة الموظفين" link is
    // hidden under that toggle. Trying to drive that interaction through
    // role=link is fragile (and the HR section itself can be hidden when
    // the user lacks the `hr` module). The regression we want to catch
    // here is "list page crashes / 500s / doesn't render at all", so we
    // jump straight to the URL and assert the page rendered.
    await page.goto("/employees");
    await expect(page).toHaveURL(/employees/i);
    await expect(
      page.locator('table, [role="table"], [data-empty-state]'),
    ).toBeVisible({ timeout: 15_000 });
  });
});
