-- Migration 228 — store_order numbering scheme (#1141 G2 closure)
--
-- @rollback:
--   DELETE FROM numbering_schemes
--     WHERE ("moduleKey", "entityKey") = ('store', 'store_order');
--
-- Closes G2 from coverage report. routes/store.ts:262 was building
-- effectiveOrderNumber inline as `ORD-` + Date.now() — caught by the
-- inline-date-now-as-ref lint rule. After this seed the route can
-- call issueNumber({ moduleKey: "store", entityKey: "store_order",
-- entityTable: "store_orders", expectedTiming: "on_draft" }) and
-- get a real per-branch yearly sequence with full audit trail.

INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses",
    "defaultEntityTable", "defaultRefColumn"
)
SELECT c.id, 'store', 'store_order',
       'طلب متجر', 'ORD', '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 5,
       'yearly', 'branch', 'on_draft',
       'legacy_import_only', '["paid","cancelled","delivered"]'::jsonb,
       'store_orders', 'orderNumber'
FROM companies c
WHERE COALESCE(c.status, 'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;
