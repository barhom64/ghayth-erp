// Dashboard renders without console errors.
//
// This is a low-cost regression catcher: every time we ship a frontend
// change, we want to know if the main dashboard breaks before users see
// it. We don't assert specific numbers (data depends on seed) — just that
// the layout renders and no runtime errors land in the console.

import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_USER_EMAIL ?? "owner@local.test";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "Test1234!";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel(/email|البريد/i).fill(EMAIL);
  await page.getByLabel(/password|كلمة/i).fill(PASSWORD);
  await page.getByRole("button", { name: /login|دخول/i }).click();
  await page.waitForLoadState("networkidle");
}

test.describe("Dashboard", () => {
  test("renders KPI cards and sidebar without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await login(page);

    // Sidebar is always present on authenticated pages.
    await expect(page.locator('[data-sidebar], nav, aside')).toBeVisible({ timeout: 10_000 });

    // At least one element that looks like a KPI card / stat.
    const cards = page.locator('[data-testid*="kpi"], [class*="card"], [class*="stat"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    // No errors should land in the console — if we got any, fail with all
    // of them so we don't have to reproduce one at a time.
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("navigates to HR > Employees and shows a list", async ({ page }) => {
    await login(page);

    // Try Arabic first, then English; one of them will be visible depending
    // on i18n state.
    const navLink = page
      .getByRole("link", { name: /موظفين|employees/i })
      .first();
    await navLink.click();

    await expect(page).toHaveURL(/employees/i);
    // The list either shows rows OR an empty-state message. Either is fine
    // — the regression we catch here is "page crashes / 500s / doesn't
    // render at all".
    await expect(
      page.locator('table, [role="table"], [data-empty-state]'),
    ).toBeVisible({ timeout: 10_000 });
  });
});
