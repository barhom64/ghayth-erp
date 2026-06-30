/**
 * priority-labels — priorityLabel / priorityBadgeClass tests. Batch 19 (tail
 * sweep) of the FE behavioral-coverage effort (ghayth-review documented gap).
 *
 * The four-level priority scale shared by tasks / linked-tasks / requests /
 * tickets. priorityLabel falls back to the raw key (typo surfaces), while
 * priorityBadgeClass falls back to a NEUTRAL slate for both nullish and
 * uncatalogued input — so an unknown priority never renders an empty class
 * string. Test-only — zero production code.
 */
import { describe, it, expect } from "vitest";
import { priorityLabel, priorityBadgeClass } from "./priority-labels";

const NEUTRAL = "bg-slate-100 text-slate-700";

describe("priorityLabel", () => {
  it("maps the four levels to Arabic", () => {
    expect(priorityLabel("critical")).toBe("حرجة");
    expect(priorityLabel("high")).toBe("عالية");
    expect(priorityLabel("medium")).toBe("متوسطة");
    expect(priorityLabel("low")).toBe("منخفضة");
  });

  it("returns '' for nullish and the raw key for an unknown priority", () => {
    expect(priorityLabel(null)).toBe("");
    expect(priorityLabel("urgent")).toBe("urgent");
  });
});

describe("priorityBadgeClass", () => {
  it("returns a distinct tonal class per known level", () => {
    expect(priorityBadgeClass("critical")).toContain("red");
    expect(priorityBadgeClass("high")).toContain("rose");
    expect(priorityBadgeClass("low")).toContain("emerald");
  });

  it("falls back to a neutral slate for nullish and unknown priorities", () => {
    expect(priorityBadgeClass(null)).toBe(NEUTRAL);
    expect(priorityBadgeClass("urgent")).toBe(NEUTRAL);
  });
});
