import { describe, it, expect } from "vitest";
import {
  planRecurringPostings,
  assetDepreciationProfile,
  type DepreciationAssetRow,
} from "../../src/lib/engines/recurringPostingEngine.js";

// Engine core: planRecurringPostings — the idempotent, pure planner every
// recurring cron handler consumes. Verified through the depreciation profile.

const base: DepreciationAssetRow = {
  id: 0, purchaseCost: 0, salvageValue: 0, usefulLifeYears: 0, accumulatedDepreciation: 0,
};
const period = "2026-06";

// straight-line, 1000/mo each
const assetA: DepreciationAssetRow = { ...base, id: 1, purchaseCost: 120000, usefulLifeYears: 10 };
const assetB: DepreciationAssetRow = { ...base, id: 2, purchaseCost: 120000, usefulLifeYears: 10 };
const assetZero: DepreciationAssetRow = { ...base, id: 3, purchaseCost: 1000, usefulLifeYears: 0 }; // amount 0

describe("planRecurringPostings — idempotent planning core", () => {
  it("plans a posting per eligible row with the profile's key/sourceKey/amount/lines", () => {
    const planned = planRecurringPostings(assetDepreciationProfile, [assetA], period, new Set());
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({
      sourceKey: "finance:depreciation:1:2026-06",
      sourceType: "asset_depreciation",
      entityId: 1,
      amount: 1000,
    });
    expect(planned[0].lines).toHaveLength(2);
    expect(planned[0].lines[0]).toMatchObject({ accountCode: "5790", debit: 1000, credit: 0, assetId: 1 });
    expect(planned[0].lines[1]).toMatchObject({ accountCode: "1290", debit: 0, credit: 1000, assetId: 1 });
  });

  it("skips rows whose sourceKey is already posted (idempotency)", () => {
    const alreadyPosted = new Set(["finance:depreciation:2:2026-06"]);
    const planned = planRecurringPostings(assetDepreciationProfile, [assetA, assetB], period, alreadyPosted);
    expect(planned.map(p => p.entityId)).toEqual([1]); // B skipped, A kept
  });

  it("skips rows whose amount is <= 0", () => {
    const planned = planRecurringPostings(assetDepreciationProfile, [assetA, assetZero], period, new Set());
    expect(planned.map(p => p.entityId)).toEqual([1]); // zero-amount asset skipped
  });

  it("returns empty when every row is already posted or zero", () => {
    const allPosted = new Set(["finance:depreciation:1:2026-06"]);
    expect(planRecurringPostings(assetDepreciationProfile, [assetA, assetZero], period, allPosted)).toEqual([]);
  });
});
