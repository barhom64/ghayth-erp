-- Migration 217 — full numbering coverage + DB-level enforcement (#1141)
--
-- @rollback:
--   DELETE FROM numbering_schemes
--     WHERE ("moduleKey","entityKey") IN (
--       ('hr','loan'),('hr','overtime'),('hr','exit'),
--       ('finance','bank_guarantee'),('legal','case'));
--   ALTER TABLE fleet_trips    DROP COLUMN IF EXISTS ref;
--   ALTER TABLE projects       DROP COLUMN IF EXISTS ref;
--   ALTER TABLE umrah_groups   DROP COLUMN IF EXISTS "internalRef";
--   DROP INDEX IF EXISTS uniq_hr_employee_loans_loanNumber;
--   DROP INDEX IF EXISTS uniq_hr_overtime_requests_requestNumber;
--   DROP INDEX IF EXISTS uniq_hr_exit_requests_exitNumber;
--   DROP INDEX IF EXISTS uniq_bank_guarantees_ref;
--   DROP INDEX IF EXISTS uniq_projects_ref;
--   DROP INDEX IF EXISTS uniq_fleet_trips_ref;
--   DROP INDEX IF EXISTS uniq_legal_contracts_ref;
--   DROP INDEX IF EXISTS uniq_legal_cases_caseNumber;
--   DROP INDEX IF EXISTS uniq_invoices_ref;
--   DROP INDEX IF EXISTS uniq_credit_memos_ref;
--   DROP INDEX IF EXISTS uniq_debit_memos_ref;
--   DROP INDEX IF EXISTS uniq_journal_entries_ref;
--   DROP INDEX IF EXISTS uniq_purchase_requests_ref;
--   DROP INDEX IF EXISTS uniq_purchase_orders_ref;
--   DROP INDEX IF EXISTS uniq_goods_receipts_ref;
--   DROP INDEX IF EXISTS uniq_requests_ref;
--   DROP INDEX IF EXISTS uniq_employee_contracts_ref;
--   DROP INDEX IF EXISTS uniq_correspondence_ref;
--   DROP INDEX IF EXISTS uniq_support_tickets_ref;
--   DROP INDEX IF EXISTS uniq_rental_contracts_contractNumber;
--   DROP INDEX IF EXISTS uniq_official_letters_ref;
--
-- Phase 6 of #1141 — closes the foundation/enforcement gap that the
-- audit-numbering-coverage script (also added in this PR) exposed.
-- After this migration every executive document table:
--   1) has a scheme in numbering_schemes,
--   2) has a UNIQUE per-company constraint on its ref column so a
--      duplicate ref can NEVER land — even if a route bypasses the
--      numbering service somehow.

-- =============================================
-- 1. Add missing ref columns
-- =============================================

ALTER TABLE fleet_trips ADD COLUMN IF NOT EXISTS ref VARCHAR(50);
ALTER TABLE projects    ADD COLUMN IF NOT EXISTS ref VARCHAR(50);
-- Umrah groups already carry `nuskGroupNumber` (the external Nusk
-- portal id). Keep that as the official body identifier and add an
-- INTERNAL ref the numbering center owns so reports + audit still
-- have a per-tenant counter to chain off.
ALTER TABLE umrah_groups ADD COLUMN IF NOT EXISTS "internalRef" VARCHAR(50);

-- =============================================
-- 2. Seed the missing schemes for every existing company
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

-- Now that `fleet_trips` and `projects` carry a `ref` column, point
-- the existing `fleet.fleet_trip` / `projects.project` schemes at
-- the right (table, column) so the backfill tool can find them.
UPDATE numbering_schemes
   SET "defaultEntityTable" = 'fleet_trips',
       "defaultRefColumn"   = 'ref'
 WHERE "moduleKey" = 'fleet' AND "entityKey" = 'fleet_trip';

UPDATE numbering_schemes
   SET "defaultEntityTable" = 'projects',
       "defaultRefColumn"   = 'ref'
 WHERE "moduleKey" = 'projects' AND "entityKey" = 'project';

UPDATE numbering_schemes
   SET "defaultEntityTable" = 'umrah_groups',
       "defaultRefColumn"   = 'internalRef'
 WHERE "moduleKey" = 'umrah' AND "entityKey" = 'umrah_group';

-- =============================================
-- 3. DB-level enforcement — UNIQUE on every executive ref column
-- =============================================
-- A duplicate ref must be impossible at the storage layer, even if a
-- route bypasses the numbering service. Each index is per-company so
-- two tenants can independently use the same "REQ-2026-0001".
-- WHERE "deletedAt" IS NULL only when the table has soft-delete; for
-- tables without it the predicate is omitted (gracefully fails on
-- DDL re-run via IF NOT EXISTS).

CREATE UNIQUE INDEX IF NOT EXISTS uniq_requests_ref
    ON requests ("companyId", ref) WHERE ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_employee_contracts_ref
    ON employee_contracts ("companyId", ref) WHERE ref IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_official_letters_ref
    ON official_letters ("companyId", ref) WHERE ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_correspondence_ref
    ON correspondence ("companyId", ref) WHERE ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_ref
    ON invoices ("companyId", ref) WHERE ref IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_memos_ref
    ON credit_memos ("companyId", ref) WHERE ref IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_debit_memos_ref
    ON debit_memos ("companyId", ref) WHERE ref IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_journal_entries_ref
    ON journal_entries ("companyId", ref) WHERE ref IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_purchase_requests_ref
    ON purchase_requests ("companyId", ref) WHERE ref IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_goods_receipts_ref
    ON goods_receipts ("companyId", ref) WHERE ref IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_support_tickets_ref
    ON support_tickets ("companyId", ref) WHERE ref IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rental_contracts_contractNumber
    ON rental_contracts ("companyId", "contractNumber") WHERE "contractNumber" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hr_employee_loans_loanNumber
    ON hr_employee_loans ("companyId", "loanNumber") WHERE "loanNumber" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hr_overtime_requests_requestNumber
    ON hr_overtime_requests ("companyId", "requestNumber") WHERE "requestNumber" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hr_exit_requests_exitNumber
    ON hr_exit_requests ("companyId", "exitNumber") WHERE "exitNumber" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bank_guarantees_ref
    ON bank_guarantees ("companyId", ref) WHERE ref IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_projects_ref
    ON projects ("companyId", ref) WHERE ref IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fleet_trips_ref
    ON fleet_trips ("companyId", ref) WHERE ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_legal_contracts_ref
    ON legal_contracts ("companyId", ref) WHERE ref IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_legal_cases_caseNumber
    ON legal_cases ("companyId", "caseNumber") WHERE "caseNumber" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_umrah_groups_internalRef
    ON umrah_groups ("companyId", "internalRef") WHERE "internalRef" IS NOT NULL AND "deletedAt" IS NULL;
