import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TA-T18-UX-AUDIT-01 · UX-05 — توحيد الحالات: لوحة التوزيع تستهلك القاموس
// الموحّد (lib/transport-status-labels) بدل خريطة محلية متوازية كانت تسقط
// لقيمة إنجليزية خام (P2-2 / RM-03 «صفر fallback إنجليزي»).

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const DISPATCH = readFileSync(join(spaSrc, "pages/fleet/transport-dispatch.tsx"), "utf8");

describe("UX-05 — لوحة التوزيع تستخدم القاموس الموحّد للحالة", () => {
  it("تستورد statusLabel من القاموس الموحّد", () => {
    expect(DISPATCH).toMatch(/import \{ statusLabel \} from "@\/lib\/transport-status-labels"/);
  });

  it("تعرض حالة التوزيع عبر statusLabel('dispatch', …) لا خريطة محلية", () => {
    expect(DISPATCH).toMatch(/statusLabel\("dispatch", o\.status\)\.label/);
    expect(DISPATCH).toMatch(/statusLabel\("dispatch", o\.status\)\.tone/);
  });

  it("لم تعد هناك خريطة حالة محلية بـ fallback إنجليزي خام", () => {
    expect(DISPATCH).not.toMatch(/const STATUS_LABEL: Record/);
    expect(DISPATCH).not.toMatch(/const STATUS_TONE: Record/);
  });
});
