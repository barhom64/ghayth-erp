-- Migration 231 — customer_advance numbering scheme (#1141 cleanup)
--
-- @rollback:
--   DELETE FROM numbering_schemes
--     WHERE ("moduleKey", "entityKey") = ('finance', 'customer_advance');
--
-- Closes the last inline-date-now-as-ref offender for customer
-- advances. routes/finance-invoices.ts was building advRef inline as
-- `ADV-` + Date.now() — caught by the lint rule and tracked in the
-- soft ratchet baseline.
--
-- After this seed lands the route can call:
--   issueNumber({ moduleKey: "finance", entityKey: "customer_advance",
--                 entityTable: "customer_advances", expectedTiming: "on_draft" })
-- and get a real per-company yearly sequence (ADV-2026-00001) with
-- full audit trail.

INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses",
    "defaultEntityTable", "defaultRefColumn"
)
SELECT c.id, 'finance', 'customer_advance',
       'دفعة مقدمة', 'ADV', '{PREFIX}-{YYYY}-{SEQ}', 5,
       'yearly', 'company', 'on_draft',
       'legacy_import_only', '["open","applied","refunded","cancelled"]'::jsonb,
       'customer_advances', 'ref'
FROM companies c
WHERE COALESCE(c.status, 'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;
