// Shared login + console-noise filtering helper for persona specs.
//
// Centralises the input#email / input#password / role=button flow that
// otherwise gets copy-pasted into every persona spec. Also exposes the
// IGNORED_CONSOLE_PATTERNS list so every persona spec applies the same
// noise filter when it checks for "no runtime errors".
import type { Page } from "@playwright/test";

export const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? "admin@ghayth.com";
export const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? "Admin@123456";

export async function login(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator("input#email").fill(TEST_EMAIL);
  await page.locator("input#password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /login|دخول/i }).click();
  await page.waitForLoadState("networkidle");
}

// Same noise filter dashboard.spec.ts uses — pulled here so every persona
// spec applies it identically. Any divergence is a bug magnet.
export const IGNORED_CONSOLE_PATTERNS: RegExp[] = [
  /ResizeObserver loop/i,
  /Failed to load resource.*404/i,
  /Failed to load resource.*net::ERR_/i,
  /Access to font at .*blocked by CORS/i,
  /blocked by CORS policy/i,
  /\[vite\]/i,
  /Download the React DevTools/i,
  /findDOMNode is deprecated/i,
  /A future version of React/i,
  /Hydration/i,
  /Warning:/i,
];

export function isRealError(text: string): boolean {
  return !IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text));
}

// Attach error capturers and return the arrays so the test can assert on them.
export function captureErrors(page: Page): { pageErrors: string[]; consoleErrors: string[] } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && isRealError(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });
  return { pageErrors, consoleErrors };
}
