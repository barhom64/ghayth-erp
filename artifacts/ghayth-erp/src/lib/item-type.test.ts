/**
 * item-type — نوع الصنف (توجيه إبراهيم «د»: تمييز الخدمة عن المنتج).
 *
 * المصدر الموحّد الذي تقرأه شاشة إنشاء المنتج (إظهار حقول المخزون من عدمه)
 * ومنتقي المنتج (استبعاد غير المخزني لحركات المستودع). المنطق المخزني يجب أن
 * يطابق `NON_STOCK_ITEM_TYPES` في الخلفية (warehouse.ts) حرفيًّا.
 */
import { describe, it, expect } from "vitest";
import { ITEM_TYPES, ITEM_TYPE_LABEL, NON_STOCK_ITEM_TYPES, isStockItem } from "./item-type";

describe("isStockItem (D-1)", () => {
  it("treats product and consumable as stock-tracked", () => {
    expect(isStockItem("product")).toBe(true);
    expect(isStockItem("consumable")).toBe(true);
  });

  it("treats service / asset / digital as NON-stock (no balance, no movement)", () => {
    expect(isStockItem("service")).toBe(false);
    expect(isStockItem("asset")).toBe(false);
    expect(isStockItem("digital")).toBe(false);
  });

  it("defaults a missing/blank type to product (stock-tracked) — matches backend default", () => {
    expect(isStockItem(null)).toBe(true);
    expect(isStockItem(undefined)).toBe(true);
    expect(isStockItem("")).toBe(true);
  });

  it("mirrors the backend NON_STOCK_ITEM_TYPES set exactly", () => {
    expect([...NON_STOCK_ITEM_TYPES].sort()).toEqual(["asset", "digital", "service"]);
    // every non-stock type is !isStockItem, and only those
    for (const t of ITEM_TYPES) {
      expect(isStockItem(t.value)).toBe(!NON_STOCK_ITEM_TYPES.has(t.value));
    }
  });
});

describe("ITEM_TYPES catalogue (D-1)", () => {
  it("lists the 5 canonical types with product first and Arabic labels", () => {
    expect(ITEM_TYPES.map((t) => t.value)).toEqual(["product", "service", "consumable", "asset", "digital"]);
    expect(ITEM_TYPES[0]).toEqual({ value: "product", label: "منتج" });
    expect(ITEM_TYPES.every((t) => t.label.trim().length > 0)).toBe(true);
  });

  it("exposes a value→label map consistent with the list (service = خدمة)", () => {
    expect(ITEM_TYPE_LABEL.product).toBe("منتج");
    expect(ITEM_TYPE_LABEL.service).toBe("خدمة");
    expect(Object.keys(ITEM_TYPE_LABEL).sort()).toEqual(ITEM_TYPES.map((t) => t.value).sort());
  });
});
