// Behavioral coverage for the entity-select unification (#2741–#2773).
//
// The migration moved ~26 dropdowns across 8 tracks onto ONE unified
// searchable component (components/shared/entity-selects.tsx →
// SearchableSelectField, built on cmdk + a Radix Popover). Static checks (tsc
// + source smoke tests) proved the code compiles and wires that component,
// but could NOT prove the component MOUNTS and OPENS at runtime. This spec
// closes that gap by exercising the unified component's runtime open contract.
//
// Harness: the vehicle finance tab's "ربط حساب" dialog renders the unified
// AccountSelect (the SAME buildEntitySelect engine every migrated select uses)
// and — unlike seedless create pages — is render-guaranteed once a vehicle is
// seeded via the API (mirrors vehicle-subsidiary-accounts.spec, which proves
// the dialog renders; here we go one step further and prove the picker OPENS).
//
// Contract: clicking the unified picker opens a cmdk search box ([cmdk-input])
// — the runtime proof the Popover + Command render without error. A raw shadcn
// <Select> would open a listbox instead, so we click the dialog's comboboxes
// until the cmdk box appears. We do NOT assert option contents.
import { test, expect, request as apiRequest, type Page } from "@playwright/test";
import { TEST_API_URL } from "../playwright.config.js";
import { login } from "./_helpers/login";

const EMAIL = process.env.E2E_USER_EMAIL ?? "admin@ghayth.com";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "Admin@123456";

// Authenticated API context with the CSRF header (mirrors vehicle-subsidiary-accounts.spec).
async function authedContext() {
  const ctx = await apiRequest.newContext({ baseURL: TEST_API_URL });
  const loginRes = await ctx.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  if (!loginRes.ok()) throw new Error(`API login failed: ${loginRes.status()} ${await loginRes.text()}`);
  const state = await ctx.storageState();
  const csrf = state.cookies.find((c) => c.name === "erp_csrf")?.value;
  if (!csrf) throw new Error("Login did not set erp_csrf cookie");
  await ctx.dispose();
  return apiRequest.newContext({
    baseURL: TEST_API_URL,
    storageState: state,
    extraHTTPHeaders: { "x-csrf-token": csrf },
  });
}

// Click the dialog's comboboxes until one opens a cmdk search box (the unified
// component). cmdk renders in a body-level portal, so the input is matched
// page-scoped, not within the dialog subtree.
async function aDialogComboboxOpensCmdk(page: Page, dialog: ReturnType<Page["locator"]>): Promise<boolean> {
  const combos = dialog.locator('[role="combobox"]');
  const n = await combos.count();
  for (let i = 0; i < n; i++) {
    await combos.nth(i).click().catch(() => {});
    const input = page.locator("[cmdk-input]").first();
    const opened = await input
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      // Prove the search box is functional (not just rendered): typing must
      // register in the cmdk input — this exercises the live filter path.
      await input.fill("بحث").catch(() => {});
      const value = await input.inputValue().catch(() => "");
      await page.keyboard.press("Escape").catch(() => {});
      return value === "بحث";
    }
    await page.keyboard.press("Escape").catch(() => {});
  }
  return false;
}

test.describe("entity-select unification — runtime mount & open", () => {
  test("the unified searchable picker mounts and opens its cmdk popover (vehicle account relink dialog)", async ({ page }) => {
    const api = await authedContext();

    // Seed a vehicle + link one subsidiary account so the finance tab + relink
    // dialog render deterministically (same setup the vehicle spec relies on).
    const plate = `E2E-ES-${Date.now().toString().slice(-6)}`;
    const vRes = await api.post("/api/fleet/vehicles", {
      data: { plateNumber: plate, make: "Toyota", model: "Hiace", year: 2024, fuelType: "diesel" },
    });
    expect(vRes.ok(), `vehicle create: ${vRes.status()} ${await vRes.text()}`).toBeTruthy();
    const vehicleId = (await vRes.json()).id as number;
    expect(vehicleId).toBeGreaterThan(0);

    const accRes = await api.get("/api/finance/accounts?limit=500");
    expect(accRes.ok()).toBeTruthy();
    const accounts: Array<{ id: number; allowPosting?: boolean }> = (await accRes.json()).data ?? [];
    const postable = accounts.find((a) => a.allowPosting !== false);
    expect(postable, "no postable account in COA").toBeTruthy();
    const linkRes = await api.post("/api/finance/subsidiary-accounts", {
      data: { entityType: "vehicle", entityId: vehicleId, accountType: "custody", accountId: postable!.id },
    });
    expect(linkRes.ok(), `link account: ${linkRes.status()} ${await linkRes.text()}`).toBeTruthy();
    await api.dispose();

    // UI: vehicle detail → finance tab → open the relink dialog.
    await login(page);
    await page.goto(`/fleet/${vehicleId}`);
    await page.getByRole("button", { name: "المالية", exact: true }).click();
    await expect(page.getByText("الحسابات الفرعية للمركبة")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /ربط حساب/ }).first().click();
    const dialog = page.locator('[role="dialog"]').last();
    await expect(dialog.getByText("الحساب من دليل الحسابات")).toBeVisible({ timeout: 10_000 });

    // The unified AccountSelect must open its cmdk search box on click.
    const opened = await aDialogComboboxOpensCmdk(page, dialog);
    expect(opened, "the unified account picker did not open a cmdk search popover").toBe(true);
  });
});
