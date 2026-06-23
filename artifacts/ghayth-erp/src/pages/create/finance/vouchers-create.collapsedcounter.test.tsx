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
  it("the counter account is required ONLY for operation types that can't auto-route (Codex P2)", () => {
    expect(PAGE).not.toMatch(/accountCode: form\.accountCode \? null : "الحساب المحاسبي مطلوب"/);
    // auto-routable types → optional; asset/liability types → required.
    expect(PAGE).toMatch(/counterAutoRoutable \|\| form\.accountCode \? null :/);
    expect(PAGE).toMatch(/const counterAutoRoutable = \(\(\) => \{/);
    expect(PAGE).toMatch(/VOUCHER_COUNTER_ACCOUNT_TYPES\[form\.operationType\]/);
  });

  it("shows a read-only derived counter display when the direction default is valid", () => {
    expect(PAGE).toMatch(/counterAutoRoutable \?/);
    expect(PAGE).toMatch(/يُشتق تلقائيًا: إيرادات متنوعة \(4930\)/);
    expect(PAGE).toMatch(/يُشتق تلقائيًا: مصروفات عمومية أخرى \(5399\)/);
  });

  it("shows a required picker (for everyone) when the type needs a specific account", () => {
    // the else-branch renders a required AccountSelect so non-approvers can
    // still create invoice_payment/deposit/advance/custody vouchers.
    expect(PAGE).toMatch(/label="الحساب المقابل"\s*\n\s*required/);
  });

  it("the manual counter picker is gated behind approver permission + a collapse toggle", () => {
    expect(PAGE).toMatch(/const \[manualCounterOpen, setManualCounterOpen\] = useState/);
    expect(PAGE).toMatch(/canManualOverride && manualCounterOpen/);
  });
});
