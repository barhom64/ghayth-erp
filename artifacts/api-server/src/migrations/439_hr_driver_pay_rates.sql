-- ===========================================================================
-- 439_hr_driver_pay_rates.sql
-- ---------------------------------------------------------------------------
-- WHAT:    create `hr_driver_pay_rates` — معدّلات أجر السائق بالساعة التي تملكها
--          الموارد البشرية: معدّل قيادة + معدّل توقف (أقل) + نوع الدفع
--          (شهري/بالساعة). صفّ افتراضي للشركة (assignmentId NULL) يُتجاوَز لكل
--          تعيين سائق.
--
-- WHY:     طلب إبراهيم (2026-06-30) — أجر السائق بالساعة. **الدفعة 2** من الخطة
--          (plans/driver-hours-pay-2026-06-30.md): الموارد البشرية **قائد** في
--          سياسة الأجر، فالمعدّل ونوع الدفع يملكهما مسار HR لا الأسطول. الأسطول
--          يوفّر الساعات (الدفعة 1)، وHR يضربها بهذه المعدّلات (الدفعة 3).
--          **لا مساس بالدفتر هنا** — إعداد فقط.
--
-- DESIGN:
--   - assignmentId NULL  → معدّل افتراضي الشركة (صفّ واحد لكل شركة).
--   - assignmentId = X    → تجاوز لتعيين سائق محدّد (صفّ واحد لكل تعيين).
--   - payType: monthly | hourly — قابل للتبديل لكل سائق (القرار: «كل شيء قابل
--     للتعديل من الواجهة»).
--   - drivingHourlyRate / stopHourlyRate: معدّلان منفصلان (التوقف أقل عادةً).
--   - effectiveDate: تأريخ سريان المعدّل (يُجمَّد لحظة الترحيل في الدفعة 3).
--   - فهارس فريدة جزئية: NULL لا يفرض تفرّدًا في UNIQUE العادي، فنستخدم
--     partial unique index للافتراضي وللتجاوز كلٍّ على حدة.
--   - companyId + branchId للعزل؛ createdByAssignmentId (القاعدة الذهبية).
--
-- SAFETY:  جدول جديد فقط، tenant-isolated، لا مساس بالدفتر، لا كتابة عابرة
--          للنطاقات (HR يملكه). الإذن: إبراهيم اعتمد الخطة بكامل الصلاحية.
--
-- @rollback:
--   DROP TABLE IF EXISTS hr_driver_pay_rates;
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS hr_driver_pay_rates (
  id                        SERIAL PRIMARY KEY,
  "companyId"               INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"                INTEGER,
  "assignmentId"            INTEGER,
  "payType"                 TEXT NOT NULL DEFAULT 'hourly',
  "drivingHourlyRate"       NUMERIC(12,2),
  "stopHourlyRate"          NUMERIC(12,2),
  "effectiveDate"           DATE NOT NULL DEFAULT CURRENT_DATE,
  "isActive"                BOOLEAN NOT NULL DEFAULT true,
  "createdByAssignmentId"   INTEGER,
  "createdBy"               INTEGER,
  "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"               TIMESTAMPTZ,
  CONSTRAINT hr_driver_pay_rates_paytype_check
    CHECK ("payType" = ANY (ARRAY['monthly'::text, 'hourly'::text])),
  CONSTRAINT hr_driver_pay_rates_nonneg
    CHECK (COALESCE("drivingHourlyRate", 0) >= 0 AND COALESCE("stopHourlyRate", 0) >= 0)
);

-- صفّ افتراضي واحد لكل شركة (assignmentId NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_driver_pay_company_default
  ON hr_driver_pay_rates ("companyId")
  WHERE "assignmentId" IS NULL AND "deletedAt" IS NULL;

-- تجاوز واحد لكل تعيين سائق
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_driver_pay_assignment
  ON hr_driver_pay_rates ("companyId", "assignmentId")
  WHERE "assignmentId" IS NOT NULL AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_hr_driver_pay_company
  ON hr_driver_pay_rates ("companyId")
  WHERE "deletedAt" IS NULL;

COMMIT;
