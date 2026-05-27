-- Migration 213 — Unified Numbering Center (Issue #1141)
--
-- @rollback:
--   DROP TABLE IF EXISTS numbering_audit_logs;
--   DROP TABLE IF EXISTS numbering_assignments;
--   DROP TABLE IF EXISTS numbering_counters;
--   DROP TABLE IF EXISTS numbering_schemes;
--   ALTER TABLE branches DROP COLUMN IF EXISTS "numberingCode";
--
-- The legacy `request_number_seq`, `contract_number_seq`,
-- `correspondence_outgoing_seq`, `correspondence_incoming_seq` are
-- preserved by this migration and remain available — so rolling back
-- only the new tables is safe as long as the routes have been
-- reverted to the pre-#1141 implementation first.
--
-- Establishes the single, central numbering authority for Ghayth ERP.
-- Every executive document number (طلبات / عقود / مراسلات / فواتير /
-- سندات / قيود / مجموعات عمرة / …) is issued by `numberingService` and
-- recorded in `numbering_assignments` against a policy held in
-- `numbering_schemes`. Counters are scoped (company / branch / fiscal
-- year / season) and locked through a SELECT … FOR UPDATE in
-- numberingService.issueNumber so two concurrent inserts cannot collide.
--
-- This migration is additive — existing legacy sequences
-- (`request_number_seq`, `contract_number_seq`,
-- `correspondence_outgoing_seq`, `correspondence_incoming_seq`) are
-- kept in place until every route is moved off them; once the CI check
-- is hardened and all routes use the service, a follow-up migration
-- drops the orphaned sequences.

-- =============================================
-- 0. branches.numberingCode — short code injected into `{BRANCH}` token
-- =============================================
-- The numbering pattern `{PREFIX}-{BRANCH}-{YYYY}-{SEQ}` substitutes
-- `{BRANCH}` with this short code (e.g. "MK", "JED"). When the column
-- is NULL/empty the service derives a 3-letter slug from the branch's
-- English name so legacy tenants still get sensible refs.

ALTER TABLE branches
    ADD COLUMN IF NOT EXISTS "numberingCode" VARCHAR(10);

-- =============================================
-- 1. numbering_schemes — one row per numbering policy
-- =============================================

CREATE TABLE IF NOT EXISTS numbering_schemes (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "displayNameAr" TEXT NOT NULL,
    "displayNameEn" TEXT,
    prefix TEXT NOT NULL,
    pattern TEXT NOT NULL DEFAULT '{PREFIX}-{YYYY}-{SEQ}',
    "padLength" INTEGER NOT NULL DEFAULT 4
        CHECK ("padLength" BETWEEN 3 AND 10),
    "resetPolicy" TEXT NOT NULL DEFAULT 'yearly'
        CHECK ("resetPolicy" IN ('never','yearly','monthly','seasonal','fiscal_year')),
    "scopePolicy" TEXT NOT NULL DEFAULT 'branch'
        CHECK ("scopePolicy" IN ('company','branch','module','entity','season','fiscal_year')),
    "issueTiming" TEXT NOT NULL DEFAULT 'on_submit'
        CHECK ("issueTiming" IN ('on_draft','on_submit','on_approval','on_posting')),
    "manualEditPolicy" TEXT NOT NULL DEFAULT 'disabled'
        CHECK ("manualEditPolicy" IN ('disabled','draft_only','privileged','legacy_import_only')),
    "requiresReasonOnManualEdit" BOOLEAN NOT NULL DEFAULT true,
    "lockAfterStatuses" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "branchPrefixOverrides" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT numbering_schemes_unique_key UNIQUE ("companyId", "moduleKey", "entityKey")
);

CREATE INDEX IF NOT EXISTS numbering_schemes_company_idx
    ON numbering_schemes ("companyId");
CREATE INDEX IF NOT EXISTS numbering_schemes_module_idx
    ON numbering_schemes ("moduleKey");

-- =============================================
-- 2. numbering_counters — one row per (scheme, scope, period)
-- =============================================
-- Counters are addressed by a composite scope:
--   (scheme, branch?, fiscalYear?, period?, seasonId?)
-- A NULL component means "not scoped on that dimension" — `COALESCE`
-- in the unique index turns NULLs into stable sentinels (0 / '') so
-- the index can prevent the duplicate row a partial unique index
-- would otherwise allow.

CREATE TABLE IF NOT EXISTS numbering_counters (
    id SERIAL PRIMARY KEY,
    "schemeId" INTEGER NOT NULL REFERENCES numbering_schemes(id) ON DELETE CASCADE,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "moduleKey" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "fiscalYear" INTEGER,
    period TEXT,
    "seasonId" INTEGER,
    "lastNumber" BIGINT NOT NULL DEFAULT 0
        CHECK ("lastNumber" >= 0),
    "nextNumber" BIGINT NOT NULL DEFAULT 1
        CHECK ("nextNumber" >= 1),
    "lockedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS numbering_counters_unique_scope
    ON numbering_counters (
        "schemeId",
        COALESCE("branchId", 0),
        COALESCE("fiscalYear", 0),
        COALESCE(period, ''),
        COALESCE("seasonId", 0)
    );
CREATE INDEX IF NOT EXISTS numbering_counters_company_idx
    ON numbering_counters ("companyId");

-- =============================================
-- 3. numbering_assignments — every issued number, ever
-- =============================================

CREATE TABLE IF NOT EXISTS numbering_assignments (
    id SERIAL PRIMARY KEY,
    "schemeId" INTEGER NOT NULL REFERENCES numbering_schemes(id),
    "counterId" INTEGER NOT NULL REFERENCES numbering_counters(id),
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "moduleKey" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "entityTable" TEXT NOT NULL,
    "entityId" INTEGER,
    number TEXT NOT NULL,
    "sequenceValue" BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'assigned'
        CHECK (status IN ('reserved','assigned','cancelled','voided','released')),
    "issuedBy" INTEGER,
    "issuedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "assignedAt" TIMESTAMP WITH TIME ZONE,
    "voidReason" TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT numbering_assignments_number_not_empty
        CHECK (number <> '')
);

-- Uniqueness: a (company, module, entity, number) tuple is one-and-
-- only-one. Voided / cancelled rows still occupy the number — re-use
-- requires a deliberate policy (kept simple: counters never decrement).
CREATE UNIQUE INDEX IF NOT EXISTS numbering_assignments_unique_number
    ON numbering_assignments ("companyId", "moduleKey", "entityKey", number);
CREATE INDEX IF NOT EXISTS numbering_assignments_entity_idx
    ON numbering_assignments ("entityTable", "entityId");
CREATE INDEX IF NOT EXISTS numbering_assignments_scheme_idx
    ON numbering_assignments ("schemeId");
CREATE INDEX IF NOT EXISTS numbering_assignments_status_idx
    ON numbering_assignments ("status");

-- =============================================
-- 4. numbering_audit_logs — append-only audit trail
-- =============================================

CREATE TABLE IF NOT EXISTS numbering_audit_logs (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "actorId" INTEGER,
    action TEXT NOT NULL,
    "schemeId" INTEGER,
    "assignmentId" INTEGER,
    "entityTable" TEXT,
    "entityId" INTEGER,
    "before" JSONB,
    "after" JSONB,
    reason TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS numbering_audit_logs_company_idx
    ON numbering_audit_logs ("companyId");
CREATE INDEX IF NOT EXISTS numbering_audit_logs_scheme_idx
    ON numbering_audit_logs ("schemeId");
CREATE INDEX IF NOT EXISTS numbering_audit_logs_assignment_idx
    ON numbering_audit_logs ("assignmentId");
CREATE INDEX IF NOT EXISTS numbering_audit_logs_created_idx
    ON numbering_audit_logs ("createdAt");

-- =============================================
-- 5. Default scheme seeding for every existing company
-- =============================================
-- The default policy catalog mirrors the table in issue #1141.
-- Every existing company in the system gets one row per (module, entity)
-- so the numbering service has a policy to issue against from day 1.

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
