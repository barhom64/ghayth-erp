import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * F9-B2 (فحص النظام 2026-06-21) — ثابت: لا سطر قيد يُقبَل بمدين/دائن سالب.
 * المحرّك يوازن (عبر حساب 9999) لكنه لا يرفض السالب؛ فالحارس عند حدود الإدخال.
 * العكس (reversal) يبدّل العمودين فيبقيان ≥0 — لا استثناء. سطور المحرّك الداخلية
 * السالبة (إقفال/تخلص أصل) تُبنى بالكود وتتجاوز هذه السكيمات، فلا تتأثر.
 * اختبار ثابت — لا DB.
 */
const SRC = (f: string) => readFileSync(join(import.meta.dirname!, "../../src/routes", f), "utf8");

describe("JE line non-negative invariant (F9-B2)", () => {
  it("recurring journal template lines guard debit/credit >= 0", () => {
    const s = SRC("finance-recurring.ts");
    expect(s).toMatch(/debit: z\.coerce\.number\(\)\.min\(0[^)]*\)\.default\(0\)/);
    expect(s).toMatch(/credit: z\.coerce\.number\(\)\.min\(0[^)]*\)\.default\(0\)/);
  });

  it("opening-balance lines guard debit/credit >= 0", () => {
    const s = SRC("finance-journal.ts");
    expect(s).toMatch(/const openingBalanceLineSchema[\s\S]*?debit: z\.coerce\.number\(\)\.min\(0/);
    expect(s).toMatch(/const openingBalanceLineSchema[\s\S]*?credit: z\.coerce\.number\(\)\.min\(0/);
  });

  it("finance-accounts JE lines already guard >= 0 (the established precedent)", () => {
    const s = SRC("finance-accounts.ts");
    expect(s).toMatch(/debit: z\.coerce\.number\(\)\.min\(0\)/);
    expect(s).toMatch(/credit: z\.coerce\.number\(\)\.min\(0\)/);
  });

  // Regression lock for the #957 handler guards on the high-traffic manual paths
  // (these reject negative + both-sides at runtime; must never silently drop).
  it("manual journal + hardening keep the #957 negative/both-sides guards", () => {
    for (const f of ["finance-journal.ts", "finance-hardening.ts"]) {
      const s = SRC(f);
      expect(s, `${f} lost negative-line guard`).toMatch(/l\.debit < 0 \|\| l\.credit < 0|d < 0 \|\| c < 0/);
      expect(s, `${f} lost both-sides guard`).toMatch(/debit > 0 && l?\.?credit > 0|d > 0 && c > 0/);
    }
  });
});
