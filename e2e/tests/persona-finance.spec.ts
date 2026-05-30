// Finance Director persona — checks the canonical finance surfaces.
//
// Coverage: chart of accounts, journal entries, invoices, vendors, banks.
// Each is a separate URL because the finance module is split across many
// routes (settings/finance.tsx, finance-journal.tsx, etc.).
import { test, expect } from "@playwright/test";
import { login, captureErrors } from "./_helpers/login";

const FINANCE_PATHS = [
  "/finance/chart-of-accounts",
  "/finance/journal-entries",
  "/finance/invoices",
  "/finance/vendors",
  "/finance/banks",
] as const;

test.describe("Finance Director persona", () => {
  for (const path of FINANCE_PATHS) {
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
