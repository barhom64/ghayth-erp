// HR Director persona — checks the canonical HR surfaces load.
//
// Coverage:
//   - /employees (list)
//   - /hr/contracts
//   - /hr/attendance
//   - /hr/payroll
//   - /hr/organization-structure
//
// The 11 HR tasks in ROLE_BASED_TEST_SCENARIOS.md all surface through
// these pages. Asserting they render without runtime errors is the
// minimum bar for "HR module is reachable end-to-end".
import { test, expect } from "@playwright/test";
import { login, captureErrors } from "./_helpers/login";

const HR_PATHS = [
  "/employees",
  "/hr/contracts",
  "/hr/attendance",
  "/hr/payroll",
  "/hr/organization-structure",
] as const;

test.describe("HR Director persona", () => {
  for (const path of HR_PATHS) {
    test(`${path} renders without runtime errors`, async ({ page }) => {
      const { pageErrors, consoleErrors } = captureErrors(page);
      await login(page);
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      await expect(page.locator('[data-sidebar], nav, aside').first()).toBeVisible({ timeout: 10_000 });
      expect(pageErrors, `pageerror at ${path}: ${pageErrors.join("\n")}`).toHaveLength(0);
      expect(consoleErrors, `console.error at ${path}: ${consoleErrors.join("\n")}`).toHaveLength(0);
    });
  }
});
