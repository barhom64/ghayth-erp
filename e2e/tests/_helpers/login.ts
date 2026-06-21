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
  // Up to 2 attempts. This tolerates two distinct, rare, harness-only auth
  // races WITHOUT masking a genuinely broken login (a real auth failure fails
  // BOTH attempts and still throws):
  //   1. Field-fill race: the email value lands on an about-to-unmount form and
  //      is dropped on remount → empty-email login → bounce back to /login.
  //   2. Post-login landing race: the dashboard's first XHRs 401 (shared-admin
  //      session churn under load) and the SPA bounces straight back to /login
  //      AFTER we already navigated off it.
  // Go straight to /login (not "/") to avoid relying on the SPA's
  // unauthenticated "/" → "/login" client redirect, which widens race #1.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto("/login");
    const email = page.locator("input#email");
    await email.waitFor({ state: "visible" });
    await email.fill(TEST_EMAIL);
    await page.locator("input#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /login|دخول/i }).click();
    try {
      // Wait until the auth cookie is set and the SPA has navigated off /login.
      await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 15_000 });
      await page.waitForLoadState("networkidle");
    } catch (err) {
      lastErr = err;
      if (attempt === 2) throw err;
      continue;
    }
    // Catch the post-login bounce-back (race #2): if the SPA returned us to
    // /login after the dashboard's first requests 401'd, retry once.
    if (new URL(page.url()).pathname.endsWith("/login")) {
      lastErr = new Error("login bounced back to /login after a post-login 401");
      if (attempt === 2) throw lastErr;
      continue;
    }
    return;
  }
  throw lastErr ?? new Error("login failed");
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
