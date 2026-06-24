// Auth golden path — verifies login → me → logout end-to-end.
//
// Uses the bench/admin user defined by E2E_USER_EMAIL / E2E_USER_PASSWORD.
// Default credentials match the seed admin from artifacts/api-server/src/lib/
// seedDemoData.ts so this test runs out of the box on a fresh dev DB.

import { test, expect } from "@playwright/test";

// Default to the actual seeded owner in this project (admin@ghayth.com /
// Admin@123456). The historical defaults (owner@local.test / Test1234!)
// were a different seed flow that no longer applies here.
const EMAIL = process.env.E2E_USER_EMAIL ?? "admin@ghayth.com";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "Admin@123456";

test.describe("Auth", () => {
  test("logs in, lands on dashboard, then logs out", async ({ page }) => {
    // Go straight to /login. goto("/") relies on the SPA's unauthenticated
    // "/" → "/login" client redirect, which races the field fills (the
    // email can land on the about-to-unmount form and get dropped on
    // remount → empty-email login → bounce back to /login). See
    // _helpers/login.ts for the canonical race-free flow.
    await page.goto("/login");

    // Login form should be the entry surface for an anonymous visit.
    // Use the input id directly: getByLabel(/كلمة/i) matches both the
    // password input AND the "إظهار كلمة المرور" (show password) icon
    // button via its aria-label, which trips Playwright strict mode.
    await page.locator("input#email").fill(EMAIL);
    await page.locator("input#password").fill(PASSWORD);
    await page.getByRole("button", { name: /login|دخول/i }).click();

    // Dashboard renders some KPI text. Match a stable Arabic string.
    await expect(page).toHaveURL(/\/(dashboard|home)?$/);
    await expect(page.locator("body")).toContainText(/لوحة|dashboard/i, { timeout: 10_000 });

    // Logout — sidebar-layout renders a direct icon button with
    // title="تسجيل الخروج", not a profile dropdown menu. Match by title
    // (Playwright treats title as accessible name when no aria-label exists).
    await page.getByRole("button", { name: /تسجيل الخروج|logout/i }).first().click();
    await expect(page).toHaveURL(/login|\/$/);
  });

  test("rejects invalid credentials with a visible error", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input#email").fill(EMAIL);
    await page.locator("input#password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: /login|دخول/i }).click();

    // Server replies with "بيانات الدخول غير صحيحة" (FORBIDDEN). Match the
    // stable substrings the login form actually surfaces — including "غير
    // صحيحة" (the canonical Arabic error) and English fallbacks.
    await expect(page.locator("body")).toContainText(
      /invalid|incorrect|خطأ|غير صحيحة|غير صالح/i,
      { timeout: 5_000 },
    );
  });
});
