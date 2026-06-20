// Admin infra-alert paging settings UI test (#849, follows #848's backend gate).
//
// #848 proved the infra-alert paging config saved through the API route
// (PUT /api/intelligence/alerts/infra/settings) reaches the cron. This spec
// proves the actual admin SCREEN (/admin/infra-alerts) is operable: it
// renders the "إعدادات تنبيه المناوبين" card, loads the current
// severityThreshold + cooldown, validates the cooldown field client-side,
// saves through that route, and persists across a reload. A regression in the
// page (broken fetch path, perma-disabled save button, broken validation)
// would otherwise silently leave admins unable to change who gets paged.

import { test, expect } from "@playwright/test";
import { login } from "./_helpers/login";

// Mirrors INFRA_CRITICAL_DIGEST_(MIN|MAX)_COOLDOWN_MINUTES in
// artifacts/api-server/src/lib/infraAlerts.ts (1..1440). The page renders the
// boundary error "أدخل عددًا صحيحًا بين {min} و{max}." from the limits the
// settings endpoint returns, so we match the prefix to stay robust to them.
const BOUNDARY_ERROR = /أدخل عددًا صحيحًا بين/;

test.describe("Admin infra-alert paging settings — operational UI", () => {
  test("loads, validates, saves, and persists the paging config", async ({ page }) => {
    await login(page);
    await page.goto("/admin/infra-alerts");

    // The settings card and its controls render.
    await expect(page.getByText("إعدادات تنبيه المناوبين")).toBeVisible();
    const threshold = page.locator("#infra-threshold");
    const cooldown = page.locator("#infra-cooldown");
    await expect(threshold).toBeVisible();
    await expect(cooldown).toBeVisible();

    // Current settings have loaded: the cooldown input is enabled (it's
    // disabled while settingsLoading) and shows a non-empty integer value.
    await expect(cooldown).toBeEnabled();
    const current = await cooldown.inputValue();
    expect(current).toMatch(/^\d+$/);
    // The threshold trigger shows one of the configured labels.
    await expect(threshold).toContainText(/حرج فقط|تحذير فأعلى|الكل/);

    const saveBtn = page.getByRole("button", { name: /حفظ الإعدادات/ });
    await expect(saveBtn).toBeVisible();
    // Untouched (not dirty) → save is disabled.
    await expect(saveBtn).toBeDisabled();

    // Pick a distinct valid value within 1..1440 so re-runs flip cleanly.
    const newCooldown = current === "60" ? "90" : "60";
    await cooldown.fill(newCooldown);

    // A valid, dirty change enables save and surfaces no boundary error.
    await expect(page.getByText(BOUNDARY_ERROR)).toHaveCount(0);
    await expect(saveBtn).toBeEnabled();

    await saveBtn.click();
    // Save through PUT /intelligence/alerts/infra/settings succeeds (toast).
    await expect(page.getByText("تم حفظ إعدادات التنبيه للشركة").first()).toBeVisible();

    // Persistence: reload and confirm the saved value comes back from the API.
    await page.goto("/admin/infra-alerts");
    await expect(page.locator("#infra-cooldown")).toBeEnabled();
    await expect(page.locator("#infra-cooldown")).toHaveValue(newCooldown);

    // Client-side boundary validation — above the max (1440).
    const cooldown2 = page.locator("#infra-cooldown");
    await cooldown2.fill("5000");
    await expect(page.getByText(BOUNDARY_ERROR)).toBeVisible();
    await expect(page.getByRole("button", { name: /حفظ الإعدادات/ })).toBeDisabled();

    // ...and below the min (1).
    await cooldown2.fill("0");
    await expect(page.getByText(BOUNDARY_ERROR)).toBeVisible();
    await expect(page.getByRole("button", { name: /حفظ الإعدادات/ })).toBeDisabled();
  });

  // #853 — the "إعادة إلى الافتراضي للنظام" (reset to system default) button
  // only renders when the company has its OWN override (hasCompanyOverride). It
  // calls DELETE /api/intelligence/alerts/infra/settings to drop that override
  // so the company falls back to the system default. A regression here would
  // silently strand a company on a stale override with no UI path back, so this
  // proves the full round-trip: establish an override → button appears → reset →
  // success toast → reload shows the system default and the button is gone.
  test("resets a company override back to the system default", async ({ page }) => {
    await login(page);
    await page.goto("/admin/infra-alerts");

    await expect(page.getByText("إعدادات تنبيه المناوبين")).toBeVisible();
    const cooldown = page.locator("#infra-cooldown");
    await expect(cooldown).toBeEnabled();

    // Establish a company override so the reset button is guaranteed to appear.
    // Pick a value distinct from the current one so the change is dirty + saves.
    const current = await cooldown.inputValue();
    const overrideVal = current === "75" ? "45" : "75";
    await cooldown.fill(overrideVal);
    const saveBtn = page.getByRole("button", { name: /حفظ الإعدادات/ });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(page.getByText("تم حفظ إعدادات التنبيه للشركة").first()).toBeVisible();

    // The company now has an override → the reset button renders, and the info
    // box reveals the system-default cooldown this company will fall back to.
    const resetBtn = page.getByRole("button", { name: /إعادة إلى الافتراضي للنظام/ });
    await expect(resetBtn).toBeVisible();
    const infoText = await page.getByText(/الإعداد الافتراضي للنظام/).innerText();
    const match = infoText.match(/كل\s+(\d+)\s+دقيقة/);
    expect(match, `couldn't parse system-default cooldown from: ${infoText}`).not.toBeNull();
    const systemCooldown = match![1];

    // Reset → DELETE the override → success toast.
    await resetBtn.click();
    await expect(page.getByText("تمت إعادة الإعداد إلى الافتراضي للنظام").first()).toBeVisible();

    // Persistence: after reload the company has no override anymore — the reset
    // button is gone, the info box flips to "using the system default", and the
    // cooldown input falls back to the system-default value.
    await page.goto("/admin/infra-alerts");
    await expect(page.locator("#infra-cooldown")).toBeEnabled();
    await expect(page.getByRole("button", { name: /إعادة إلى الافتراضي للنظام/ })).toHaveCount(0);
    await expect(page.getByText(/هذه الشركة تستخدم الإعداد الافتراضي للنظام/)).toBeVisible();
    await expect(page.locator("#infra-cooldown")).toHaveValue(systemCooldown);
  });
});
