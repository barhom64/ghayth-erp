/**
 * تحقّق ترتيب نطاق التاريخ (start ≤ end) — دفعة تشغيلية. كان بالإمكان حفظ سجل
 * بنهاية تسبق بدايته (مدة سالبة، نطاق مقلوب). لكلٍّ refine يتحقّق أن النهاية ليست
 * قبل البداية، مع تجاوز التحقّق إن كان أحد الحقلين غائبًا أو غير قابل للتحليل
 * (تتكفّل به بقية التحققات/التخزين). اختبار سلوكي على المخطّطات المُصدَّرة.
 *
 * ملاحظة: hr-overtime (startTime/endTime من نوع TIME مع مناوبات ليلية مشروعة،
 * والمدة من حقل hours منفصل) استُثني عمدًا — فحصٌ ثابت ليس صحيحًا هناك.
 */
import { describe, it, expect } from "vitest";
import { createAuditSchema } from "../../src/routes/governance.js";
import { createBlockSchema } from "../../src/routes/umrah-entities.js";
import { dispatchOrderSchema } from "../../src/routes/transport-bookings.js";

describe("date-range order — governance audit (startDate ≤ endDate)", () => {
  const base = { title: "مراجعة" };
  it("rejects endDate before startDate", () => {
    expect(createAuditSchema.safeParse({ ...base, startDate: "2026-05-10", endDate: "2026-05-01" }).success).toBe(false);
  });
  it("accepts ordered, equal, and missing-end ranges", () => {
    expect(createAuditSchema.safeParse({ ...base, startDate: "2026-05-01", endDate: "2026-05-10" }).success).toBe(true);
    expect(createAuditSchema.safeParse({ ...base, startDate: "2026-05-01", endDate: "2026-05-01" }).success).toBe(true);
    expect(createAuditSchema.safeParse({ ...base, startDate: "2026-05-01" }).success).toBe(true);
    expect(createAuditSchema.safeParse(base).success).toBe(true);
  });
});

describe("date-range order — umrah room block (checkInDate ≤ checkOutDate)", () => {
  const base = { hotelId: 1, totalRooms: 5 };
  it("rejects checkOutDate before checkInDate", () => {
    expect(createBlockSchema.safeParse({ ...base, checkInDate: "2026-06-10", checkOutDate: "2026-06-02" }).success).toBe(false);
  });
  it("accepts ordered, equal, and missing dates", () => {
    expect(createBlockSchema.safeParse({ ...base, checkInDate: "2026-06-02", checkOutDate: "2026-06-10" }).success).toBe(true);
    expect(createBlockSchema.safeParse({ ...base, checkInDate: "2026-06-02", checkOutDate: "2026-06-02" }).success).toBe(true);
    expect(createBlockSchema.safeParse(base).success).toBe(true);
  });
});

describe("date-range order — transport dispatch (scheduledStartAt ≤ scheduledEndAt)", () => {
  const base = { bookingLineId: 1, vehicleId: 1, driverId: 1 };
  it("rejects scheduledEndAt before scheduledStartAt (tstzrange would silently invert)", () => {
    expect(dispatchOrderSchema.safeParse({ ...base, scheduledStartAt: "2026-06-10T10:00:00Z", scheduledEndAt: "2026-06-10T08:00:00Z" }).success).toBe(false);
  });
  it("accepts an ordered window", () => {
    expect(dispatchOrderSchema.safeParse({ ...base, scheduledStartAt: "2026-06-10T08:00:00Z", scheduledEndAt: "2026-06-10T10:00:00Z" }).success).toBe(true);
  });
});
