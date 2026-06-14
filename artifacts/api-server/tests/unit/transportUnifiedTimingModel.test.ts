import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TA-T18-UX-AUDIT-01 · P2-1 — نموذج توقيت موحّد. التوقيت المرئي (أوقات
// التحميل/التسليم) يشتقّ نافذة المحرك (pickupWindowStart/End) خادميًا حين لا
// يحدّد المشغّل النافذة المتقدمة صراحةً، فلا يبقى الحجز بلا نافذة (يُنهي مأزق
// «صفر ترشيح» من الجذر). الاشتقاق لا يتجاوز نافذة صريحة، وبإزاحة رياض ثابتة.

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const BOOKINGS = readFileSync(join(apiSrc, "routes/transport-bookings.ts"), "utf8");
const CREATE = readFileSync(join(spaSrc, "pages/fleet/transport-booking-create.tsx"), "utf8");

describe("P2-1 (خلفية) — اشتقاق نافذة المحرك من التوقيت المرئي", () => {
  it("يشتقّ pickupWindowStart من requestedPickup (النافذة الصريحة تفوز أولًا)", () => {
    expect(BOOKINGS).toMatch(
      /const effPickupStart = b\.pickupWindowStart \?\? toRiyadhTs\(b\.requestedPickupDate, b\.requestedPickupTime\)/,
    );
    expect(BOOKINGS).toMatch(/const effPickupEnd =/);
  });

  it("يستخدم إزاحة الرياض الثابتة (+03:00 — لا توقيت صيفي)", () => {
    expect(BOOKINGS).toMatch(/toRiyadhTs = \([^)]*\)[^=]*=>/);
    expect(BOOKINGS).toMatch(/\+03:00/);
  });

  it("الإدراج ومسار التخطيط يستهلكان القيمة المشتقّة", () => {
    expect(BOOKINGS).toMatch(/effPickupStart, effPickupEnd,/);
    expect(BOOKINGS).toMatch(/scheduledPickupAt:\s*effPickupStart \?\? b\.fixedAppointmentTime/);
  });
});

describe("P2-1 (واجهة) — توضيح النموذج الموحّد", () => {
  it("تلميح أن أوقات التحميل/التسليم هي مرجع الجدولة التلقائية", () => {
    expect(CREATE).toMatch(/تُستخدم أوقات التحميل\/التسليم أعلاه للجدولة/);
  });
});
