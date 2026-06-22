-- Migration 413 — vendor AP numbering schemes (#1141 cleanup, AP side)
--
-- @rollback:
--   DELETE FROM numbering_schemes
--     WHERE ("moduleKey", "entityKey") IN
--       (('finance', 'vendor_advance'), ('finance', 'vendor_credit_memo'));
--
-- Closes the last two inline internalTechRef offenders on the
-- accounts-payable side. routes/finance-purchase.ts was building the
-- vendor advance ref as internalTechRef("VENDOR-ADV-{supplierId}") and
-- the vendor credit-memo ref as internalTechRef("VCM-{supplierId}") —
-- both Date.now()-based tech refs leaking onto customer/supplier-facing
-- documents instead of the central numbering authority.
--
-- These two schemes are the AP twins of the already-centered customer
-- rows:
--   • finance.vendor_advance      ↔ finance.customer_advance (migration 231)
--   • finance.vendor_credit_memo  ↔ finance.credit_memo      (migration 213)
--
-- After this seed lands the route can call:
--   issueNumber({ moduleKey: "finance", entityKey: "vendor_advance",
--                 entityTable: "vendor_advances", expectedTiming: "on_draft" })
--   issueNumber({ moduleKey: "finance", entityKey: "vendor_credit_memo",
--                 entityTable: "vendor_credit_memos", expectedTiming: "on_draft" })
-- and get a real per-company yearly sequence (VADV-2026-00001 /
-- VCN-2026-00001) with a full audit trail.
--
-- Design notes:
--   • prefix VADV / VCN — distinct from the customer ADV / CN so AP and
--     AR documents never collide in a shared report.
--   • scopePolicy 'company' + resetPolicy 'yearly' — mirrors the
--     customer_advance / credit_memo rows exactly (one counter per
--     company per fiscal year).
--   • issueTiming 'on_draft' — both routes issue the number at creation
--     time (the row is INSERTed 'open' in the same request), mirroring
--     finance.customer_advance. NOTE: the customer credit_memo scheme
--     uses 'on_posting' because that flow reserves on the invoice
--     lifecycle; the vendor credit-memo route issues immediately at
--     creation, so 'on_draft' is the matching timing for THIS caller.
--   • manualEditPolicy 'legacy_import_only' — mirrors customer_advance:
--     the `reference` body field is honoured only for legacy data imports,
--     never for fresh operational numbering.
--   • lockAfterStatuses — the open→applied/refunded/cancelled lifecycle
--     of vendor_advances, and open→applied/cancelled for the memo,
--     mirroring the customer rows' locked states.

INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses",
    "defaultEntityTable", "defaultRefColumn"
)
SELECT c.id, 'finance', 'vendor_advance',
       'دفعة مقدمة لمورد', 'VADV', '{PREFIX}-{YYYY}-{SEQ}', 5,
       'yearly', 'company', 'on_draft',
       'legacy_import_only', '["open","applied","refunded","cancelled"]'::jsonb,
       'vendor_advances', 'ref'
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
SELECT c.id, 'finance', 'vendor_credit_memo',
       'إشعار دائن مورد', 'VCN', '{PREFIX}-{YYYY}-{SEQ}', 5,
       'yearly', 'company', 'on_draft',
       'legacy_import_only', '["open","applied","cancelled"]'::jsonb,
       'vendor_credit_memos', 'ref'
FROM companies c
WHERE COALESCE(c.status, 'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;
