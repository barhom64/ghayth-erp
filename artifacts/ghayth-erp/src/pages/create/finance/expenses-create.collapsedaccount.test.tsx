import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * العقيدة «النظام مساعد لا عائق»: الحساب الفرعي للمصروف يُشتق تلقائيًا من نوع
 * المصروف ويُعرض **مطويًّا للقراءة** — غير المحاسب لا يختار حسابًا. المنتقي
 * اليدوي مخبّأ خلف زر «تعديل» لا يظهر إلا لذوي صلاحية الاعتماد المالي.
 * الحارس يمنع الارتداد إلى منتقي حساب ظاهر دائمًا للجميع.
 */
const PAGE = readFileSync(join(import.meta.dirname!, "expenses-create.tsx"), "utf8");

describe("expense sub-account is auto-derived + collapsed (helper-not-obstacle)", () => {
  it("shows a read-only derived account display keyed off expense type", () => {
    expect(PAGE).toMatch(/بند المصروفات \(توجيه تلقائي حسب نوع المصروف\)/);
    expect(PAGE).toMatch(/derivedAccountName/);
    expect(PAGE).toMatch(/حساب المصروف:/);
  });

  it("the manual account picker is gated behind approver permission + a collapse toggle", () => {
    expect(PAGE).toMatch(/const \[manualAccountOpen, setManualAccountOpen\] = useState/);
    // the expense-account Autocomplete is no longer always-on; it renders only
    // when an approver opens the manual override.
    expect(PAGE).toMatch(/canManualOverride && manualAccountOpen/);
  });

  it("no longer renders the always-visible optional picker label", () => {
    expect(PAGE).not.toMatch(/بند المصروفات \(اختياري — توجيه تلقائي\)/);
  });
});

describe("expense source treasury collapses when a single box matches (helper-not-obstacle)", () => {
  it("derives a single-source flag from the payment-method-filtered options", () => {
    expect(PAGE).toMatch(/const onlySource = sourceOptions\.length === 1 \? sourceOptions\[0\] : null/);
  });

  it("renders a read-only treasury display when exactly one source matches", () => {
    expect(PAGE).toMatch(/\{onlySource \?/);
    expect(PAGE).toMatch(/الخزنة الوحيدة المطابقة لطريقة الدفع/);
  });

  it("still shows the picker when multiple treasuries are available (real operational choice)", () => {
    // the Autocomplete remains in the else-branch for the multi-source case.
    expect(PAGE).toMatch(/<Autocomplete options=\{sourceOptions\}/);
  });
});
