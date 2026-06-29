-- ===========================================================================
-- 434_transport_deduction_candidates.sql
-- ---------------------------------------------------------------------------
-- WHAT:    create `transport_deduction_candidates` — مرشّح خصم نقص الوزن /
--          التأخير على رحلة، يراجعه المحاسب ويُصدر منه إشعارًا دائنًا (تخفيض
--          إيراد العميل) عبر تدفّق المالية القائم.
--
-- WHY:     شريحة 4 (خصم النقص/التأخير). الحقيقة التشغيلية (نقص = محمّل −
--          مُسلّم، أو تأخّر = الفعلي − المجدول) تُحسب من وقائع الرحلة
--          (شرائح 1-2) في مسار النقل، لكن **الدفتر تملكه المالية**: النقل
--          لا يُرحّل القيد بنفسه (قفل الحدود). فيُنشئ مرشّحًا، والمالية تُصدر
--          إشعار الدائن (credit_memos + journalId) عبر مسارها المُختبَر.
--
-- DESIGN:
--   - يربط الحجز (bookingId) + فاتورة الرحلة (invoiceId، يُملأ عند الربط).
--   - basis: weight_shortage / delay. القياس: shortageKg أو delayHours.
--   - amount: مبلغ الخصم المقترح (قياس × معدل أو مُدخَل). reason إلزامي.
--   - status: pending → issued (مع creditMemoId) / rejected.
--   - companyId + branchId للعزل؛ recordedByAssignmentId (القاعدة الذهبية).
--   - **لا قيد هنا** — الجدول تشغيلي بحت؛ القيد يُرحَّل في المالية.
--
-- SAFETY:  جدول جديد فقط، tenant-isolated، لا مساس بالدفتر. الإذن: المالك
--          اعتمد شريحة 4 بمعالجة «خصم من إيراد العميل عبر مرشّح→مالية»
--          (2026-06-29).
--
-- @rollback:
--   DROP TABLE IF EXISTS transport_deduction_candidates;
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS transport_deduction_candidates (
  id                        SERIAL PRIMARY KEY,
  "companyId"               INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"                INTEGER,
  "bookingId"               INTEGER NOT NULL REFERENCES transport_bookings(id) ON DELETE CASCADE,
  "invoiceId"               INTEGER,
  basis                     TEXT NOT NULL,
  "shortageKg"              NUMERIC(12,3),
  "delayHours"              NUMERIC(8,2),
  amount                    NUMERIC(18,2) NOT NULL,
  reason                    TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending',
  "creditMemoId"            INTEGER,
  "recordedByAssignmentId"  INTEGER,
  "createdBy"               INTEGER,
  "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transport_deduction_candidates_basis_check
    CHECK (basis = ANY (ARRAY['weight_shortage'::text, 'delay'::text])),
  CONSTRAINT transport_deduction_candidates_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'issued'::text, 'rejected'::text])),
  CONSTRAINT transport_deduction_candidates_amount_pos
    CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_transport_deduction_candidates_booking
  ON transport_deduction_candidates ("companyId", "bookingId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_transport_deduction_candidates_status
  ON transport_deduction_candidates ("companyId", status)
  WHERE status = 'pending';

COMMIT;
