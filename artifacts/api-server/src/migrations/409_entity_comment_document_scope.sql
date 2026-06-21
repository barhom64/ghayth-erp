-- 409_entity_comment_document_scope.sql
-- تعليق على مرفق محدد: ربط التعليق اختياريًا بمستند بعينه من مرفقات الكيان
-- (حوار مراجِع↔مقدّم على ملف بعينه). NULL = تعليق على مستوى الكيان («المناقشة»).
--
-- WHAT: entity_comments + "documentId" (nullable) + فهرس للاستعلام per-attachment.
-- DESIGN: additive + idempotent. القائم يبقى entity-level (documentId NULL).
-- SAFETY: لا مساس بالدفتر، لا FK مالي، لا حذف.
--
-- @rollback:
--   DROP INDEX IF EXISTS idx_entity_comments_document;
--   ALTER TABLE entity_comments DROP COLUMN IF EXISTS "documentId";

BEGIN;

ALTER TABLE entity_comments
  ADD COLUMN IF NOT EXISTS "documentId" INTEGER;

CREATE INDEX IF NOT EXISTS idx_entity_comments_document
  ON entity_comments ("documentId")
  WHERE "documentId" IS NOT NULL;

COMMIT;
