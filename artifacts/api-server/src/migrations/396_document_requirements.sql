-- 396_document_requirements.sql
-- قائمة المتطلبات الإلزامية للمستندات لكل نوع كيان (مثل: موظف ⇐ صورة هوية + عقد
-- موقّع + آيبان). تُضبط من إعدادات المسار المالك؛ بطاقة «اكتمال المرفقات» تُشتق
-- منها بتقاطع متطلبات النوع مع مستندات الكيان الفعلية (اشتقاق، لا تخزين).
--
-- WHAT:
--   document_requirements — صف لكل متطلب: نوع الكيان + التصنيف المطلوب + التسمية
--   + إلزامي؟ + نشط؟ + ترتيب. "companyId" NULL = افتراضي على مستوى النظام
--   (وراثة نظام←شركة حسب المبدأ 6: صف الشركة يطغى على الافتراضي لنفس التصنيف).
--
-- DESIGN: additive + idempotent. لا حذف فيزيائي (الإلغاء بـ isActive=false).
-- SAFETY: جدول جديد بإذن إبراهيم؛ لا مساس بالدفتر، لا FK مالي.
--
-- @rollback:
--   DROP TABLE IF EXISTS document_requirements;

BEGIN;

CREATE TABLE IF NOT EXISTS document_requirements (
  id            BIGSERIAL PRIMARY KEY,
  "companyId"   INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  "entityType"  VARCHAR(50) NOT NULL,
  "docCategory" VARCHAR(50),
  label         VARCHAR(255) NOT NULL,
  required      BOOLEAN NOT NULL DEFAULT true,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdBy"   INTEGER,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_req_entity
  ON document_requirements ("entityType", "isActive");

COMMIT;
