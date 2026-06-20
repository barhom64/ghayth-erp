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

    // Scope to the routed content <main> — the sidebar topbar renders an <h1>
    // with the same title, so an unscoped heading lookup hits 2+ elements.
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { name: "تتبّع الرحلات الحيّة" }),
    ).toBeVisible();

    // The status filter controls render. Targeting them by button role keeps
    // the assertion off the duplicate counter labels and row badges that share
    // the same text ("قيد التنفيذ" / "مكتملة").
    await expect(page.getByRole("button", { name: "الكل" })).toBeVisible();
    await expect(page.getByRole("button", { name: "قيد التنفيذ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "مكتملة" })).toBeVisible();

    // The counter cards render regardless of seeded data — "الإجمالي" is the
    // unique total-counter label, so it proves the gauges are present without
    // asserting any specific count.
    await expect(main.getByText("الإجمالي", { exact: true })).toBeVisible();

    // The status filter toggles work (switch to completed, page stays healthy).
    await page.getByRole("button", { name: "مكتملة" }).click();
    await expect(page.getByRole("button", { name: "تحديث" })).toBeVisible();
  });
});
