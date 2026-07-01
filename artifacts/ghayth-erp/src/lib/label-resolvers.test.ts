/**
 * Thin label resolvers — combined tests. Batch 19 (tail sweep) of the FE
 * behavioral-coverage effort (ghayth-review documented gap).
 *
 * Four small `MAP[key] ?? fallback` resolvers grouped into one file (each is a
 * one-liner over a dictionary, not worth its own suite). They share one
 * contract — a known key returns its Arabic label, an unknown key falls back
 * visibly — plus a couple of anti-drift invariants worth pinning:
 *   - RBAC scope/action wording must not leak English.
 *   - pilgrim `overstayed` is "متجاوز" (not the old "متأخر") and `cancelled`
 *     is "ملغى" (not "ملغي") — the exact drift these modules were created to end.
 * Test-only — zero production code.
 */
import { describe, it, expect } from "vitest";
import { actionLabelAr, scopeLabelAr } from "./permission-labels";
import { routingCategoryLabel } from "./notification-categories";
import { umrahPenaltyStatusLabel } from "./umrah-penalty-status";
import { umrahPilgrimStatusLabel } from "./umrah-pilgrim-status";

describe("permission-labels", () => {
  it("resolves RBAC action and scope keys to Arabic, falling back to the key", () => {
    expect(actionLabelAr("approve")).toBe("اعتماد");
    expect(actionLabelAr("zzz")).toBe("zzz");
    expect(scopeLabelAr("self")).toBe("الخاص بي فقط");
    expect(scopeLabelAr("all")).toBe("كل الشركات");
    expect(scopeLabelAr("zzz")).toBe("zzz");
  });
});

describe("notification-categories", () => {
  it("resolves a routing-category prefix to Arabic, falling back to the value", () => {
    expect(routingCategoryLabel("leave")).toBe("الإجازات (طلب/موافقة/رفض)");
    expect(routingCategoryLabel("payment")).toBe("سندات الصرف");
    expect(routingCategoryLabel("not_a_category")).toBe("not_a_category");
  });
});

describe("umrahPenaltyStatusLabel", () => {
  it("uses the feminine penalty labels, '—' for nullish, raw for unknown", () => {
    expect(umrahPenaltyStatusLabel("waived")).toBe("معفاة");
    expect(umrahPenaltyStatusLabel("pending")).toBe("معلقة");
    expect(umrahPenaltyStatusLabel(null)).toBe("—");
    expect(umrahPenaltyStatusLabel("future")).toBe("future");
  });
});

describe("umrahPilgrimStatusLabel", () => {
  it("pins the de-drifted wording, '—' for nullish, raw for unknown", () => {
    expect(umrahPilgrimStatusLabel("overstayed")).toBe("متجاوز"); // not "متأخر"
    expect(umrahPilgrimStatusLabel("cancelled")).toBe("ملغى"); // not "ملغي"
    expect(umrahPilgrimStatusLabel("pending")).toBe("لم يصل");
    expect(umrahPilgrimStatusLabel(undefined)).toBe("—");
    expect(umrahPilgrimStatusLabel("future")).toBe("future");
  });
});
