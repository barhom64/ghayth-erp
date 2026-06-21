-- 393_employee_self_onboarding.sql
-- الاستكمال الذاتي للموظف: الموظف المُضاف عبر «التفعيل السريع» يتلقّى رابطًا
-- مؤقتًا يفتح صفحة عامة يملأ فيها بياناته الشخصية (هوية/إقامة/جواز/بنك/طوارئ)
-- — لا البيانات التي يحدّدها صاحب الشركة (المنصب/الراتب/الصلاحية/الفرع/المدير).
-- تُحفظ المُدخَلات في مرحلة مؤقتة (selfSubmittedData) ولا تُكتب على السجل قبل
-- اعتماد HR — فلا يستطيع أحد تجاوز المراجعة.
--
-- WHAT:
--   1. employee_onboarding_tokens — رمز أحادي الاستخدام، منتهٍ، مرتبط بالموظف
--      (لا بحساب مستخدم — الموظف لا يملك حسابًا بعد).
--   2. employees."selfSubmittedData" JSONB / "selfSubmittedAt" — مرحلة مؤقتة
--      لِما أدخله الموظف، بانتظار الاعتماد.
--
-- DESIGN: additive + idempotent. activationStatus حرّ (VARCHAR، migration 379)
--   فنستعمل قيمًا جديدة (self_invited / self_submitted) بلا قيد CHECK.
-- SAFETY: لا FK مالي، لا مساس بالدفتر، لا حذف.
--
-- @rollback:
--   BEGIN;
--     DROP TABLE IF EXISTS employee_onboarding_tokens;
--     ALTER TABLE employees DROP COLUMN IF EXISTS "selfSubmittedData";
--     ALTER TABLE employees DROP COLUMN IF EXISTS "selfSubmittedAt";
--   COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS employee_onboarding_tokens (
  id            BIGSERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "employeeId"  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  "tokenHash"   VARCHAR(64) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  "expiresAt"   TIMESTAMPTZ NOT NULL,
  "usedAt"      TIMESTAMPTZ,
  "createdBy"   INTEGER,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_eot_status CHECK (status IN ('pending','used','revoked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_eot_token_hash
  ON employee_onboarding_tokens ("tokenHash");

-- رمز معلّق واحد فعّال لكل موظف (إصدار جديد يُبطِل القديم في كود الإصدار).
CREATE INDEX IF NOT EXISTS idx_eot_employee_pending
  ON employee_onboarding_tokens ("employeeId")
  WHERE status = 'pending';

ALTER TABLE employees ADD COLUMN IF NOT EXISTS "selfSubmittedData" JSONB;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "selfSubmittedAt" TIMESTAMPTZ;

COMMIT;
