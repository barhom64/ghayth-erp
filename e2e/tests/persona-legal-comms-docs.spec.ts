// Legal Manager, Comms Officer, Document Control Officer personas.
//
// Three personas grouped together because each owns a small URL surface
// (5-7 pages each) and the assertion is the same: page renders, sidebar
// present, no runtime errors.
import { test, expect } from "@playwright/test";
import { login, captureErrors } from "./_helpers/login";

const LEGAL_PATHS = ["/legal"] as const;
const COMMS_PATHS = ["/communications/inbox", "/correspondence"] as const;
const DOCS_PATHS = ["/documents"] as const;

test.describe("Legal Manager persona", () => {
  for (const path of LEGAL_PATHS) {
    test(`legal ${path} renders`, async ({ page }) => {
      const { pageErrors, consoleErrors } = captureErrors(page);
      await login(page);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator('[data-sidebar], nav, aside').first()).toBeVisible({ timeout: 10_000 });
      expect(pageErrors).toHaveLength(0);
      expect(consoleErrors).toHaveLength(0);
    });
  }
});

test.describe("Comms Officer persona", () => {
  for (const path of COMMS_PATHS) {
    test(`comms ${path} renders`, async ({ page }) => {
      const { pageErrors, consoleErrors } = captureErrors(page);
      await login(page);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator('[data-sidebar], nav, aside').first()).toBeVisible({ timeout: 10_000 });
      expect(pageErrors).toHaveLength(0);
      expect(consoleErrors).toHaveLength(0);
    });
  }
});

test.describe("Doc Control Officer persona", () => {
  for (const path of DOCS_PATHS) {
    test(`documents ${path} renders`, async ({ page }) => {
      const { pageErrors, consoleErrors } = captureErrors(page);
      await login(page);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator('[data-sidebar], nav, aside').first()).toBeVisible({ timeout: 10_000 });
      expect(pageErrors).toHaveLength(0);
      expect(consoleErrors).toHaveLength(0);
    });
  }
});
