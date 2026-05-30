// Employee Self-Service persona — the cleanest flow in the codebase
// (9.5/10 in PRODUCTION_READINESS_SCORE.md).
//
// Covers the day-to-day employee surfaces: my-space, leave request,
// attendance, salary view. Even as the admin user (no per-employee
// pages), these URLs must render — they're the entry surface for every
// non-admin user in the company.
import { test, expect } from "@playwright/test";
import { login, captureErrors } from "./_helpers/login";

const EMPLOYEE_PATHS = [
  "/my-space",
  "/my-space/leave",
  "/my-space/attendance",
  "/my-space/payslip",
  "/my-space/requests",
] as const;

test.describe("Employee Self-Service persona", () => {
  for (const path of EMPLOYEE_PATHS) {
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
