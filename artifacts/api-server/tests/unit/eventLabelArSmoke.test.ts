import { describe, it, expect } from "vitest";
import { eventLabelAr, EVENT_CATALOG } from "../../src/lib/eventCatalog.js";

const isArabic = (s: string) => /[؀-ۿ]/.test(s);

describe("eventLabelAr — Arabic activity-feed labels", () => {
  it("returns the catalog Arabic label for a known event", () => {
    const known = EVENT_CATALOG.find((e) => isArabic(e.label));
    expect(known).toBeTruthy();
    expect(eventLabelAr(known!.name)).toBe(known!.label);
  });

  it("derives an Arabic verb from the last segment for uncatalogued actions", () => {
    expect(eventLabelAr("something.created")).toBe("إنشاء");
    expect(eventLabelAr("widget.approved")).toBe("اعتماد");
    expect(eventLabelAr("x.rejected")).toBe("رفض");
    expect(eventLabelAr("y.returned")).toBe("إرجاع");
  });

  it("never returns blank (fallbacks)", () => {
    expect(eventLabelAr("")).toBe("إجراء");
    expect(eventLabelAr(null)).toBe("إجراء");
    expect(eventLabelAr(undefined)).toBe("إجراء");
    expect(eventLabelAr("totally.unknown.thing")).toBe("totally.unknown.thing");
  });
});
