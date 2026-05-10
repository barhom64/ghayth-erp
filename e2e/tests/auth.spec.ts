// Auth golden path — verifies login → me → logout end-to-end.
//
// Uses the bench/admin user defined by E2E_USER_EMAIL / E2E_USER_PASSWORD.
// Default credentials match the seed admin from artifacts/api-server/src/lib/
// seedDemoData.ts so this test runs out of the box on a fresh dev DB.

import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_USER_EMAIL ?? "owner@local.test";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "Test1234!";

test.describe("Auth", () => {
  test("logs in, lands on dashboard, then logs out", async ({ page }) => {
    await page.goto("/");

    // Login form should be the entry surface for an anonymous visit.
    await page.getByLabel(/email|البريد/i).fill(EMAIL);
    await page.getByLabel(/password|كلمة/i).fill(PASSWORD);
    await page.getByRole("button", { name: /login|دخول/i }).click();

    // Dashboard renders some KPI text. Match a stable Arabic string.
    await expect(page).toHaveURL(/\/(dashboard|home)?$/);
    await expect(page.locator("body")).toContainText(/لوحة|dashboard/i, { timeout: 10_000 });

    // Logout — the menu opens via avatar/profile button.
    await page.getByRole("button", { name: /profile|الملف|account/i }).first().click();
    await page.getByRole("menuitem", { name: /logout|تسجيل الخروج/i }).click();
    await expect(page).toHaveURL(/login|\/$/);
  });

  test("rejects invalid credentials with a visible error", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/email|البريد/i).fill(EMAIL);
    await page.getByLabel(/password|كلمة/i).fill("definitely-not-the-password");
    await page.getByRole("button", { name: /login|دخول/i }).click();

    // Some error toast / inline message should appear.
    await expect(page.locator("body")).toContainText(/invalid|خطأ|incorrect/i, {
      timeout: 5_000,
    });
  });
});
