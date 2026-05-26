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

// Console noise we tolerate: third-party libraries (React-Query devtools,
// react-router lazy-chunk warnings, browser autofill, vite-preview HMR
// stubs, ResizeObserver loop, web-vitals deprecations) emit `console.error`
// on every page load. They don't represent real product regressions, so
// filtering them keeps the assertion focused on app-level pageerrors.
const IGNORED_CONSOLE_PATTERNS: RegExp[] = [
  /ResizeObserver loop/i,
  /Failed to load resource.*404/i, // dev-only optional endpoints (e.g. /announcements)
  /\[vite\]/i,
  /Download the React DevTools/i,
  /findDOMNode is deprecated/i,
  /A future version of React/i,
  /Hydration/i,
  /Warning:/i, // React PropTypes / strict-mode warnings — not real errors
];

function isRealError(text: string): boolean {
  return !IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text));
}

test.describe("Dashboard", () => {
  test("renders KPI cards and sidebar without runtime errors", async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    // pageerror = uncaught exception in the page context — always a real bug
    page.on("pageerror", (e) => pageErrors.push(e.message));
    // console.error = anything the app or its libs logged at error level —
    // filter to the ones that indicate a real regression
    page.on("console", (msg) => {
      if (msg.type() === "error" && isRealError(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await login(page);

    // Sidebar is always present on authenticated pages.
    await expect(page.locator('[data-sidebar], nav, aside')).toBeVisible({ timeout: 10_000 });

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
