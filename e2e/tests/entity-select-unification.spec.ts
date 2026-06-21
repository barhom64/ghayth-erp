// Behavioral coverage for the entity-select unification (#2741–#2773).
//
// The migration replaced raw native <select> / shadcn <Select> dropdowns
// across 8 tracks with the unified searchable component
// (components/shared/entity-selects.tsx → SearchableSelectField, built on
// cmdk). Static checks (tsc + source smoke tests) proved the code compiles
// and wires the right component, but could NOT prove the component actually
// MOUNTS and OPENS at runtime on the real pages. This spec closes exactly
// that gap.
//
// What we assert (per migrated CREATE page):
//   1. the page loads (sidebar sentinel) — no crash on mount,
//   2. the unified searchable trigger renders ([role=combobox] with the
//      expected placeholder),
//   3. clicking it OPENS the cmdk search popover ([cmdk-input] visible) —
//      this uniquely distinguishes the unified searchable select from a raw
//      shadcn <Select> (which has no search box) and proves the Popover +
//      Command render without a runtime error,
//   4. zero page/console runtime errors across the whole walk.
//
// What we deliberately DON'T assert: option contents / business data. The
// e2e DB is the test-seed admin lane (no clients/units/buildings), so the
// list may be empty — opening the search box is the runtime contract, not
// the row count. Mirrors the existing persona specs' "layout, not data" rule.
import { test, expect, type Page } from "@playwright/test";
import { login, captureErrors } from "./_helpers/login";

// Each entry: a migrated create page + the placeholder text of a unified
// entity-select rendered on it. Placeholders are the exact strings passed in
// the page source (or the component default).
const CASES: { path: string; trigger: RegExp; label: string }[] = [
  { path: "/crm/create", trigger: /بدون عميل/, label: "ClientSelect (CRM)" },
  { path: "/properties/create", trigger: /اختر مبنى/, label: "BuildingSelect (properties)" },
  { path: "/properties/maintenance/create", trigger: /اختر الوحدة/, label: "UnitSelect (maintenance)" },
  { path: "/hr/recruitment/create", trigger: /اختر القسم/, label: "Department search (recruitment)" },
];

test.describe("entity-select unification — runtime mount & open", () => {
  test("each migrated create page mounts its unified searchable select and opens the search popover", async ({ page }) => {
    const { pageErrors, consoleErrors } = captureErrors(page);
    await login(page);

    for (const c of CASES) {
      await page.goto(c.path);
      await page.waitForLoadState("networkidle");

      // Page mounted without crashing.
      await expect(
        page.locator('[data-sidebar], nav, aside').first(),
        `${c.label}: page shell did not render`,
      ).toBeVisible({ timeout: 10_000 });

      // The unified searchable trigger is present (role=combobox carrying the
      // expected placeholder text).
      const combo = page.locator('[role="combobox"]').filter({ hasText: c.trigger }).first();
      await expect(combo, `${c.label}: unified select trigger not found`).toBeVisible({ timeout: 10_000 });

      // Opening it must render the cmdk search box — the runtime proof that
      // the unified component (Popover + Command) works, not a raw <Select>.
      await combo.click();
      await expect(
        page.locator('[cmdk-input]').first(),
        `${c.label}: search popover did not open`,
      ).toBeVisible({ timeout: 5_000 });

      // Close before the next page.
      await page.keyboard.press("Escape");
    }

    expect(pageErrors, `pageerror: ${pageErrors.join("\n")}`).toHaveLength(0);
    expect(consoleErrors, `console.error: ${consoleErrors.join("\n")}`).toHaveLength(0);
  });
});
