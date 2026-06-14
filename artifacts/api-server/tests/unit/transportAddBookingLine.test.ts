import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// TA-T18-UX-AUDIT-01 · P1-3 — إضافة سطر إلى حجز قائم من شاشة التفاصيل بدل
// إعادة إنشاء الحجز. مكوّن معزول + زرّ محروس بصلاحية fleet.bookings:update.

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const read = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");
const DIALOG_PATH = "components/shared/add-booking-line-dialog.tsx";
const DETAIL = read("pages/fleet/transport-booking-detail.tsx");

describe("P1-3 — حوار إضافة سطر للحجز", () => {
  it("المكوّن موجود، يرسل POST إلى /bookings/:id/lines، ويعيد استخدام ROUTE_TYPES", () => {
    expect(existsSync(join(spaSrc, DIALOG_PATH))).toBe(true);
    const dialog = read(DIALOG_PATH);
    expect(dialog).toMatch(/import \{ ROUTE_TYPES \} from "@\/lib\/transport-constants"/);
    expect(dialog).toMatch(/\/transport\/bookings\/\$\{bookingId\}\/lines/);
    expect(dialog).toMatch(/method: "POST"/);
    expect(dialog).toMatch(/نقطتَي الانطلاق والوصول/);
  });

  it("تفاصيل الحجز تربط الزرّ المحروس والحوار", () => {
    expect(DETAIL).toMatch(
      /import \{ AddBookingLineDialog \} from "@\/components\/shared\/add-booking-line-dialog"/,
    );
    expect(DETAIL).toMatch(/setAddLineOpen\(true\)/);
    // الزرّ محروس بصلاحية التحديث — لا يتجاوز حدود RBAC.
    expect(DETAIL).toMatch(/perm="fleet\.bookings:update"[\s\S]{0,120}setAddLineOpen\(true\)/);
    expect(DETAIL).toMatch(/<AddBookingLineDialog/);
  });
});
