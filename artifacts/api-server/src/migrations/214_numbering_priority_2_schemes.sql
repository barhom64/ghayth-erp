-- Migration 214 — additional numbering schemes for priority-2 routes (#1141)
--
-- @rollback:
--   DELETE FROM numbering_schemes
--     WHERE ("moduleKey", "entityKey") IN (
--       ('hr','official_letter'),
--       ('hr','employee_code'),
--       ('properties','lease_receipt'),
--       ('crm','contract'),
--       ('warehouse','purchase_receipt'),
--       ('warehouse','stock_transfer'),
--       ('finance','expense_voucher')
--     );
--
-- Adds the schemes needed by hr.ts (official_letter, employee_code),
-- properties.ts (lease_receipt), crm.ts (contract), warehouse.ts
-- (purchase_receipt, stock_transfer), and the expense voucher pattern.
-- All schemes are seeded per existing company; new companies pick the
-- defaults up via the bootstrap path.

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
