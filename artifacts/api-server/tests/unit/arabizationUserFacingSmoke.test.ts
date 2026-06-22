/**
 * تعريب نصوص ظاهرة للمستخدم (قاعدة 10) — حارس انحدار ثابت. نصوص إنجليزية كانت
 * تُعرض للمستخدم على صفحات مالية حقيقية (dunning/vendor-spend/customer-risk) +
 * عناوين أقسام صفحة تشخيص التكاملات. عُرِّبت مع إبقاء الرموز التقنية (Meta/webhook/
 * GET/POST/3CX/CMSV6/410/zatca/pbx) لاتينية. يمنع عودة النصوص الإنجليزية.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FE = join(import.meta.dirname!, "../../../ghayth-erp/src");
const read = (rel: string) => readFileSync(join(FE, rel), "utf8");

describe("Arabization — user-facing finance strings", () => {
  it("dunning: no English 'As of:' label", () => {
    const s = read("pages/finance/dunning.tsx");
    expect(s).not.toMatch(/>As of:/);
    expect(s).toMatch(/بتاريخ: \{preview\.asOf\}/);
  });
  it("vendor-spend + customer-risk: no English 'Top 1 =' label", () => {
    expect(read("pages/finance/vendor-spend.tsx")).not.toMatch(/Top 1 =/);
    expect(read("pages/finance/customer-risk.tsx")).not.toMatch(/Top 1 =/);
  });
});

describe("Arabization — integrations-diagnostics section titles + help text", () => {
  const s = read("pages/admin-integrations-diagnostics.tsx");
  it("section titles are Arabic (acronyms kept)", () => {
    expect(s).not.toMatch(/>WhatsApp Business/);
    expect(s).not.toMatch(/>Fleet telematics/);
    expect(s).not.toMatch(/>Finance gates/);
    expect(s).not.toMatch(/>Auth probes/);
    expect(s).not.toMatch(/>Vendor settings lookup/);
    expect(s).toMatch(/واتساب للأعمال/);
    expect(s).toMatch(/تتبّع الأسطول \(CMSV6\)/);
    expect(s).toMatch(/اختبارات المصادقة/);
  });
  it("help text Arabized while keeping protocol tokens", () => {
    expect(s).not.toMatch(/Meta webhook endpoint\. GET=verify/);
    expect(s).not.toMatch(/Budget gate \+ legacy fiscal-period stub/);
    expect(s).toMatch(/نقطة نهاية webhook من Meta — GET=تحقّق، POST=أحداث واردة/);
  });
});
