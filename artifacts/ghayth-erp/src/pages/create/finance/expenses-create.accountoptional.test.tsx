import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Helper-not-obstacle: «بند المصروفات» (expense account) must NOT be required —
 * a non-accountant can submit a generic expense and the financial engine routes
 * it automatically (→ 5399 «مصروفات عمومية أخرى» postable, Batch 1). Guard
 * against re-introducing the hard «بند المصروفات مطلوب» requirement.
 */
const PAGE = readFileSync(join(import.meta.dirname!, "expenses-create.tsx"), "utf8");

describe("expense account is optional (auto-routed), not a forced obstacle", () => {
  it("validate() no longer hard-requires accountCode", () => {
    expect(PAGE).not.toMatch(/accountCode: form\.accountCode \? null : "بند المصروفات مطلوب"/);
  });
  it("the account is auto-routed (now a collapsed read-only display, not a forced picker)", () => {
    // Helper-not-obstacle deepened: the sub-account is derived from expense type
    // and shown read-only/collapsed (see expenses-create.collapsedaccount.test.tsx);
    // the manual picker is approver-gated. Either way the account is never forced.
    expect(PAGE).toMatch(/بند المصروفات \(توجيه تلقائي حسب نوع المصروف\)/);
    expect(PAGE).toMatch(/يحدّده النظام حسب «التصنيف التفصيلي»/);
  });
});
