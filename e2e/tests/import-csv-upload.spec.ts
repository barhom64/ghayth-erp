// Generic import — CSV file-upload UI test (#1594 Phase 6 "upload").
//
// Proves the operator can upload a CSV file (not only paste JSON) and have it
// parsed into rows in the browser, feeding the existing preview/confirm/rollback
// import pipeline. Upload + parse is the piece that was missing from the UI.

import { test, expect } from "@playwright/test";
import { login } from "./_helpers/login";

test.describe("Generic import — CSV upload", () => {
  test("uploading a CSV populates the rows for preview", async ({ page }) => {
    await login(page);
    await page.goto("/admin/data-import");

    await expect(page.getByText("صفوف البيانات (CSV أو JSON)")).toBeVisible();

    // Upload a tiny CSV via the hidden file input.
    const csv = "name,classification\nعميل الاستيراد,regular\n";
    await page.setInputFiles('input[type="file"]', {
      name: "clients.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });

    // The parsed rows land in the JSON textarea for review.
    const textarea = page.locator("textarea");
    await expect(textarea).toContainText("عميل الاستيراد");
    await expect(textarea).toContainText("classification");
  });
});
