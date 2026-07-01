-- Migration 440 — re-seed the FULL numbering-scheme catalog for every company
--
-- @rollback:
--   -- Idempotent additive re-seed (ON CONFLICT DO NOTHING) of the canonical
--   -- numbering catalog every company is supposed to have since #1141. There
--   -- is no safe automatic rollback: the rows it (re)creates are the same
--   -- rows a fresh install / bootstrap produces, and deleting them would
--   -- break document creation. To revert a SPECIFIC scheme, delete that one
--   -- (companyId, moduleKey, entityKey) tuple by hand.
--
-- WHY THIS EXISTS
-- ---------------
-- The numbering catalog was originally seeded by migrations 213/214/215/217/
-- 227/228/230/231/232 — all of which are PRE-cutoff. On every fresh install
-- the committed schema dump is SCHEMA-ONLY, so the numbering_schemes TABLE is
-- created but those migrations' INSERT…SELECT FROM companies seed rows never
-- land (the documented "seed-drift" class). Only the POST-cutoff schemes
-- (416 vendor_advance/vendor_credit_memo, 417 intercompany) actually ran, so
-- production ended up with exactly 3 schemes per company and EVERY other
-- numbered document (journal_entry/قيود, sales_invoice/فواتير,
-- purchase_request/طلبات شراء, requests/طلبات, support_ticket, umrah_group,
-- hr contracts, …) failed at creation time because numberingService.issueNumber
-- throws NotFoundError when no active scheme exists (there is no silent
-- fallback by design).
--
-- companyBootstrap.createDefaultNumberingSchemes CLONES from the lowest-id
-- company that has schemes (the "template"). With the template itself holding
-- only 3 schemes, every newly-created company inherited the same gap. Re-seeding
-- the full catalog for ALL companies (template included) fixes existing tenants
-- AND makes the bootstrap clone complete for future tenants.
--
-- This migration is POST-cutoff, so it runs on every deploy. It is a faithful,
-- idempotent re-application of the canonical seed blocks from migrations
-- 213/214/215/217/227/228/230/231/232/416/417 plus the 229 deactivation of the
-- dead-config schemes. ON CONFLICT DO NOTHING means already-present rows
-- (including any operator-customized prefix/pattern) are left untouched.

-- =============================================
-- 213 — unified numbering center base catalog
-- =============================================
INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses"
)
SELECT c.id, x."moduleKey", x."entityKey",
       x."displayNameAr", x.prefix, x.pattern, x."padLength",
       x."resetPolicy", x."scopePolicy", x."issueTiming",
       x."manualEditPolicy", x."lockAfterStatuses"::jsonb
