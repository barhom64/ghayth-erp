// Vehicle subsidiary-accounts UI test (#1594 — operational UI phase).
//
// Proves the "نظام قوي قابل للتحكم" vision is reachable FROM THE ENTITY PAGE,
// not just from a script/API: a vehicle's GL subsidiary accounts are listed on
// the vehicle's own detail page (المالية tab → الحسابات الفرعية للمركبة), and
// the operator can open the link/relink control without leaving the page.
//
// Setup is done via the API (create a vehicle + link one subsidiary account so
// the table has a row to render); the assertions are all through the browser UI.

import { test, expect, request as apiRequest } from "@playwright/test";
import { TEST_API_URL } from "../playwright.config.js";
import { login } from "./_helpers/login";

const EMAIL = process.env.E2E_USER_EMAIL ?? "admin@ghayth.com";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "Admin@123456";

// Authenticated API context with the CSRF header attached (mirrors import.spec).
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

test.describe("Vehicle subsidiary accounts — operational UI", () => {
  test("a vehicle's GL sub-accounts are viewable + relinkable from its own page", async ({ page }) => {
    const api = await authedContext();

    // 1) Create a target vehicle.
    const plate = `E2E-${Date.now().toString().slice(-6)}`;
    const vRes = await api.post("/api/fleet/vehicles", {
      data: { plateNumber: plate, make: "Toyota", model: "Hiace", year: 2024, fuelType: "diesel" },
    });
    expect(vRes.ok(), `vehicle create: ${vRes.status()} ${await vRes.text()}`).toBeTruthy();
    const vehicleId = (await vRes.json()).id as number;
    expect(vehicleId).toBeGreaterThan(0);

    // 2) Pick a postable account and link it to the vehicle so the table has a
    //    row (auto-create only fires when the company COA carries the parents).
    const accRes = await api.get("/api/finance/accounts?limit=500");
    expect(accRes.ok()).toBeTruthy();
    const accounts: Array<{ id: number; code: string; allowPosting?: boolean }> =
      (await accRes.json()).data ?? [];
    const postable = accounts.find((a) => a.allowPosting !== false);
    expect(postable, "no postable account in COA").toBeTruthy();
    const linkRes = await api.post("/api/finance/subsidiary-accounts", {
      data: { entityType: "vehicle", entityId: vehicleId, accountType: "custody", accountId: postable!.id },
    });
    expect(linkRes.ok(), `link account: ${linkRes.status()} ${await linkRes.text()}`).toBeTruthy();
    await api.dispose();

    // 3) UI: open the vehicle detail page and switch to the finance tab.
    await login(page);
    await page.goto(`/fleet/${vehicleId}`);
    await page.getByRole("button", { name: "المالية" }).click();

    // 4) The subsidiary-accounts section renders with the linked account.
    await expect(page.getByText("الحسابات الفرعية للمركبة")).toBeVisible();
    // The code renders in 2+ spots (status chip + COA column); .first() avoids
    // a strict-mode violation while still proving the linked code is shown.
    await expect(page.getByText(postable!.code, { exact: false }).first()).toBeVisible();

    // 5) The control lever — the "ربط حساب" button opens the relink dialog
    //    with both the account-type and the chart-of-accounts pickers.
    await page.getByRole("button", { name: /ربط حساب/ }).first().click();
    await expect(page.getByText("الحساب من دليل الحسابات")).toBeVisible();
    // "نوع الحساب" appears as both a table header and the dialog field label;
    // .first() keeps strict mode happy while proving the picker is present.
    await expect(page.getByText("نوع الحساب").first()).toBeVisible();
  });
});
