-- Migration 216 — backfill metadata on numbering_schemes (#1141)
--
-- @rollback:
--   ALTER TABLE numbering_schemes
--     DROP COLUMN IF EXISTS "defaultEntityTable",
--     DROP COLUMN IF EXISTS "defaultRefColumn",
--     DROP COLUMN IF EXISTS "lastBackfillAt",
--     DROP COLUMN IF EXISTS "lastBackfillCount";
--
-- Adds the metadata the backfill tool needs to know WHERE to look for
-- legacy refs that predate the unified numbering center. Without this,
-- the admin UI can't run "جرد المعاملات السابقة وإعادة ترقيمها" on its
-- own — it would need a hand-written mapping in code.

ALTER TABLE numbering_schemes
    ADD COLUMN IF NOT EXISTS "defaultEntityTable" TEXT,
    ADD COLUMN IF NOT EXISTS "defaultRefColumn"   TEXT DEFAULT 'ref',
    ADD COLUMN IF NOT EXISTS "lastBackfillAt"     TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS "lastBackfillCount"  INTEGER;

-- Seed the entity-table/column pairs for every scheme created by
-- migrations 213 / 214 / 215. The values are derived from the route
-- code that issues each number — kept in one place so the backfill
-- tool can iterate over them without hard-coding.
UPDATE numbering_schemes s SET
    "defaultEntityTable" = m."entityTable",
    "defaultRefColumn"   = m."refColumn"
FROM (VALUES
    ('requests',       'general_request',     'requests',                  'ref'),
    ('hr',             'employee_contract',   'employee_contracts',        'ref'),
    ('hr',             'official_letter',     'official_letters',          'ref'),
    ('hr',             'employee_code',       'employees',                 'empNumber'),
    ('communications', 'outgoing_letter',     'correspondence',            'ref'),
    ('communications', 'incoming_letter',     'correspondence',            'ref'),
    ('finance',        'sales_invoice',       'invoices',                  'ref'),
    ('finance',        'receipt_voucher',     'receipt_vouchers',          'ref'),
    ('finance',        'payment_voucher',     'payment_vouchers',          'ref'),
    ('finance',        'journal_entry',       'journal_entries',           'ref'),
    ('finance',        'credit_memo',         'credit_memos',              'ref'),
    ('finance',        'debit_memo',          'debit_memos',               'ref'),
    ('finance',        'expense_voucher',     'expenses',                  'ref'),
    ('purchase',       'purchase_request',    'purchase_requests',         'ref'),
    ('purchase',       'purchase_order',      'purchase_orders',           'ref'),
    ('purchase',       'goods_receipt',       'goods_receipts',            'ref'),
    ('purchase',       'vendor_invoice',      'supplier_invoices',         'ref'),
    ('umrah',          'umrah_group',         'umrah_groups',              'ref'),
    ('umrah',          'umrah_agent_invoice', 'umrah_agent_invoices',      'ref'),
    ('fleet',          'fleet_trip',          'fleet_trips',               'ref'),
    ('properties',     'lease_contract',      'rental_contracts',          'contractNumber'),
    ('properties',     'lease_receipt',       'contract_payment_schedule', 'receiptNumber'),
    ('support',        'support_ticket',      'support_tickets',           'ref'),
    ('projects',       'project',             'projects',                  'ref'),
    ('crm',            'lead',                'crm_leads',                 'ref'),
    ('crm',            'contract',            'legal_contracts',           'ref'),
    ('crm',            'client_code',         'clients',                   'code'),
    ('warehouse',      'stock_movement',      'warehouse_movements',       'reference'),
    ('warehouse',      'purchase_receipt',    'goods_receipts',            'ref'),
    ('warehouse',      'stock_transfer',      'warehouse_movements',       'reference'),
    ('legal',          'legal_case',          'legal_cases',               'caseNumber')
) AS m("moduleKey","entityKey","entityTable","refColumn")
WHERE s."moduleKey" = m."moduleKey"
  AND s."entityKey" = m."entityKey"
  AND s."defaultEntityTable" IS NULL;
