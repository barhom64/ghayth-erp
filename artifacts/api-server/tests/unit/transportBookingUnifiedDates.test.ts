import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #1812 operational review — closes the user's gap #8:
//   "التواريخ غير موحدة. لا يبدو أنها تستخدم مكون التاريخ الموحد في
//    غيث. وهذا يسبب لاحقاً مشاكل: التقارير / الفلاتر / الجدولة / التقويم."
//
// The booking-create form used raw <input type="date|datetime-local">
// for every date/time field, bypassing the canonical DateField (which
// wraps UnifiedDateInput — Hijri toggle + Asia/Riyadh anchor + shared
// parser). This refactor moves every date/datetime input to DateField
// so the booking dates render and parse identically to the rest of
// Ghaith (dashboards, reports, calendar).

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const FILE = readFileSync(join(spaSrc, "pages/fleet/transport-booking-create.tsx"), "utf8");

describe("#1812 — booking-create uses the canonical DateField (gap #8)", () => {
  it("imports DateField from the canonical form-field-wrapper", () => {
    expect(FILE).toContain("import { DateField }");
    expect(FILE).toContain('from "@/components/shared/form-field-wrapper"');
  });

  it("uses DateField mode='date' for the two date fields (pickup + delivery)", () => {
    expect(FILE).toMatch(/<DateField\s+label="تاريخ التحميل"[\s\S]{0,160}mode="date"/);
    expect(FILE).toMatch(/<DateField\s+label="تاريخ التسليم"[\s\S]{0,160}mode="date"/);
  });

  it("uses DateField mode='datetime' for all 5 datetime fields", () => {
    // Booking-window start/end (pickup) + dropoff + fixed appointment.
    for (const label of [
      "نافذة التحميل — من", "نافذة التحميل — إلى",
      "نافذة التسليم — من", "نافذة التسليم — إلى",
      "موعد ثابت (إن وجد)",
    ]) {
      // Escape regex metacharacters in the Arabic label (parens etc.).
      const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(FILE, `DateField for ${label} missing`).toMatch(
        new RegExp(`<DateField[\\s\\S]{0,200}label="${esc}"[\\s\\S]{0,160}mode="datetime"`),
      );
    }
  });

  it("no more raw <input type=\"date\"|\"datetime-local\"> on the form", () => {
    expect(FILE).not.toMatch(/<Input\s+id="pickupDate"\s+type="date"/);
    expect(FILE).not.toMatch(/<Input\s+id="deliveryDate"\s+type="date"/);
    expect(FILE).not.toMatch(/<Input\s+type="datetime-local"/);
  });

  it("keeps the time-only inputs as native <Input type='time'> (no Hijri/TZ skew on plain HH:MM)", () => {
    // time-only is allowed — there's no datetime-canonical for pure clock time.
    expect(FILE).toMatch(/<Input\s+id="pickupTime"\s+type="time"/);
    expect(FILE).toMatch(/<Input\s+id="deliveryTime"\s+type="time"/);
  });
});
