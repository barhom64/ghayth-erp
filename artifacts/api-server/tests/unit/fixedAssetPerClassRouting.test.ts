// Constitution Rule 3 (Ledger safety) — the per-class booking routing decides
// which account every fixed-asset journal line lands on, so it carries an
// assertion. This unit test pins the routing logic; the companion
// fixedAssetPerClassBooking.dynamic.test.ts asserts the posted journal_lines
// against a live DB.
import { describe, it, expect } from "vitest";
import {
  resolveAssetAccounts,
  ASSET_CLASS_ACCOUNTS,
} from "../../src/lib/finance/assetClassAccounts.js";

describe("per-class fixed-asset booking — account routing", () => {
  it("routes each recognised category to its own cost / dep / accum accounts", () => {
    expect(resolveAssetAccounts({ category: "سيارات الشركة" })).toEqual({ asset: "1210", dep: "5710", accDep: "1211" });
    expect(resolveAssetAccounts({ category: "أثاث ومفروشات" })).toEqual({ asset: "1220", dep: "5720", accDep: "1221" });
    expect(resolveAssetAccounts({ category: "أجهزة حاسب آلي" })).toEqual({ asset: "1230", dep: "5730", accDep: "1231" });
    expect(resolveAssetAccounts({ category: "مبنى الإدارة" })).toEqual({ asset: "1240", dep: "5740", accDep: "1241" });
    // English categories resolve too
    expect(resolveAssetAccounts({ category: "Vehicles / Fleet" })).toEqual({ asset: "1210", dep: "5710", accDep: "1211" });
  });

  it("falls back to the generic 'other' class (postable) for unmatched / empty category", () => {
    expect(resolveAssetAccounts({ category: "أصول متنوعة لا تطابق فئة" })).toEqual({ asset: "1280", dep: "5790", accDep: "1290" });
    expect(resolveAssetAccounts({ category: null })).toEqual({ asset: "1280", dep: "5790", accDep: "1290" });
    expect(resolveAssetAccounts({})).toEqual({ asset: "1280", dep: "5790", accDep: "1290" });
  });

  it("an explicit per-asset account wins over the category default", () => {
    expect(resolveAssetAccounts({
      category: "سيارات",
      assetAccountCode: "1215",
      depreciationAccountCode: "5715",
      accDepreciationAccountCode: "1216",
    })).toEqual({ asset: "1215", dep: "5715", accDep: "1216" });
  });

  it("treats the generic schema defaults as 'unset' → routes by class", () => {
    // legacy absent defaults (1500/6100/1590)
    expect(resolveAssetAccounts({ category: "سيارات", assetAccountCode: "1500", depreciationAccountCode: "6100", accDepreciationAccountCode: "1590" }))
      .toEqual({ asset: "1210", dep: "5710", accDep: "1211" });
    // main's current generic defaults (1280/5790/1290)
    expect(resolveAssetAccounts({ category: "سيارات", assetAccountCode: "1280", depreciationAccountCode: "5790", accDepreciationAccountCode: "1290" }))
      .toEqual({ asset: "1210", dep: "5710", accDep: "1211" });
  });

  it("every class maps to distinct 4-digit account codes (no collisions across legs)", () => {
    const all = Object.values(ASSET_CLASS_ACCOUNTS).flatMap((c) => [c.asset, c.dep, c.accDep]);
    expect(all.every((c) => /^\d{4}$/.test(c))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
  });
});
