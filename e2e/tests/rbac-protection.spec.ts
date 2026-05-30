// RBAC protection sanity checks — verifies the auth layer is wired.
//
// Static-code analysis showed every audited endpoint uses
// `authorize({ feature, action })`. These tests confirm at runtime that:
//   1. Anonymous requests to authenticated endpoints get 401.
//   2. Protected pages redirect to login when unauthenticated.
//
// These are negative tests (the auth layer SHOULD block) — they
// complement the persona specs that prove the auth layer ALLOWS the
// admin through.
import { test, expect } from "@playwright/test";

test.describe("RBAC protection", () => {
  test("anonymous GET /api/employees returns 401", async ({ request }) => {
    const r = await request.get("/api/employees", { failOnStatusCode: false });
    expect([401, 403]).toContain(r.status());
  });

  test("anonymous GET /api/properties returns 401", async ({ request }) => {
    const r = await request.get("/api/properties", { failOnStatusCode: false });
    expect([401, 403]).toContain(r.status());
  });

  test("anonymous GET /api/exec-dashboard/overview returns 401", async ({ request }) => {
    // requireExec(scope) protects this — without a session, it must not
    // leak even the shape of the response.
    const r = await request.get("/api/exec-dashboard/overview", { failOnStatusCode: false });
    expect([401, 403]).toContain(r.status());
  });

  test("anonymous visit to /employees redirects to login", async ({ page }) => {
    await page.goto("/employees");
    await page.waitForLoadState("networkidle");
    // SPA may redirect to '/' (login) or '/login' — both are fine; what
    // matters is we don't land on the employees page.
    await expect(page).toHaveURL(/\/$|\/login/);
  });
});