FROM companies c
CROSS JOIN (VALUES
    ('requests','general_request',         'طلب عام',                 'REQ',    '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly',  'branch',  'on_submit',   'draft_only',     '["approved","sent","posted","closed"]'),
    ('hr',      'employee_contract',       'عقد موظف',                'CTR',    '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly',  'branch',  'on_submit',   'draft_only',     '["pending_approval","approved","signed","active","expired","terminated"]'),
    ('communications','outgoing_letter',   'مراسلة صادرة',            'OUT',    '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly',  'branch',  'on_submit',   'draft_only',     '["sent","received","responded","closed"]'),
    ('communications','incoming_letter',   'مراسلة واردة',            'IN',     '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly',  'branch',  'on_submit',   'draft_only',     '["sent","received","responded","closed"]'),
    ('finance', 'sales_invoice',           'فاتورة بيع',              'INV',    '{PREFIX}-{YYYY}-{SEQ}',          5, 'yearly',  'company', 'on_posting',  'disabled',       '["posted","paid","approved","sent","cancelled"]'),
    ('finance', 'receipt_voucher',         'سند قبض',                 'RV',     '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly',  'branch',  'on_posting',  'disabled',       '["approved","posted"]'),
    ('finance', 'payment_voucher',         'سند صرف',                 'PV',     '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly',  'branch',  'on_posting',  'disabled',       '["approved","posted"]'),
    ('finance', 'journal_entry',           'قيد يومية',               'JV',     '{PREFIX}-{YYYY}-{SEQ}',          5, 'yearly',  'company', 'on_posting',  'disabled',       '["posted","approved"]'),
    ('finance', 'credit_memo',             'إشعار دائن',              'CN',     '{PREFIX}-{YYYY}-{SEQ}',          5, 'yearly',  'company', 'on_posting',  'disabled',       '["posted","approved"]'),
    ('finance', 'debit_memo',              'إشعار مدين',              'DN',     '{PREFIX}-{YYYY}-{SEQ}',          5, 'yearly',  'company', 'on_posting',  'disabled',       '["posted","approved"]'),
    ('purchase','purchase_request',        'طلب شراء',                'PR',     '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly',  'branch',  'on_submit',   'draft_only',     '["approved","ordered","received","cancelled"]'),
    ('purchase','purchase_order',          'أمر شراء',                'PO',     '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly',  'branch',  'on_approval', 'disabled',       '["approved","sent","received","cancelled"]'),
    ('purchase','goods_receipt',           'إيصال استلام بضاعة',      'GRN',    '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly',  'branch',  'on_posting',  'disabled',       '["posted"]'),
    ('purchase','vendor_invoice',          'فاتورة مورد',             'VINV',   '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly',  'branch',  'on_posting',  'disabled',       '["posted","paid"]'),
    ('umrah',   'umrah_group',             'مجموعة عمرة',             'UMG',    '{PREFIX}-{SEASON}-{BRANCH}-{SEQ}', 4, 'seasonal', 'season',  'on_submit',  'privileged',     '["confirmed","departed","returned","closed"]'),
    ('umrah',   'umrah_agent_invoice',     'فاتورة وكيل عمرة',        'AGINV',  '{PREFIX}-{SEASON}-{BRANCH}-{SEQ}', 4, 'seasonal', 'season',  'on_posting', 'disabled',       '["sent","paid","cancelled"]'),
    ('fleet',   'fleet_trip',              'رحلة أسطول',              'TRP',    '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly',  'branch',  'on_submit',   'draft_only',     '["departed","completed","cancelled"]'),
    ('properties','lease_contract',        'عقد إيجار',               'LEA',    '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly',  'branch',  'on_submit',   'draft_only',     '["signed","active","expired","terminated"]'),
    ('support', 'support_ticket',          'تذكرة دعم',               'TKT',    '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 5, 'yearly',  'branch',  'on_submit',   'privileged',     '["open","in_progress","resolved","closed"]'),
    ('projects','project',                 'مشروع',                    'PRJ',    '{PREFIX}-{YYYY}-{SEQ}',          4, 'yearly',  'company', 'on_submit',   'draft_only',     '["active","completed","cancelled"]'),
    ('crm',     'lead',                    'عميل محتمل',              'LD',     '{PREFIX}-{YYYY}-{SEQ}',          5, 'yearly',  'company', 'on_submit',   'draft_only',     '["qualified","converted","lost"]'),
    ('warehouse','stock_movement',         'حركة مخزون',              'STK',    '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 5, 'yearly',  'branch',  'on_posting',  'disabled',       '["posted"]'),
    ('legal',   'legal_case',              'قضية قانونية',            'LGL',    '{PREFIX}-{YYYY}-{SEQ}',          4, 'yearly',  'company', 'on_submit',   'privileged',     '["closed","archived"]')
) AS x("moduleKey","entityKey","displayNameAr",prefix,pattern,"padLength","resetPolicy","scopePolicy","issueTiming","manualEditPolicy","lockAfterStatuses")
WHERE COALESCE(c.status, 'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;

-- =============================================
-- 214 — priority-2 schemes
-- =============================================
INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses"
)
SELECT c.id, x."moduleKey", x."entityKey",
       x."displayNameAr", x.prefix, x.pattern, x."padLength",
       x."resetPolicy", x."scopePolicy", x."issueTiming",
       x."manualEditPolicy", x."lockAfterStatuses"::jsonb
FROM companies c
CROSS JOIN (VALUES
    ('hr',         'official_letter',  'خطاب رسمي',           'LTR',    '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly', 'branch',  'on_submit',   'draft_only',     '["sent","received","responded","closed"]'),
    ('hr',         'employee_code',    'كود موظف',            'EMP',    '{PREFIX}-{YYYY}-{SEQ}',          5, 'never',  'company', 'on_submit',   'privileged',     '["active","terminated"]'),
    ('properties', 'lease_receipt',    'سند استلام عقاري',    'RCP',    '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 5, 'yearly', 'branch',  'on_posting',  'disabled',       '["posted"]'),
    ('crm',        'contract',         'عقد عميل',            'CTR',    '{PREFIX}-{YYYY}-{SEQ}',          5, 'yearly', 'company', 'on_submit',   'draft_only',     '["signed","active","expired","terminated"]'),
    ('warehouse',  'purchase_receipt', 'إيصال استلام مخزن',   'GRN',    '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 5, 'yearly', 'branch',  'on_posting',  'disabled',       '["posted"]'),
    ('warehouse',  'stock_transfer',   'تحويل مخزني',         'TRF',    '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 5, 'yearly', 'branch',  'on_submit',   'draft_only',     '["approved","posted"]'),
    ('finance',    'expense_voucher',  'سند مصروف',           'EXP',    '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly', 'branch',  'on_submit',   'draft_only',     '["approved","paid"]')
) AS x("moduleKey","entityKey","displayNameAr",prefix,pattern,"padLength","resetPolicy","scopePolicy","issueTiming","manualEditPolicy","lockAfterStatuses")
WHERE COALESCE(c.status, 'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;

-- =============================================
-- 215 — crm client_code
-- =============================================
INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses"
)
SELECT c.id, 'crm', 'client_code',
       'كود عميل', 'CLT', '{PREFIX}-{YYYY}-{SEQ}', 5,
       'yearly', 'company', 'on_submit',
       'privileged', '["active","inactive"]'::jsonb
FROM companies c
WHERE COALESCE(c.status, 'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;

-- =============================================
-- 217 — full coverage (hr loan/overtime/exit, finance bank_guarantee, legal case)
-- =============================================
INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses",
    "defaultEntityTable", "defaultRefColumn"
)
SELECT c.id, x."moduleKey", x."entityKey",
       x."displayNameAr", x.prefix, x.pattern, x."padLength",
       x."resetPolicy", x."scopePolicy", x."issueTiming",
       x."manualEditPolicy", x."lockAfterStatuses"::jsonb,
       x."defaultEntityTable", x."defaultRefColumn"
FROM companies c
CROSS JOIN (VALUES
    ('hr',      'loan',            'سلفة موظف',         'LN',   '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 5, 'yearly',  'branch',  'on_submit',   'draft_only', '["approved","disbursed","closed"]',                            'hr_employee_loans',     'loanNumber'),
    ('hr',      'overtime',        'طلب وقت إضافي',     'OT',   '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 5, 'yearly',  'branch',  'on_submit',   'draft_only', '["approved","posted"]',                                          'hr_overtime_requests',  'requestNumber'),
    ('hr',      'exit',            'طلب نهاية خدمة',    'EX',   '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly',  'branch',  'on_submit',   'draft_only', '["approved","completed","cancelled"]',                           'hr_exit_requests',      'exitNumber'),
    ('finance', 'bank_guarantee',  'ضمان بنكي',         'BG',   '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4, 'yearly',  'branch',  'on_posting',  'disabled',   '["active","expired","cancelled","released"]',                    'bank_guarantees',       'ref'),
    ('legal',   'case',            'قضية قانونية',      'LGL',  '{PREFIX}-{YYYY}-{SEQ}',          5, 'yearly',  'company', 'on_submit',   'privileged', '["closed","archived","won","lost","settled"]',                   'legal_cases',           'caseNumber')
) AS x(
    "moduleKey","entityKey","displayNameAr",prefix,pattern,"padLength",
    "resetPolicy","scopePolicy","issueTiming","manualEditPolicy","lockAfterStatuses",
    "defaultEntityTable","defaultRefColumn"
)
WHERE COALESCE(c.status,'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;

UPDATE numbering_schemes
   SET "defaultEntityTable" = 'fleet_trips', "defaultRefColumn" = 'ref'
 WHERE "moduleKey" = 'fleet' AND "entityKey" = 'fleet_trip'
   AND ("defaultEntityTable" IS NULL OR "defaultRefColumn" IS NULL);
UPDATE numbering_schemes
   SET "defaultEntityTable" = 'projects', "defaultRefColumn" = 'ref'
 WHERE "moduleKey" = 'projects' AND "entityKey" = 'project'
   AND ("defaultEntityTable" IS NULL OR "defaultRefColumn" IS NULL);
UPDATE numbering_schemes
   SET "defaultEntityTable" = 'umrah_groups', "defaultRefColumn" = 'internalRef'
 WHERE "moduleKey" = 'umrah' AND "entityKey" = 'umrah_group'
   AND ("defaultEntityTable" IS NULL OR "defaultRefColumn" IS NULL);

-- =============================================
-- 227 — purchase payment_run
-- =============================================
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

-- =============================================
-- 228 — store store_order
-- =============================================
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

-- =============================================
-- 230 — hr inquiry_memo
-- =============================================
INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses",
    "defaultEntityTable", "defaultRefColumn"
)
SELECT c.id, 'hr', 'inquiry_memo',
       'مذكرة تحقيق', 'MEMO', '{PREFIX}-{YYYY}-{SEQ}', 5,
       'yearly', 'company', 'on_draft',
       'disabled', '["pending_employee","employee_responded","hr_reviewed","resolved","closed"]'::jsonb,
       'hr_inquiry_memos', 'memoNumber'
FROM companies c
WHERE COALESCE(c.status, 'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;

-- =============================================
-- 231 — finance customer_advance
-- =============================================
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

-- =============================================
-- 232 — umrah invoicing + payment
-- =============================================
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

-- =============================================
-- 416 — finance vendor_advance + vendor_credit_memo
-- =============================================
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

-- =============================================
-- 417 — finance intercompany
-- =============================================
INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses",
    "defaultEntityTable", "defaultRefColumn"
)
SELECT c.id, 'finance', 'intercompany',
       'معاملة بين الشركات', 'IC' || c.id::text, '{PREFIX}-{YYYY}-{SEQ}', 5,
       'yearly', 'company', 'on_draft',
       'disabled', '["posted","cancelled"]'::jsonb,
       'intercompany_transactions', 'ref'
FROM companies c
WHERE COALESCE(c.status, 'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;

-- =============================================
-- 229 — deactivate the 8 dead-config schemes (no issueNumber caller)
-- =============================================
UPDATE numbering_schemes
   SET "isActive" = false,
       "updatedAt" = NOW()
 WHERE ("moduleKey","entityKey") IN (
     ('finance','receipt_voucher'),
     ('finance','payment_voucher'),
     ('finance','expense_voucher'),
     ('purchase','vendor_invoice'),
     ('crm','lead'),
     ('warehouse','stock_movement'),
     ('legal','legal_case'),
     ('warehouse','purchase_receipt')
   )
   AND "isActive" = true;
