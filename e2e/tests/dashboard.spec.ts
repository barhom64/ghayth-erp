// Dashboard renders without console errors.
//
// This is a low-cost regression catcher: every time we ship a frontend
// change, we want to know if the main dashboard breaks before users see
// it. We don't assert specific numbers (data depends on seed) — just that
// the layout renders and no runtime errors land in the console.

import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_USER_EMAIL ?? "admin@ghayth.com";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "Admin@123456";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  // Use input ids directly — getByLabel(/كلمة/i) matches both the input
  // and the "إظهار كلمة المرور" toggle button via its aria-label, which
  // Playwright strict mode rejects.
  await page.locator("input#email").fill(EMAIL);
  await page.locator("input#password").fill(PASSWORD);
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
  /Failed to load resource.*net::ERR_/i, // external CDN reachability — not an app bug
  // playwright.config.ts attaches `X-E2E-Test: 1` to every browser
  // request (extraHTTPHeaders is unconditional). For cross-origin fetches
  // like Google Fonts (fonts.gstatic.com), the preflight returns an
  // Access-Control-Allow-Headers list that doesn't include x-e2e-test,
  // so the browser blocks every font request and logs one console.error
  // per blocked URL. None of these point at app code — strip them.
  /Access to font at .*blocked by CORS/i,
  /blocked by CORS policy/i,
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
