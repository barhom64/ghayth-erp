-- ===========================================================================
-- 453_marketing_public_campaigns.sql
-- ---------------------------------------------------------------------------
-- WHAT:  Lets a marketing campaign be published to the company's public site
--        (وفد) and ties captured website leads back to the campaign that drove
--        them, so ROAS/attribution is robust instead of a fragile name match.
-- WHY:   ربط الحملات التسويقية بالموقع العام + التقاط العملاء المحتملين
--        وعزوهم للحملة التي جاؤوا منها (تتبّع داخلي دقيق بدل مطابقة الاسم).
--        marketing_campaigns: حقول العرض العام (isPublic/slug/publicHeadline/
--        publicBody/publicImageUrl/publicCtaLabel). crm_opportunities:
--        campaignId لعزو كل عميل محتمل للحملة.
-- SAFETY: additive — ADD COLUMN IF NOT EXISTS + partial unique index only.
--         Safe for rolling deploy (no narrowing DDL, defaults non-breaking).
-- @rollback: DROP INDEX IF EXISTS uq_marketing_campaign_public_slug; ALTER TABLE crm_opportunities DROP COLUMN IF EXISTS "campaignId"; ALTER TABLE marketing_campaigns DROP COLUMN IF EXISTS "publicCtaLabel", DROP COLUMN IF EXISTS "publicImageUrl", DROP COLUMN IF EXISTS "publicBody", DROP COLUMN IF EXISTS "publicHeadline", DROP COLUMN IF EXISTS slug, DROP COLUMN IF EXISTS "isPublic";
-- ===========================================================================

-- ── حقول النشر العام على حملة تسويقية ───────────────────────────────────────
ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS "isPublic"       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS slug             TEXT,
  ADD COLUMN IF NOT EXISTS "publicHeadline" TEXT,
  ADD COLUMN IF NOT EXISTS "publicBody"     TEXT,
  ADD COLUMN IF NOT EXISTS "publicImageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "publicCtaLabel" TEXT;

-- عزو العميل المحتمل للحملة (يبقى NULL للعملاء غير المرتبطين بحملة).
ALTER TABLE crm_opportunities
  ADD COLUMN IF NOT EXISTS "campaignId" INTEGER;

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_campaign
  ON crm_opportunities ("campaignId");

-- معرّف عام فريد للحملة داخل الشركة (فقط للحملات ذات slug غير المحذوفة).
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_campaign_public_slug
  ON marketing_campaigns ("companyId", lower(slug))
  WHERE slug IS NOT NULL AND "deletedAt" IS NULL;
