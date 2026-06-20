-- 392_employee_branch_allocations.sql
-- محرّك اشتقاق مراكز التكلفة (الدفعة 1 — النموذج): علاقة الموظف ↔ الفرع تُمثَّل
-- كـ«تخصيصات» (allocations) بدل حقل فرع مفرد. النموذج موحّد:
--   • فرع واحد   = صف تخصيص أساسي واحد (الفرع الرئيسي، 100%، isPrimary).
--   • متعدد فروع = عدة صفوف بنِسَب وصفات (capacity) مختلفة لكل فرع.
-- مركز التكلفة لكل تخصيص: "costCenterId" الصريح إن وُجد، وإلا يُشتق وقت الترحيل
-- من الفرع عبر cost_centers(linkedEntityType='branch', linkedEntityId=branchId).
-- هذه الدفعة DDL + backfill فقط — لا تمسّ الدفتر. الاشتقاق والترحيل في الدفعة 2.
--
-- DDL + idempotent backfill (لا seed ثابت) → seed-drift safe. > baseline-cutoff
-- (297) فيُطبَّق على قواعد جديدة/CI.
--
-- @rollback: DROP TABLE IF EXISTS employee_branch_allocations;

CREATE TABLE IF NOT EXISTS employee_branch_allocations (
  id                  BIGSERIAL PRIMARY KEY,
  "companyId"         INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "employeeId"        INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  "assignmentId"      INTEGER NOT NULL REFERENCES employee_assignments(id) ON DELETE CASCADE,
  "branchId"          INTEGER NOT NULL REFERENCES branches(id),
  -- NULL = اشتق من الفرع وقت الترحيل (مركز BR-XXXX). قيمة = تجاوز يدوي.
  "costCenterId"      INTEGER REFERENCES cost_centers(id),
  -- صفة الموظف في هذا الفرع (مشرف/سائق/محاسب/…) — لأغراض التوزيع والتقارير.
  capacity            VARCHAR(80),
  "allocationPercent" NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  "isPrimary"         BOOLEAN NOT NULL DEFAULT FALSE,
  "startDate"         DATE NOT NULL DEFAULT CURRENT_DATE,
  "endDate"           DATE,
  "createdBy"         INTEGER,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_eba_percent CHECK ("allocationPercent" > 0 AND "allocationPercent" <= 100),
  UNIQUE ("assignmentId", "branchId", "startDate")
);

CREATE INDEX IF NOT EXISTS idx_eba_company_employee
  ON employee_branch_allocations ("companyId", "employeeId");

-- صف تخصيص أساسي واحد فعّال لكل تعيين (الفرع الرئيسي).
CREATE UNIQUE INDEX IF NOT EXISTS uq_eba_primary_active
  ON employee_branch_allocations ("assignmentId")
  WHERE "isPrimary" = TRUE AND "endDate" IS NULL;

-- Backfill: لكل تعيين نشط له فرع، أنشئ تخصيص الفرع الرئيسي (100%) إن لم يوجد.
-- idempotent عبر ON CONFLICT DO NOTHING على القيد الفريد (assignmentId,branchId,startDate)
-- ومن خلال شرط NOT EXISTS لتفادي التكرار على إعادة التشغيل.
INSERT INTO employee_branch_allocations
  ("companyId", "employeeId", "assignmentId", "branchId", "allocationPercent", "isPrimary", "startDate")
SELECT ea."companyId", ea."employeeId", ea.id, ea."branchId", 100.00, TRUE, COALESCE(ea."hireDate", CURRENT_DATE)
  FROM employee_assignments ea
 WHERE ea.status = 'active'
   AND ea."branchId" IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM employee_branch_allocations eba
      WHERE eba."assignmentId" = ea.id AND eba."isPrimary" = TRUE AND eba."endDate" IS NULL
   )
ON CONFLICT ("assignmentId", "branchId", "startDate") DO NOTHING;
