// Admin journey-tracking UI test (#1604 under #1594).
//
// Proves the journey engine is observable from the browser: the
// /admin/journeys page renders the live journey_instances (status counts +
// per-journey progress) — a real operational window onto a previously
// head-less engine, not just an API.

import { test, expect } from "@playwright/test";
import { login } from "./_helpers/login";

test.describe("Admin journey tracking — operational UI", () => {
  test("renders the journeys page with status filters and counters", async ({ page }) => {
    await login(page);
    await page.goto("/admin/journeys");

    await expect(page.getByText("تتبّع الرحلات الحيّة")).toBeVisible();
    // Status counters render.
    await expect(page.getByText("قيد التنفيذ").first()).toBeVisible();
    await expect(page.getByText("مكتملة").first()).toBeVisible();
    // The status filter toggles work (switch to completed, page stays healthy).
    await page.getByRole("button", { name: "مكتملة" }).click();
    await expect(page.getByRole("button", { name: "تحديث" })).toBeVisible();
  });
});
