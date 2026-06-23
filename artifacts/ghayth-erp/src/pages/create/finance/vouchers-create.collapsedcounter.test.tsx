import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * العقيدة «النظام مساعد لا عائق» على السند: الحساب المقابل يُشتق تلقائيًا من اتجاه
 * السند (صرف→5399، قبض→4930، يحلّه الخادم) ويُعرض **مطويًّا للقراءة** — غير المحاسب
 * لا يختاره. التجاوز اليدوي خلف زر «تعديل» لذوي صلاحية الاعتماد فقط. الحارس يمنع
 * الارتداد إلى منتقي مفروض. (assertion على سطور القيد:
 * tests/integration/voucherEmptyCounterAutoRoutes.dynamic.test.ts)
 */
const PAGE = readFileSync(join(import.meta.dirname!, "vouchers-create.tsx"), "utf8");

describe("voucher counter account is auto-derived + collapsed (helper-not-obstacle)", () => {
  it("the counter account is no longer hard-required in validate()", () => {
    expect(PAGE).not.toMatch(/accountCode: form\.accountCode \? null : "الحساب المحاسبي مطلوب"/);
  });

  it("shows a read-only derived counter display keyed off voucher direction", () => {
    expect(PAGE).toMatch(/الحساب المقابل \(توجيه تلقائي حسب اتجاه السند\)/);
    expect(PAGE).toMatch(/يُشتق تلقائيًا: إيرادات متنوعة \(4930\)/);
    expect(PAGE).toMatch(/يُشتق تلقائيًا: مصروفات عمومية أخرى \(5399\)/);
  });

  it("the manual counter picker is gated behind approver permission + a collapse toggle", () => {
    expect(PAGE).toMatch(/const \[manualCounterOpen, setManualCounterOpen\] = useState/);
    expect(PAGE).toMatch(/canManualOverride && manualCounterOpen/);
  });
});
