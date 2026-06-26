/**
 * umrah-refund-status — label + transition tests. Batch 19 (tail sweep) of the
 * FE behavioral-coverage effort (ghayth-review documented gap).
 *
 * umrahRefundStatusLabel renders nullish as "—" and falls through to the raw
 * value for an unknown state (forward-compat). UMRAH_REFUND_NEXT is the
 * frontend MIRROR of the backend refund state machine — it drives which action
 * buttons render per row, so a drift from the backend transition table would
 * show illegal actions. The test pins the canonical workflow:
 *   requested → approved | rejected | cancelled
 *   approved  → paid | cancelled
 *   paid      → closed
 *   rejected / closed / cancelled → terminal
 * Test-only — zero production code.
 */
import { describe, it, expect } from "vitest";
import { umrahRefundStatusLabel, UMRAH_REFUND_NEXT } from "./umrah-refund-status";

describe("umrahRefundStatusLabel", () => {
  it("maps known states to Arabic", () => {
    expect(umrahRefundStatusLabel("requested")).toBe("مقدَّم");
    expect(umrahRefundStatusLabel("paid")).toBe("مدفوع");
    expect(umrahRefundStatusLabel("cancelled")).toBe("ملغى");
  });

  it("renders nullish as '—' and falls through to the raw value", () => {
    expect(umrahRefundStatusLabel(null)).toBe("—");
    expect(umrahRefundStatusLabel("")).toBe("—");
    expect(umrahRefundStatusLabel("future_state")).toBe("future_state");
  });
});

describe("UMRAH_REFUND_NEXT (frontend mirror of the backend state machine)", () => {
  it("offers the canonical onward transitions for live states", () => {
    expect(UMRAH_REFUND_NEXT.requested).toEqual(["approved", "rejected", "cancelled"]);
    expect(UMRAH_REFUND_NEXT.approved).toEqual(["paid", "cancelled"]);
    expect(UMRAH_REFUND_NEXT.paid).toEqual(["closed"]);
  });

  it("treats rejected / closed / cancelled as terminal (no onward actions)", () => {
    expect(UMRAH_REFUND_NEXT.rejected).toEqual([]);
    expect(UMRAH_REFUND_NEXT.closed).toEqual([]);
    expect(UMRAH_REFUND_NEXT.cancelled).toEqual([]);
  });
});
