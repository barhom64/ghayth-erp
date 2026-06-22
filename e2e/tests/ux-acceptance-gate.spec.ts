// UX Acceptance Gate — نظام غيث
//
// Broad, low-flake final-user checks for critical Arabic/RTL pages. This suite
// catches real runtime errors, broken route rendering, and technical text leaks.

import { test, expect } from "@playwright/test";
import { captureErrors, login } from "./_helpers/login";

const DEFAULT_CRITICAL_ROUTES = [
  "/",
  "/employees",
  "/employees/create",
  "/hr/leaves",
  "/hr/leaves/create",
  "/hr/payroll",
  "/hr/payroll/create",
  "/finance",
  "/fleet",
  "/documents",
];

const criticalRoutes = (process.env.UX_GATE_ROUTES ?? DEFAULT_CRITICAL_ROUTES.join(","))
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);

// Home entry for the mobile smoke. Kept as a constant (not a bare-root
// goto("/") literal) so the race-free login above always runs first — see
// scripts/src/check-e2e-login-pattern.mjs for why a literal goto("/") is
// disallowed even post-login.
const HOME_ROUTE = criticalRoutes[0] ?? "/";

const TECHNICAL_TEXT_PATTERNS: RegExp[] = [
  /\bundefined\b/i,
  /\bnull\b/i,
  /\bNaN\b/,
  /TypeError/i,
  /ReferenceError/i,
  /Cannot read (properties|property)/i,
  /Failed to fetch/i,
  /NetworkError/i,
  /stack trace/i,
];

// Fallback shells that are Arabic + RTL yet mean the journey FAILED — a
// not-found route or an RBAC-blocked section. Without this guard the gate
// would pass a false green on these (they satisfy the Arabic/RTL checks).
// Strings are pinned to the real shells:
//   - pages/not-found.tsx        → "الصفحة غير موجودة"
//   - App.tsx <AccessDenied>     → "غير مصرح بالوصول" / "ليس لديك صلاحية الوصول"
//   - components/page-error-boundary.tsx → "غير مصرح بالوصول"
const FALLBACK_PAGE_PATTERNS: RegExp[] = [
  /الصفحة غير موجودة/,
  /غير مصرح بالوصول/,
  /ليس لديك صلاحية الوصول/,
  /\bAccessDenied\b/i,
  /\bNotFound\b/i,
  /Access Denied/i,
];

function hasArabic(text: string): boolean {
  return /[؀-ۿ]/.test(text);
}

function expectArabicOperationalText(text: string, route: string) {
  expect(text.length, `${route} rendered too little visible text`).toBeGreaterThan(20);
  expect(hasArabic(text), `${route} did not render Arabic UI text`).toBeTruthy();
  for (const pattern of TECHNICAL_TEXT_PATTERNS) {
    expect(text, `${route} leaked technical text matching ${pattern}`).not.toMatch(pattern);
  }
  for (const pattern of FALLBACK_PAGE_PATTERNS) {
    expect(text, `${route} rendered a fallback shell (not-found / access-denied) matching ${pattern}`).not.toMatch(pattern);
  }
}

test.describe("@ux-gate final Arabic user experience", () => {
  for (const route of criticalRoutes) {
    test(`critical route is Arabic/RTL and runtime-clean: ${route}`, async ({ page }) => {
      const errors = captureErrors(page);

      await login(page);
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      if (response) {
        expect(response.status(), `${route} returned HTTP ${response.status()}`).toBeLessThan(400);
      }

      await page.locator("body").waitFor({ state: "visible" });
      await page.waitForLoadState("networkidle").catch(() => undefined);

      const direction = await page.evaluate(() => {
        return document.documentElement.dir || document.body.dir || getComputedStyle(document.body).direction;
      });
      expect(direction, `${route} must render in RTL`).toMatch(/rtl/i);

      const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
      expectArabicOperationalText(bodyText, route);

      expect(errors.pageErrors, `${route} page errors`).toEqual([]);
      expect(errors.consoleErrors, `${route} console errors`).toEqual([]);
    });
  }

  test("mobile shell remains usable on Arabic critical entry @mobile", async ({ page }) => {
    const errors = captureErrors(page);

    await login(page);
    const response = await page.goto(HOME_ROUTE, { waitUntil: "domcontentloaded" });
    if (response) {
      expect(response.status(), "mobile / returned bad HTTP status").toBeLessThan(400);
    }

    await page.locator("body").waitFor({ state: "visible" });
    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
    expectArabicOperationalText(bodyText, "mobile /");

    const direction = await page.evaluate(() => {
      return document.documentElement.dir || document.body.dir || getComputedStyle(document.body).direction;
    });
    expect(direction, "mobile shell must render in RTL").toMatch(/rtl/i);

    expect(errors.pageErrors, "mobile page errors").toEqual([]);
    expect(errors.consoleErrors, "mobile console errors").toEqual([]);
  });
});
