// Playwright config for Ghayth ERP end-to-end tests.
//
// Goal: cover the golden paths (login, dashboard, list views, write flows)
// against a running dev environment. NOT a substitute for unit/integration
// tests in artifacts/api-server/tests — this layer catches UI regressions
// only.
//
// Run:
//   pnpm --filter @workspace/e2e install-browsers     # one-time
//   pnpm --filter @workspace/e2e test                 # headless
//   pnpm --filter @workspace/e2e test:ui              # interactive
//
// CI: keep this OUT of the default `pnpm build` pipeline. E2E needs both
// API + frontend running, which the CI layer doesn't always have. Wire it
// into a separate workflow that boots Postgres + api-server + frontend.

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const API_URL = process.env.E2E_API_URL ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "ar-SA",
    timezoneId: "Asia/Riyadh",
    extraHTTPHeaders: {
      // Surfaces test-mode hooks in api-server (e.g. relaxed rate limits)
      // when api-server respects E2E_TEST=1 in its env.
      "X-E2E-Test": "1",
    },
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } },
    },
    // Mobile project runs only the @mobile-tagged tests. The grep pattern
    // matches "@mobile" anywhere in the test/title.
    {
      name: "chromium-mobile",
      grep: /@mobile/,
      use: { ...devices["Pixel 7"] },
    },
  ],
  // Don't auto-spin servers — the operator chooses how to bring them up.
  // (Embedding a webServer block here would make `pnpm test` start its own
  // postgres + api-server + frontend, which is brittle and slow.)
});

// Re-exported for convenience in tests that need to call the API directly.
export const TEST_BASE_URL = BASE_URL;
export const TEST_API_URL = API_URL;
