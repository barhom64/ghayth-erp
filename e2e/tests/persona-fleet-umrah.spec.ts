// Fleet Manager + Umrah Operations Manager personas — verifies the
// canonical surfaces for both domains load without runtime errors.
//
// Bundled into one spec because both modules are large but each persona
// only owns its own URL set — keeping them adjacent makes it cheap to
// iterate on both at once.
import { test, expect } from "@playwright/test";
import { login, captureErrors } from "./_helpers/login";

const FLEET_PATHS = [
  "/fleet",
  "/fleet/drivers",
  "/fleet/trips",
  "/fleet/fuel",
  "/fleet/maintenance",
] as const;

const UMRAH_PATHS = [
  "/umrah/dashboard",
  "/umrah/seasons",
  "/umrah/pilgrims",
  "/umrah/packages",
  "/umrah/invoices",
] as const;

test.describe("Fleet Manager persona", () => {
  for (const path of FLEET_PATHS) {
    test(`fleet ${path} renders`, async ({ page }) => {
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

test.describe("Umrah Operations Manager persona", () => {
  for (const path of UMRAH_PATHS) {
    test(`umrah ${path} renders`, async ({ page }) => {
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
