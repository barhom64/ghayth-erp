-- Migration 232 — umrah_sales_invoice + umrah_payment numbering schemes
--
-- @rollback:
--   DELETE FROM numbering_schemes
--     WHERE ("moduleKey", "entityKey") IN (
--       ('umrah', 'umrah_sales_invoice'),
--       ('umrah', 'umrah_payment')
--     );
--
-- Closes a hidden #1141 bypass: lib/umrahInvoicingEngine.ts was using
-- raw SELECT nextval('umrah_sales_invoice_seq') and
-- SELECT nextval('umrah_payment_seq') to mint UINV-… and UPAY-…
-- refs. This is the EXACT legacy pattern the numbering center
-- replaced — three defects in one:
--   1. Global per-DB sequence, not per-company → tenants share refs.
--   2. No assignment row → numbering_assignments doesn't reflect them
--      so the central audit UI shows nothing.
--   3. No scheme policy → lockAfterStatuses, manualEditPolicy ignored.
--
-- After this seed lands the lib uses
--   issueNumber({ moduleKey: "umrah", entityKey: "umrah_sales_invoice"|"umrah_payment" })
-- inside its existing withTransaction.

INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses",
    "defaultEntityTable", "defaultRefColumn"
)
SELECT c.id, 'umrah', 'umrah_sales_invoice',
       'فاتورة عمرة', 'UINV', '{PREFIX}-{YYYY}{MM}-{SEQ}', 4,
       'monthly', 'company', 'on_draft',
       'disabled', '["sent","paid","cancelled","posted"]'::jsonb,
       'umrah_sales_invoices', 'ref'
FROM companies c
WHERE COALESCE(c.status, 'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;

INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses",
    "defaultEntityTable", "defaultRefColumn"
)
SELECT c.id, 'umrah', 'umrah_payment',
       'دفعة عمرة', 'UPAY', '{PREFIX}-{YYYY}{MM}-{SEQ}', 4,
       'monthly', 'company', 'on_draft',
       'disabled', '["allocated","reversed"]'::jsonb,
       'umrah_payments', 'ref'
FROM companies c
WHERE COALESCE(c.status, 'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;
