import { describe, it, expect } from "vitest";
import { assetDepreciationProfile, type DepreciationAssetRow } from "../../src/lib/engines/recurringPostingEngine.js";

// Equivalence proof (spec §6 step 1): the asset_depreciation profile must
// reproduce monthlyAutoDepreciation's amount formula, journal lines, and
// idempotency key EXACTLY before the cron is migrated onto the engine. Pure
// functions — no DB, no mocks.

const base: DepreciationAssetRow = {
  id: 1, purchaseCost: 0, salvageValue: 0, usefulLifeYears: 0, accumulatedDepreciation: 0,
};

describe("assetDepreciationProfile.amountFor — matches monthlyAutoDepreciation", () => {
  it("straight-line: (cost − salvage) / (life × 12)", () => {
    expect(assetDepreciationProfile.amountFor({ ...base, purchaseCost: 120000, salvageValue: 0, usefulLifeYears: 10 }))
      .toBe(1000); // 120000 / 120
  });

  it("straight-line honors salvage in the numerator", () => {
    expect(assetDepreciationProfile.amountFor({ ...base, purchaseCost: 50000, salvageValue: 2000, usefulLifeYears: 4 }))
      .toBe(1000); // (50000−2000)/48
  });

  it("declining-balance: currentBookValue × (2 / life / 12)", () => {
    expect(assetDepreciationProfile.amountFor({
      ...base, purchaseCost: 100000, salvageValue: 0, usefulLifeYears: 5,
      currentBookValue: 60000, accumulatedDepreciation: 40000, depreciationMethod: "declining_balance",
    })).toBe(2000); // 60000 × (2/5/12)
  });

  it("never depreciates below salvage (caps to book − salvage)", () => {
    expect(assetDepreciationProfile.amountFor({
      ...base, purchaseCost: 10000, salvageValue: 9000, usefulLifeYears: 1,
      currentBookValue: 9050, accumulatedDepreciation: 950,
    })).toBe(50); // straight monthly 83.33 would breach salvage → cap to 9050−9000
  });

  it("invalid / zero useful life ⇒ 0 (asset skipped)", () => {
    expect(assetDepreciationProfile.amountFor({ ...base, purchaseCost: 1000, usefulLifeYears: 0 })).toBe(0);
  });
});

describe("assetDepreciationProfile.journalTemplate — DR depreciation / CR accumulated", () => {
  it("default fallbacks 5790 / 1290, assetId on both legs, balanced", () => {
    const lines = assetDepreciationProfile.journalTemplate({ ...base, id: 7 }, 1000);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ accountCode: "5790", debit: 1000, credit: 0, assetId: 7 });
    expect(lines[1]).toMatchObject({ accountCode: "1290", debit: 0, credit: 1000, assetId: 7 });
    const sumD = lines.reduce((s, l) => s + l.debit, 0);
    const sumC = lines.reduce((s, l) => s + l.credit, 0);
    expect(sumD).toBe(sumC);
  });

  it("honors the asset's own depreciation/accumulated account overrides", () => {
    const lines = assetDepreciationProfile.journalTemplate(
      { ...base, id: 7, depreciationAccountCode: "6100", accDepreciationAccountCode: "1590" }, 1000,
    );
    expect(lines[0].accountCode).toBe("6100");
    expect(lines[1].accountCode).toBe("1590");
  });
});

describe("assetDepreciationProfile.sourceKey — matches the cron idempotency key", () => {
  it("finance:depreciation:{assetId}:{period}", () => {
    expect(assetDepreciationProfile.sourceKey({ ...base, id: 7 }, "2026-06"))
      .toBe("finance:depreciation:7:2026-06");
  });
});
