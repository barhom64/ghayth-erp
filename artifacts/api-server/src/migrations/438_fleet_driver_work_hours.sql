-- ===========================================================================
-- 438_fleet_driver_work_hours.sql
-- ---------------------------------------------------------------------------
-- WHAT:    create `fleet_driver_work_hours` — ساعات عمل السائق اليومية
--          (قيادة + توقف)، تحمل الرقم المُشتقّ من التتبع والرقم المُدخَل يدويًا
--          جنبًا لجنب، وبوابة اعتماد بشري. أساس احتساب أجر السائق بالساعة.
--
-- WHY:     طلب إبراهيم (2026-06-30): راتب السائق بالساعة = ساعات قيادة × معدّل
--          + ساعات توقف × معدّل أقل. القرار: عرض التتبع واليدوي معًا، ولا
--          ترحيل إلا باعتماد بشري. هذه **الدفعة 1 (تشغيلية بلا دفتر)**: الأسطول
--          يملك الساعات كواقعة تشغيلية فقط — لا معدّلات ولا أجر ولا قيد هنا.
--          (الخطة: plans/driver-hours-pay-2026-06-30.md، اعتمدها إبراهيم.)
--
-- DESIGN:
--   - صفّ واحد لكل (driverId, workDate). الفهرس الفريد يمنع التكرار.
--   - derived* : مُشتقّ تلقائيًا من driver_navigation_sessions (أو لقطات GPS /
--     وقائع الرحلة لاحقًا). derivedSource يوثّق المصدر.
--   - manual*  : إدخال المشرف اليدوي عند نقص/خطأ التتبع.
--   - approved*: القيمة المعتمدة (يختارها المعتمِد). status='approved' = جاهزة
--     للراتب. لا يُحتسب أجر من صفّ غير معتمد (بوابة القرار 3ج).
--   - assignmentId: تعيين السائق في HR — مطلوب لاحقًا للترحيل (الدفعة 3).
--   - payrollLineId: علامة «استُهلك في مسيّر» — تُكتب **حصريًا عبر خدمة أسطول**
--     يستدعيها الراتب (الدفعة 3)؛ HR لا يكتب هذا الجدول مباشرة (قفل الحدود).
--   - companyId + branchId للعزل؛ createdByAssignmentId/approvedByAssignmentId
--     (القاعدة الذهبية + فصل الإدخال عن الاعتماد).
--   - **لا قيد ولا معدّل أجر هنا** — الجدول تشغيلي بحت يملكه الأسطول.
--
-- SAFETY:  جدول جديد فقط، tenant-isolated، لا مساس بالدفتر، لا كتابة عابرة
--          للنطاقات. الإذن: إبراهيم اعتمد الخطة بكامل الصلاحية (2026-06-30).
--
-- @rollback:
--   DROP TABLE IF EXISTS fleet_driver_work_hours;
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fleet_driver_work_hours (
  id                        SERIAL PRIMARY KEY,
  "companyId"               INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"                INTEGER,
  "driverId"                INTEGER NOT NULL REFERENCES fleet_drivers(id) ON DELETE CASCADE,
  "assignmentId"            INTEGER,
  "workDate"                DATE NOT NULL,
  "derivedDrivingHours"     NUMERIC(6,2),
  "derivedStopHours"        NUMERIC(6,2),
  "derivedSource"           TEXT,
  "manualDrivingHours"      NUMERIC(6,2),
  "manualStopHours"         NUMERIC(6,2),
  "approvedDrivingHours"    NUMERIC(6,2),
  "approvedStopHours"       NUMERIC(6,2),
  status                    TEXT NOT NULL DEFAULT 'pending',
  "approvedByAssignmentId"  INTEGER,
  "approvedAt"              TIMESTAMPTZ,
  "payrollLineId"           INTEGER,
  notes                     TEXT,
  "createdByAssignmentId"   INTEGER,
  "createdBy"               INTEGER,
  "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"               TIMESTAMPTZ,
  CONSTRAINT fleet_driver_work_hours_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'void'::text])),
  CONSTRAINT fleet_driver_work_hours_source_check
    CHECK ("derivedSource" IS NULL
           OR "derivedSource" = ANY (ARRAY['navigation'::text, 'ignition'::text, 'trip_events'::text])),
  CONSTRAINT fleet_driver_work_hours_nonneg
    CHECK (
      COALESCE("derivedDrivingHours", 0)  >= 0 AND COALESCE("derivedStopHours", 0)  >= 0 AND
      COALESCE("manualDrivingHours", 0)   >= 0 AND COALESCE("manualStopHours", 0)   >= 0 AND
      COALESCE("approvedDrivingHours", 0) >= 0 AND COALESCE("approvedStopHours", 0) >= 0
    )
);

-- صفّ واحد لكل سائق لكل يوم (يُستثنى المحذوف منطقيًا)
CREATE UNIQUE INDEX IF NOT EXISTS uq_fleet_driver_work_hours_driver_day
  ON fleet_driver_work_hours ("driverId", "workDate")
  WHERE "deletedAt" IS NULL;

-- جلب المسيّر: الساعات المعتمدة غير المستهلَكة لفترة (الدفعة 3 / خدمة القراءة)
CREATE INDEX IF NOT EXISTS idx_fleet_driver_work_hours_payroll
  ON fleet_driver_work_hours ("companyId", "assignmentId", status, "workDate")
  WHERE "deletedAt" IS NULL;

-- شاشة المشرف: صفوف الفترة بحالتها
CREATE INDEX IF NOT EXISTS idx_fleet_driver_work_hours_company_date
  ON fleet_driver_work_hours ("companyId", "workDate", status)
  WHERE "deletedAt" IS NULL;

COMMIT;
