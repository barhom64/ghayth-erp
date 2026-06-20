-- 393_appointments.sql
-- ميزة: المواعيد/الاجتماعات + دعوة iCalendar (.ics) — #2704 (P2 الجدولة الاستباقية).
-- باعتماد إبراهيم («كلها»). جدول جديد مستقل، تشغيلي — **لا يمسّ الدفتر**.
--
-- يُكمل تقويم القراءة القائم (routes/calendar.ts /upcoming) بكيان موعد قابل
-- للإنشاء/التعديل/الإلغاء + توليد .ics لمشاركته خارجيًا. مرتبط اختياريًا بأي
-- كيان (relatedEntityType/Id) ليظهر في سياقه.
--
-- DDL-only (لا seed) → seed-drift safe. > baseline-cutoff (297) ليعمل على
-- fresh/CI. كل العبارات idempotent. حذف ناعم (deletedAt) — متوافق مع سلة
-- المحذوفات المعمّمة (#2713).
--
-- @rollback: DROP TABLE IF EXISTS appointments;

CREATE TABLE IF NOT EXISTS appointments (
  id                  BIGSERIAL PRIMARY KEY,
  "companyId"         INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"          INTEGER,
  title               TEXT NOT NULL,
  description         TEXT,
  location            TEXT,
  "startsAt"          TIMESTAMPTZ NOT NULL,
  "endsAt"            TIMESTAMPTZ NOT NULL,
  "allDay"            BOOLEAN NOT NULL DEFAULT FALSE,
  -- scheduled | completed | cancelled
  status              TEXT NOT NULL DEFAULT 'scheduled',
  -- ربط اختياري بكيان تشغيلي (عميل/مشروع/قضية…) ليظهر الموعد في سياقه.
  "relatedEntityType" TEXT,
  "relatedEntityId"   INTEGER,
  -- [{ name, email }] — لإدراجهم كـ ATTENDEE في ملف .ics.
  attendees           JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdBy"         INTEGER,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"         TIMESTAMPTZ
);

-- القائمة الأساسية: حسب الشركة ضمن نافذة زمنية، غير المحذوف.
CREATE INDEX IF NOT EXISTS idx_appointments_company_start
  ON appointments ("companyId", "startsAt") WHERE "deletedAt" IS NULL;

-- البحث بالكيان المرتبط (مواعيد هذا العميل/المشروع…).
CREATE INDEX IF NOT EXISTS idx_appointments_related
  ON appointments ("companyId", "relatedEntityType", "relatedEntityId") WHERE "deletedAt" IS NULL;
