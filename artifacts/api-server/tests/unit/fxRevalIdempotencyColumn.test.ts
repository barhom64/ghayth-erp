import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── FX revaluation post — idempotency check must hit the REAL column ──────
//
// خلل سابق مكتشَف بالتشغيل الفعلي (verify): فحص الـidempotency في
// POST /finance/fx/revaluation/post كان يستعلم العمود "revaluationDate"
// الذي لا وجود له على جدول fx_revaluations الكنسي (مخططه period varchar(7)
// + UNIQUE(companyId, period) — راجع db/schema_pre.sql). النتيجة:
//   `column "revaluationDate" does not exist` ⇒ 500 لأي طلب، قبل بلوغ
//   منطق بناء القيد المفصّل. الـINSERT في نفس المسار يستخدم period الصحيح،
//   فالخلل كان محصورًا في فحص الوجود.
//
// هذا اختبار انحدار (source-shape، نمط tests/unit/umrahFleetEngineDimsSmoke):
// يضمن أن فحص الوجود يستعلم period (العمود الكنسي ومفتاح التفرّد) ولا يعود
// إلى revaluationDate. السلوك E2E تحقّق يدويًا: POST → 201، سطر AR يحمل
// clientId، القيد متوازن واجتاز إنفاذ الأبعاد.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-algorithms.ts"),
  "utf8",
);

// نطاق معالج POST /fx/revaluation/post (من تعريف المسار حتى ~3000 حرف بعده).
const fnStart = ROUTE.indexOf('financeAlgorithmsRouter.post("/fx/revaluation/post"');
const fnBlock = fnStart >= 0 ? ROUTE.slice(fnStart, fnStart + 6000) : "";

describe("fx/revaluation/post — فحص idempotency يستخدم العمود الكنسي period", () => {
  it("المعالج موجود", () => {
    expect(fnStart).toBeGreaterThan(-1);
  });

  it("فحص الوجود يستعلم fx_revaluations بعمود period (لا revaluationDate)", () => {
    // يجب أن يحوي استعلام التحقّق من التكرار العمود الكنسي period.
    expect(fnBlock).toMatch(/FROM fx_revaluations WHERE "companyId"=\$1 AND period=\$2/);
  });

  it("لا يعود إلى العمود الوهمي revaluationDate في فحص fx_revaluations", () => {
    // الخلل السابق: WHERE "companyId"=$1 AND "revaluationDate"=$2::date
    expect(fnBlock).not.toMatch(/fx_revaluations WHERE "companyId"=\$1 AND "revaluationDate"/);
  });
});
