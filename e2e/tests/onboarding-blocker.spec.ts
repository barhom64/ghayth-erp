// Documents the three BLOCKERS from CRITICAL_DEFECTS_REPORT.md.
//
// These tests are NOT smoke checks — they're inverted assertions that
// codify the blockers so we know when each is finally fixed: the day
// /auth/register stops returning 405, this test starts failing, and
// that's the cue to flip the assertion.

import { test, expect } from "@playwright/test";

test.describe("Onboarding BLOCKERS (CRITICAL_DEFECTS_REPORT B1-B3)", () => {
  test("B1: login page has no self-registration link", async ({ page }) => {
    await page.goto("/");

    // The login page MUST currently NOT have a "create company" CTA.
    // When we eventually ship onboarding, flip this to .toBeVisible().
    const registerCta = page.getByRole("link", {
      name: /إنشاء حساب|تسجيل|sign[ -]?up|register|create account|new company/i,
    });
    await expect(registerCta).toHaveCount(0);
  });

  test("B1: POST /api/auth/register returns 405", async ({ request }) => {
    // Confirms the documented blocker. The handler at auth.ts:228
    // unconditionally returns HTTP 405. When self-registration ships,
    // this test fails and we re-author the spec.
    const r = await request.post("/api/auth/register", {
      data: { email: "test@example.com", password: "Test1234!" },
      failOnStatusCode: false,
    });
    expect(r.status()).toBe(405);
  });

  test("B2: no /api/subscriptions endpoint exists", async ({ request }) => {
    // Confirms the absent subscription module. Expect a 404 today.
    const r = await request.get("/api/subscriptions", { failOnStatusCode: false });
    expect([404, 401, 403]).toContain(r.status());
  });
});
