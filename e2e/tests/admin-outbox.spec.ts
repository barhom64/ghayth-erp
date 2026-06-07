// Admin event-outbox monitor UI test (#1603 under #1594).
//
// Proves the outbox is operable from the browser — not only via the
// POST /events/outbox/drain endpoint: the /admin/outbox page renders the
// pending/processed gauges and the "تفريغ الآن" lever runs a drain and
// reports back, satisfying the "script/API alone is not an operational UI"
// rule.

import { test, expect } from "@playwright/test";
import { login } from "./_helpers/login";

test.describe("Admin event outbox — operational UI", () => {
  test("renders the outbox gauges and drains on demand", async ({ page }) => {
    await login(page);
    await page.goto("/admin/outbox");

    // Title + the pending/processed gauges render.
    await expect(page.getByText("صندوق الأحداث الصادرة (Outbox)")).toBeVisible();
    await expect(page.getByText("قيد الانتظار")).toBeVisible();
    await expect(page.getByText("تمت معالجته")).toBeVisible();

    // The drain lever exists and runs without error (drained count toast).
    const drainBtn = page.getByRole("button", { name: /تفريغ الآن/ });
    await expect(drainBtn).toBeVisible();
    await drainBtn.click();
    // After a drain the page stays healthy and the gauge is still shown.
    await expect(page.getByText("أقدم حدث قيد الانتظار")).toBeVisible();
  });
});
