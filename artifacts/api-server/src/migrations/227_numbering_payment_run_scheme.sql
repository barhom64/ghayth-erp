-- Migration 227 — payment_run numbering scheme (#1141 G14 closure)
--
-- @rollback:
--   DELETE FROM numbering_schemes
--     WHERE ("moduleKey", "entityKey") = ('purchase', 'payment_run');
--
-- Closes G14 from coverage report (docs/architecture/numbering-coverage-
-- report-2026-05-27.md §3 G14). routes/finance-purchase.ts:1654 was
-- previously building runRef inline as `PR-${Date.now()}` — a classic
-- Date.now() legacy pattern flagged by the inline-date-now-as-ref lint
-- rule. After this seed lands, the route can call:
--
--   issueNumber({ moduleKey: "purchase", entityKey: "payment_run",
--                 entityTable: "payment_runs", expectedTiming: "on_draft" })
--
-- and get a real per-company sequence (PMT-2026-00001) with full audit
-- + uniqueness enforcement.

INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses",
    "defaultEntityTable", "defaultRefColumn"
)
SELECT c.id, 'purchase', 'payment_run',
       'تشغيلة دفعات', 'PMT', '{PREFIX}-{YYYY}-{SEQ}', 5,
       'yearly', 'company', 'on_draft',
       'disabled', '["executed","reversed","cancelled"]'::jsonb,
       'payment_runs', 'ref'
FROM companies c
WHERE COALESCE(c.status, 'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;
