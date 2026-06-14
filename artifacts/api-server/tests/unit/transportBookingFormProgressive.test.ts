import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TA-T18-UX-AUDIT-01 · UX-04 — تبسيط نموذج الحجز: الحد الأدنى أولًا ثم التفاصيل.
//  - كتلة «اتفاق العميل + النوافذ الزمنية» المتقدمة مطويّة افتراضيًا (showAgreement).
//  - رقم الحجز يُولَّد تلقائيًا (لا إلزام بإدخال مفتاح تقني في أول حقل).
//  - الحقول المتقدمة تبقى موجودة (مطويّة فقط) — لا فقدان وظيفة.

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const CREATE = readFileSync(join(spaSrc, "pages/fleet/transport-booking-create.tsx"), "utf8");

describe("UX-04 — الحد الأدنى أولًا ثم التفاصيل", () => {
  it("الكتلة المتقدمة مطويّة افتراضيًا عبر showAgreement", () => {
    expect(CREATE).toMatch(/const \[showAgreement, setShowAgreement\] = useState\(false\)/);
    expect(CREATE).toMatch(/\{showAgreement && \(/);
    expect(CREATE).toMatch(/setShowAgreement\(\(s\) => !s\)/);
  });

  it("رقم الحجز يُولَّد تلقائيًا (لا useState فارغ)", () => {
    expect(CREATE).toMatch(/const \[bookingNumber, setBookingNumber\] = useState\(\s*\(\) =>/);
    expect(CREATE).not.toMatch(/const \[bookingNumber, setBookingNumber\] = useState\(""\)/);
  });

  it("الحقول المتقدمة باقية (مطويّة فقط) — لا فقدان وظيفة", () => {
    for (const f of [
      "vehicleSubstitutionPolicy", "pickupWindowStart",
      "fixedAppointmentTime", "priority", "allowUpgrade",
    ]) {
      expect(CREATE, `advanced field ${f} missing`).toContain(f);
    }
    // العنوان المثبَّت سابقًا باقٍ كجزء من العنوان الجديد (regression).
    expect(CREATE).toMatch(/اتفاق العميل \+ النوافذ الزمنية/);
  });
});
