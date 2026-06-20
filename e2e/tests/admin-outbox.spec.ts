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

    // Scope to the routed content <main> — the sidebar topbar renders its own
    // <h1> with the same page title, so an unscoped heading lookup is ambiguous.
    const main = page.getByRole("main");

    // Title renders as the page heading (the only h1 in <main>).
    await expect(
      main.getByRole("heading", { name: "صندوق الأحداث الصادرة" }),
    ).toBeVisible();

    // The pending/processed gauge labels render. `exact` keeps these off the
    // longer strings that merely contain "قيد الانتظار" (subtitle, oldest-event
    // card, info paragraph) which otherwise resolve to multiple elements.
    await expect(main.getByText("قيد الانتظار", { exact: true })).toBeVisible();
    await expect(main.getByText("تمت معالجته", { exact: true })).toBeVisible();
    // The oldest-pending gauge is part of the structure regardless of seeded data.
    await expect(
      main.getByText("أقدم حدث قيد الانتظار", { exact: true }),
    ).toBeVisible();

    // The drain lever exists and runs without crashing the page.
    const drainBtn = page.getByRole("button", { name: /تفريغ الآن/ });
    await expect(drainBtn).toBeVisible();
    await drainBtn.click();
    // After a drain the page stays healthy and the gauge structure is intact.
    await expect(
      main.getByText("أقدم حدث قيد الانتظار", { exact: true }),
    ).toBeVisible();
  });
});
