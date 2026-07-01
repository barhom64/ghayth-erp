import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * طبقة أمان الدفتر — تثبيت ثوابت سطور القيد العاكس (assertion على سطور القيد).
 *
 * عكس القيد عبر POST /journal/:id/reverse هو العملية الوحيدة المسموحة لإلغاء
 * أثر قيد مُرحَّل (لا تعديل في المكان). سلامته تقوم على ثلاثة ثوابت لا يجوز أن
 * تنحرف بأي إعادة هيكلة مستقبلية:
 *
 *   1. كل سطر يُقلب حرفيًا: مدين←دائن ودائن←مدين (مرآة تامة).
 *   2. كود الحساب يُنقَل كما هو (لا إعادة توجيه — لا يهبط الأثر على حساب آخر).
 *   3. القيد العاكس يُرحَّل عبر نفس محرك الترحيل (financialEngine) الذي يرفض
 *      أي قيد غير متوازن — فيستحيل أن ينتج عكسٌ يخلّ بتوازن الدفتر.
 *
 * هذه التأكيدات مكمّلة لـ financeReverseHardeningSmoke (إصلاحَا #5 و#16)
 * ولـ reverseBalancesSelfLockSmoke (تماثل أرصدة GL) — تغطّي الفجوة المتبقّية:
 * مرآة السطر نفسها. تثبيت نصّي حتمي، لا يلمس أي منطق ترحيل.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const JOURNAL = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"),
  "utf8",
);
const HELPERS = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/businessHelpers.ts"),
  "utf8",
);

const reverseIdx = JOURNAL.indexOf('"/journal/:id/reverse"');
const handler = JOURNAL.slice(reverseIdx, reverseIdx + 12000);

describe("عكس القيد — مرآة السطر (مدين↔دائن)", () => {
  it("السطر العاكس يأخذ مدينه من دائن الأصل", () => {
    expect(handler).toMatch(/debit:\s*Number\(l\.credit\s*\|\|\s*0\)/);
  });

  it("السطر العاكس يأخذ دائنه من مدين الأصل", () => {
    expect(handler).toMatch(/credit:\s*Number\(l\.debit\s*\|\|\s*0\)/);
  });

  it("كود الحساب يُنقَل كما هو (لا إعادة توجيه)", () => {
    expect(handler).toMatch(/accountCode:\s*l\.accountCode\s+as\s+string/);
  });
});

describe("عكس القيد — اشتقاق سطور الأصل", () => {
  it("سطور الأصل تُقرأ بترتيب ثابت (ORDER BY id ASC) فلا تنحرف المطابقة", () => {
    expect(handler).toMatch(/FROM journal_lines WHERE "journalId" = \$1[\s\S]{0,80}ORDER BY id ASC/);
  });

  it("القيد بلا بنود يُرفض (لا عكس فارغ)", () => {
    expect(handler).toMatch(/القيد الأصلي لا يحتوي على بنود/);
  });
});

describe("عكس القيد — يُرحَّل عبر المحرك الذي يفرض التوازن", () => {
  it("القيد العاكس يمرّ بـ financialEngine.postJournalEntry بنوع reversal", () => {
    expect(handler).toMatch(/financialEngine\.postJournalEntry\(\{[\s\S]{0,400}type:\s*"reversal"/);
  });

  it("محرك الترحيل يرفض أي قيد غير متوازن (Σمدين ≠ Σدائن)", () => {
    // الثابت الذي يعتمد عليه أمان العكس: لا يُكتب قيد غير متوازن أبدًا.
    expect(HELPERS).toMatch(/قيد غير متوازن: مدين=\$\{totalDebit\.toFixed\(2\)\} ≠ دائن=\$\{totalCredit\.toFixed\(2\)\}/);
    expect(HELPERS).toMatch(/Math\.abs\(imbalance\)\s*>=\s*0\.005/);
  });
});
