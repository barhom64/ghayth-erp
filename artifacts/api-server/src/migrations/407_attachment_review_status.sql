-- 395_attachment_review_status.sql
-- مراجعة المرفقات: لكل ربط (مستند ↔ كيان) حكم مراجعة مستقل، مع من راجع ومتى
-- وسبب. حكم المراجعة ≠ حالة دورة حياة المستند (documents.status): نفس الملف قد
-- يُقبل في كيان ويُرفض في آخر، فالحكم يخص الربط لا المستند عالميًا.
--
-- WHAT:
--   document_entity_links: + "reviewStatus" + "reviewedBy" + "reviewedAt" + "reviewNote".
--   reviewStatus ∈ (new | accepted | rejected | needs_replacement | duplicate).
--
-- DESIGN: additive + idempotent. الافتراضي 'new' فالروابط القائمة تُعتبر «جديدة
--   لم تُراجَع». «منتهي» يبقى مُشتقًّا من documents.retentionUntil (لا عمود هنا).
-- SAFETY: ADD COLUMN IF NOT EXISTS فقط؛ CHECK مضاف بحراسة؛ لا مساس بالدفتر،
--   لا FK مالي، لا حذف.
--
-- @rollback:
--   BEGIN;
--     ALTER TABLE document_entity_links DROP CONSTRAINT IF EXISTS chk_del_review_status;
--     ALTER TABLE document_entity_links DROP COLUMN IF EXISTS "reviewStatus";
--     ALTER TABLE document_entity_links DROP COLUMN IF EXISTS "reviewedBy";
--     ALTER TABLE document_entity_links DROP COLUMN IF EXISTS "reviewedAt";
--     ALTER TABLE document_entity_links DROP COLUMN IF EXISTS "reviewNote";
--   COMMIT;

BEGIN;

ALTER TABLE document_entity_links
  ADD COLUMN IF NOT EXISTS "reviewStatus" VARCHAR(20) NOT NULL DEFAULT 'new';
ALTER TABLE document_entity_links
  ADD COLUMN IF NOT EXISTS "reviewedBy" INTEGER;
ALTER TABLE document_entity_links
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ;
ALTER TABLE document_entity_links
  ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_del_review_status') THEN
    ALTER TABLE document_entity_links
      ADD CONSTRAINT chk_del_review_status
      CHECK ("reviewStatus" IN ('new','accepted','rejected','needs_replacement','duplicate'));
  END IF;
END $$;

COMMIT;
