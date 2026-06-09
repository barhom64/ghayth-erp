import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #1812 operational review — the user explicitly called out:
//   "الحالات غير مؤتمتة. وجود Dropdown للحالة كآلية التشغيل الأساسية
//    يعتبر خطأ تصميمياً."
//
// Backend cascade landed in PR #1877: dispatch.accepted/executing/completed
// auto-flips booking_line + booking. So the UI dropdown must NOT offer
// `dispatched`, `in_progress`, or `completed` as manual targets — they're
// system-driven.
//
// Booking detail now exposes only operator-driveable transitions per
// BOOKING_TRANSITIONS, drops the three auto-cascaded values, and shows
// a small "تتغير تلقائياً" hint when the booking is in an auto-state.

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const FILE = readFileSync(join(spaSrc, "pages/fleet/transport-booking-detail.tsx"), "utf8");

describe("#1812 — booking-detail status dropdown is operator-only", () => {
  it("declares the AUTO_CASCADED_STATES set with the 3 system-driven values", () => {
    expect(FILE).toContain("AUTO_CASCADED_STATES");
    expect(FILE).toMatch(/AUTO_CASCADED_STATES\s*=\s*new Set\(\[\s*"dispatched",\s*"in_progress",\s*"completed"\s*\]\)/);
  });

  it("declares BOOKING_TRANSITIONS mirroring the server alphabet", () => {
    expect(FILE).toContain("BOOKING_TRANSITIONS");
    // Auto-cascaded source states only allow `cancelled` from the operator.
    expect(FILE).toMatch(/scheduled:\s*\["cancelled"\]/);
    expect(FILE).toMatch(/dispatched:\s*\["cancelled"\]/);
    expect(FILE).toMatch(/in_progress:\s*\["cancelled"\]/);
    // Terminal states have no outbound transitions.
    expect(FILE).toMatch(/completed:\s*\[\]/);
    expect(FILE).toMatch(/cancelled:\s*\[\]/);
    expect(FILE).toMatch(/rejected:\s*\[\]/);
  });

  it("operatorOptionsFor filters out auto-cascaded targets", () => {
    expect(FILE).toContain("function operatorOptionsFor");
    expect(FILE).toMatch(/\.filter\(\(t\) => !AUTO_CASCADED_STATES\.has\(t\)\)/);
  });

  it("renders a 'تتغير تلقائياً' hint when current status is auto-cascaded", () => {
    expect(FILE).toMatch(/تتغير تلقائياً من إجراءات السائق/);
    expect(FILE).toMatch(/isAutoState\s*=\s*AUTO_CASCADED_STATES\.has\(b\.status\)/);
  });

  it("hides the Select entirely when no operator-driveable transitions exist", () => {
    expect(FILE).toMatch(/opts\.length > 0 && \(/);
  });

  it("auto-state labels carry an explicit '(تلقائياً)' marker so the operator can't confuse them", () => {
    expect(FILE).toMatch(/dispatched:\s*"موزّعة \(تلقائياً\)"/);
    expect(FILE).toMatch(/in_progress:\s*"جارية \(تلقائياً\)"/);
    expect(FILE).toMatch(/completed:\s*"مكتملة \(تلقائياً\)"/);
  });

  it("legacy STATUS_OPTIONS (10-state flat list) is gone", () => {
    expect(FILE).not.toMatch(/STATUS_OPTIONS:.*\{ value: "dispatched"/);
    expect(FILE).not.toMatch(/STATUS_OPTIONS:.*\{ value: "in_progress"/);
    expect(FILE).not.toMatch(/STATUS_OPTIONS:.*\{ value: "completed"/);
  });
});
