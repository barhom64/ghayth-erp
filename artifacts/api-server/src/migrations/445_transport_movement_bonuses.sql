-- ===========================================================================
-- 445_transport_movement_bonuses.sql
-- ---------------------------------------------------------------------------
-- WHAT:    create `transport_movement_bonuses` — مكافأة يمنحها المشرف لسائق على
--          حركة نقل (أمر توزيع)، بمبلغ مقطوع، باعتماد بشري قبل أي ترحيل للراتب.
--
-- WHY:     طلب إبراهيم (2026-06-30): مكافآت حركات النقل. القرار المعتمد: منح
--          يدوي بمبلغ مقطوع قابل للتعديل (افتراضه إعداد). **الدفعة أ (تشغيلية
--          بلا دفتر)**: الأسطول يملك المكافأة كواقعة. تحويلها لبند راتب وترحيل
--          القيد يأتي في الدفعة ب داخل الموارد البشرية. نمط مرشّح الخصم القائم.
--
-- DESIGN:
--   - تُربط بـ dispatchOrderId (الحركة الذرّية) + bookingId (سياق) + driverId.
--   - assignmentId: تعيين السائق في HR — مطلوب للترحيل (الدفعة ب).
--   - amount > 0 (مقطوع، مُدخَل أو من إعداد fleet.bonus.movementDefault).
--   - status: pending → approved (جاهزة للراتب) / void. بوابة الاعتماد البشري.
--   - payrollLineId: علامة «استُهلك في مسيّر» — تُكتب حصريًا عبر خدمة أسطول
--     يستدعيها الراتب (الدفعة ب)؛ HR لا يكتب هذا الجدول مباشرة (قفل الحدود).
--   - companyId + branchId للعزل؛ createdByAssignmentId/approvedByAssignmentId
--     (القاعدة الذهبية + فصل المنح عن الاعتماد).
--   - **لا قيد هنا** — الجدول تشغيلي بحت يملكه الأسطول.
--
-- SAFETY:  جدول جديد فقط، tenant-isolated، لا مساس بالدفتر. الإذن: إبراهيم
--          اعتمد التوصية (منح يدوي + مبلغ مقطوع) (2026-06-30).
--
-- @rollback:
--   DROP TABLE IF EXISTS transport_movement_bonuses;
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS transport_movement_bonuses (
  id                        SERIAL PRIMARY KEY,
  "companyId"               INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"                INTEGER,
  "dispatchOrderId"         INTEGER NOT NULL REFERENCES transport_dispatch_orders(id) ON DELETE CASCADE,
  "bookingId"               INTEGER,
  "driverId"                INTEGER,
  "assignmentId"            INTEGER,
  amount                    NUMERIC(14,2) NOT NULL,
  reason                    TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending',
  "approvedByAssignmentId"  INTEGER,
  "approvedAt"              TIMESTAMPTZ,
  "payrollLineId"           INTEGER,
  "createdByAssignmentId"   INTEGER,
  "createdBy"               INTEGER,
  "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"               TIMESTAMPTZ,
  CONSTRAINT transport_movement_bonuses_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'void'::text])),
  CONSTRAINT transport_movement_bonuses_amount_pos CHECK (amount > 0)
);

-- مكافآت الحركة (شاشة المشرف)
CREATE INDEX IF NOT EXISTS idx_transport_movement_bonuses_dispatch
  ON transport_movement_bonuses ("companyId", "dispatchOrderId")
  WHERE "deletedAt" IS NULL;

-- جلب المسيّر: المعتمدة غير المُستهلَكة لتعيين (الدفعة ب / عقد القراءة)
CREATE INDEX IF NOT EXISTS idx_transport_movement_bonuses_payroll
  ON transport_movement_bonuses ("companyId", "assignmentId", status)
  WHERE "deletedAt" IS NULL;

COMMIT;
