-- 391_support_ticket_github_sync.sql
-- ميزة: مزامنة تذاكر الدعم مع GitHub Issues (حسب الفئة المُهيّأة).
-- الدعم يبقى المسار القائد؛ تكامل GitHub قدرة خادمة معزولة تستمع للحدث
-- support.ticket.created وتُنشئ Issue للتذاكر ضمن الفئات المُهيّأة (الافتراضي
-- technical) ثم تربطه عكسيًا. المُصنِّف يعتمد حقل category القائم (قائمة منسدلة:
-- technical/financial/administrative/maintenance/other) — لا حقل جديد (الدستور م.5).
--
-- يضيف حقول الربط فقط (idempotency + عرض الرابط على التذكرة):
--   githubIssueNumber  رقم الـIssue المُنشأ.
--   githubIssueUrl     رابط الـIssue.
--   githubSyncedAt     وقت المزامنة.
--
-- DDL-only (لا seed) → seed-drift safe. > baseline-cutoff (297) ليعمل على fresh/CI.
-- كل العبارات idempotent.
--
-- @rollback: ALTER TABLE support_tickets
--   DROP COLUMN IF EXISTS "githubIssueNumber",
--   DROP COLUMN IF EXISTS "githubIssueUrl",
--   DROP COLUMN IF EXISTS "githubSyncedAt";

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS "githubIssueNumber" INTEGER;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS "githubIssueUrl" TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS "githubSyncedAt" TIMESTAMPTZ;
