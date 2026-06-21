-- 410_document_content_hash.sql
-- كشف المكرر العميق: بصمة SHA-256 لمحتوى الملف (تُحسب على العميل وقت الرفع؛
-- الخادم لا يرى البايتات في الرفع المباشر للتخزين). تُمكّن كشف المرفقات المتطابقة
-- محتوًى حتى لو اختلف الاسم/الحجم الظاهري.
--
-- WHAT: documents + "contentHash" VARCHAR(64) (nullable) + فهرس للبحث عن المطابق.
-- DESIGN: additive + idempotent. القائم بلا بصمة (NULL) → يبقى على الكشف
--   الاستدلالي (الاسم+الحجم). لا مساس بالدفتر، لا حذف.
--
-- @rollback:
--   DROP INDEX IF EXISTS idx_documents_content_hash;
--   ALTER TABLE documents DROP COLUMN IF EXISTS "contentHash";

BEGIN;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS "contentHash" VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_documents_content_hash
  ON documents ("companyId", "contentHash")
  WHERE "contentHash" IS NOT NULL;

COMMIT;
