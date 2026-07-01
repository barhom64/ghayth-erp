/**
 * transport-status-labels — statusLabel / statusDict tests. Batch 19 (tail
 * sweep) of the FE behavioral-coverage effort (ghayth-review documented gap).
 *
 * Two-level lookup (entity → status → {label, tone}) across the nine transport
 * entities. The owner's rule RM-03 is «صفر fallback إنجليزي خام»: every status
 * must surface in Arabic, and the fallbacks must NEVER render blank —
 * nullish → "—", an unknown value → the raw value itself (so a brand-new
 * server status is visible to the dispatcher, not invisible). Lookups are
 * scoped per entity, so the same value can carry a different label in a
 * different entity. Test-only — zero production code.
 *
 * (A separate drift test parses the server enums and fails the build if a
 * known value loses its label; here we exercise the lookup + fallback shape.)
 */
import { describe, it, expect } from "vitest";
import { statusLabel, statusDict } from "./transport-status-labels";

const NEUTRAL = "bg-surface-subtle text-muted-foreground";

describe("statusLabel", () => {
  it("resolves a known status to its Arabic label + a non-blank tone", () => {
    const approved = statusLabel("booking", "approved");
    expect(approved.label).toBe("معتمدة");
    expect(approved.tone).toContain("success");

    expect(statusLabel("vehicle", "maintenance").label).toBe("في الصيانة");
  });

  it("scopes the lookup per entity — the same value differs by entity", () => {
    expect(statusLabel("vehicle", "active").label).toBe("نشطة");
    expect(statusLabel("rental", "active").label).toBe("فعّال");
    expect(statusLabel("driver", "available").label).toBe("متاح");
  });

  it("renders nullish as '—' (never blank, per RM-03)", () => {
    expect(statusLabel("booking", null)).toEqual({ label: "—", tone: NEUTRAL });
    expect(statusLabel("booking", undefined)).toEqual({ label: "—", tone: NEUTRAL });
    expect(statusLabel("booking", "")).toEqual({ label: "—", tone: NEUTRAL });
  });

  it("falls back to the raw value (visible) for an unknown status", () => {
    expect(statusLabel("booking", "brand_new_state")).toEqual({
      label: "brand_new_state",
      tone: NEUTRAL,
    });
  });
});

describe("statusDict", () => {
  it("returns the whole dictionary for an entity (for filter chips etc.)", () => {
    const driver = statusDict("driver");
    expect(driver.available.label).toBe("متاح");
    expect(driver.suspended.label).toBe("موقوف");
    expect(Object.keys(driver)).toContain("on_trip");
  });
});
