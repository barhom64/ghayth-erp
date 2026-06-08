import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #1812 operational review — the user's audit list explicitly called
// out: "صفحة 'رحلة جديدة' تكرر تدفق الحجز — احذفها أو حوّلها."
// ("New trip" page duplicates the booking flow — delete or redirect it.)
//
// This test pins the deprecation contract: the page renders an
// explanatory Arabic notice, auto-redirects to the new booking flow,
// and offers manual links to the three replacement surfaces. The old
// manual-trip form is gone (no /fleet/trips POST in this file).

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const FILE = readFileSync(join(spaSrc, "pages/create/fleet/trips-create.tsx"), "utf8");

describe("#1812 — /fleet/trips/create deprecation surface", () => {
  it("auto-redirects to the new booking flow after 5 seconds", () => {
    expect(FILE).toMatch(/REDIRECT_TARGET\s*=\s*"\/fleet\/transport\/bookings\/create"/);
    expect(FILE).toMatch(/REDIRECT_SECONDS\s*=\s*5/);
    expect(FILE).toMatch(/setLocation\(REDIRECT_TARGET\)/);
    // The timer is cleared on unmount so a quick back-nav doesn't fire it.
    expect(FILE).toMatch(/return\s*\(\)\s*=>\s*window\.clearTimeout\(t\)/);
  });

  it("explains the deprecation in Arabic (why, not just what)", () => {
    expect(FILE).toMatch(/هذه الشاشة استُبدلت بتدفق الحجز الجديد/);
    expect(FILE).toMatch(/إنشاء رحلة يدوية بدون مصدر/);
    expect(FILE).toMatch(/محرك الإسناد/);
    // The redirect countdown line is dynamic-templated through REDIRECT_SECONDS.
    expect(FILE).toMatch(/\{REDIRECT_SECONDS\}/);
  });

  it("offers three manual links to the replacement surfaces", () => {
    expect(FILE).toMatch(/href={REDIRECT_TARGET}/);
    expect(FILE).toMatch(/href="\/fleet\/transport\/ops-dashboard"/);
    expect(FILE).toMatch(/href="\/fleet\/transport\/dispatch"/);
    expect(FILE).toMatch(/إنشاء حجز جديد/);
    expect(FILE).toMatch(/لوحة تشغيل النقل/);
    expect(FILE).toMatch(/لوحة التوزيع/);
  });

  it("the old manual-trip form is gone (no POST /fleet/trips here)", () => {
    expect(FILE).not.toMatch(/useApiMutation\(["']\/fleet\/trips["']/);
    expect(FILE).not.toContain("VehicleSelect");
    expect(FILE).not.toContain("DriverSelect");
    // The freeform fromLocation/toLocation inputs are deleted too.
    expect(FILE).not.toMatch(/setForm\([\s\S]+fromLocation/);
  });
});
