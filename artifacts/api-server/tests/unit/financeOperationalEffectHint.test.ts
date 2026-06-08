import { describe, it, expect } from "vitest";
import { deriveSpecializedAccount, deriveOperationalEffectHint } from "../../src/lib/financeSpecializedAccount.js";

describe("deriveOperationalEffectHint (#1715 owner feedback)", () => {
  const hintFor = (targetType: string, itemType?: string) =>
    deriveOperationalEffectHint({ targetType, spec: deriveSpecializedAccount({ targetType, itemType }) });

  it("vehicle_maintenance → ticket + odometer effect + preventive future task", () => {
    const h = hintFor("vehicle_maintenance");
    expect(h.entityLabel).toBe("صيانة مركبة");
    expect(h.effect).toMatch(/تذكرة صيانة مركبة/);
    expect(h.futureTask).toMatch(/الصيانة الوقائية/);
  });

  it("property_maintenance → property ticket effect, no future task", () => {
    const h = hintFor("property_maintenance");
    expect(h.effect).toMatch(/صيانة عقارية/);
    expect(h.futureTask).toBeNull();
  });

  it("fixed_asset → capitalization effect + depreciation future task", () => {
    const h = hintFor("fixed_asset");
    expect(h.effect).toMatch(/يُرسمَل كأصل ثابت/);
    expect(h.futureTask).toMatch(/الإهلاك الشهري/);
  });

  it("asset itemType on a vehicle target still capitalizes (item kind wins)", () => {
    const h = hintFor("vehicle", "asset");
    expect(h.effect).toMatch(/يُرسمَل كأصل ثابت/);
  });

  it("plain vehicle → cost-report effect, no future task", () => {
    const h = hintFor("vehicle");
    expect(h.effect).toMatch(/تقرير تكلفة المركبة/);
    expect(h.futureTask).toBeNull();
  });

  it("none → no entity/effect", () => {
    const h = hintFor("none");
    expect(h.entityLabel).toBeNull();
    expect(h.effect).toBeNull();
  });
});
