-- 253_subscription_features.sql
--
-- WHAT:    three new tables that turn the existing whole-company
--          `companies.subscriptionStatus` into a per-feature entitlement
--          model:
--            subscription_products          — sellable SKUs (e.g.
--                                            "fleet", "umrah", "hr_premium")
--            subscription_features          — fine-grained features inside
--                                            a product (each route declares
--                                            one of these as required)
--            company_subscription_features  — per-company per-feature row
--                                            (status + optional expires_at)
--
-- WHY:     P4 of the workflow plan (finding #5 — "subscription gate is
--          whole-company, not per-route"). Today every authenticated
--          request goes through `subscriptionGate` which only checks
--          companies.subscriptionStatus. There is no way to sell a
--          customer "fleet only" or "HR but no umrah". This shape gives
--          each domain router its own `featureGate("<feature_key>")`
--          mount that returns 402 FEATURE_NOT_SUBSCRIBED for companies
--          without the entitlement, while the existing subscriptionGate
--          stays as the whole-company safety net (expired / cancelled).
--
-- SAFETY:  pure additive. New tables. The seed inserts a row for every
--          existing company × every feature with status='active', so
--          NO existing customer loses access on deploy — the gate is
--          permissive by default until ops trims entitlements per
--          contract.
--
-- @rollback:
--   DROP TABLE IF EXISTS public.company_subscription_features;
--   DROP TABLE IF EXISTS public.subscription_features;
--   DROP TABLE IF EXISTS public.subscription_products;

BEGIN;

-- ─── 1. Product SKUs ────────────────────────────────────────────────────
-- A product is the unit of sale (one line on the invoice). Features
-- inside it are toggled together — losing "fleet" hides every fleet
-- feature at once. Products are seeded by migration; ops adds a new
-- product when commercial wants a new SKU on the price list.

CREATE TABLE IF NOT EXISTS public.subscription_products (
    id               serial PRIMARY KEY,
    "productKey"     character varying(60)  NOT NULL UNIQUE,
    "labelAr"        character varying(200) NOT NULL,
    "labelEn"        character varying(200),
    "descriptionAr"  text,
    "displayOrder"   integer DEFAULT 100,
    "isActive"       boolean DEFAULT true NOT NULL,
    "createdAt"      timestamp with time zone DEFAULT now()
);

-- ─── 2. Feature catalog (sellable features, distinct from rbac) ─────────
-- This is INTENTIONALLY a separate table from `feature_catalog`. That
-- table is the RBAC permission catalog ("can the user do X"); this
-- table is the BILLING catalog ("did the company pay for X"). A route
-- typically requires BOTH: featureGate("fleet.advanced_telemetry")
-- + authorize("fleet.vehicles","update").

CREATE TABLE IF NOT EXISTS public.subscription_features (
    id               serial PRIMARY KEY,
    "featureKey"     character varying(120) NOT NULL UNIQUE,
    "productId"      integer NOT NULL REFERENCES public.subscription_products(id) ON DELETE CASCADE,
    "labelAr"        character varying(200) NOT NULL,
    "labelEn"        character varying(200),
    "descriptionAr"  text,
    "displayOrder"   integer DEFAULT 100,
    -- When true, every company that has the parent product implicitly
    -- gets this feature (no per-feature row required). When false, the
    -- feature is an add-on and an explicit row must exist.
    "isCoreToProduct" boolean DEFAULT true NOT NULL,
    "createdAt"      timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_features_product
    ON public.subscription_features ("productId");

-- ─── 3. Per-company entitlement ─────────────────────────────────────────
-- One row per (company, featureKey). status='active' means the company
-- can use the feature; 'expired' / 'cancelled' / 'trial_expired' mean
-- the gate returns 402. expires_at is optional — when set, the gate
-- treats now() > expires_at as 'expired' on the fly (same pattern as
-- companies.trialExpiresAt in subscriptionGate.ts).

CREATE TABLE IF NOT EXISTS public.company_subscription_features (
    id               serial PRIMARY KEY,
    "companyId"      integer NOT NULL,
    "featureKey"     character varying(120) NOT NULL,
    status           character varying(20) DEFAULT 'active' NOT NULL,
    "enabledAt"      timestamp with time zone DEFAULT now(),
    "expiresAt"      timestamp with time zone,
    "lastChangedBy"  integer,
    "lastChangedAt"  timestamp with time zone DEFAULT now(),
    notes            text,
    UNIQUE ("companyId", "featureKey")
);

CREATE INDEX IF NOT EXISTS idx_csf_company
    ON public.company_subscription_features ("companyId");
CREATE INDEX IF NOT EXISTS idx_csf_status
    ON public.company_subscription_features ("companyId", status);

-- ─── 4. Seed the catalog ────────────────────────────────────────────────
-- Pre-seed the seven products that map to the seven big modules
-- currently mounted in _domain-mounts.ts. Adding a new product later
-- = INSERT one row + N feature rows; no schema change.

INSERT INTO public.subscription_products ("productKey", "labelAr", "labelEn", "displayOrder")
VALUES
    ('core',     'الأساسيات',              'Core ERP',           10),
    ('finance',  'المالية والمحاسبة',      'Finance',            20),
    ('hr',       'الموارد البشرية',        'HR',                 30),
    ('fleet',    'إدارة الأسطول',          'Fleet',              40),
    ('crm',      'إدارة العملاء',          'CRM',                50),
    ('umrah',    'العمرة والحج',           'Umrah & Hajj',       60),
    ('logistics','اللوجستيات والمستودعات', 'Logistics',          70),
    ('insights', 'التحليلات والذكاء',      'Insights & AI',      80)
ON CONFLICT ("productKey") DO NOTHING;

-- Seed one "headline" feature per product so the gate has something
-- concrete to check. Routes opt in by mounting featureGate("<key>")
-- in _domain-mounts.ts; un-gated routes keep current behaviour.

INSERT INTO public.subscription_features ("featureKey", "productId", "labelAr", "labelEn")
SELECT v."featureKey", p.id, v."labelAr", v."labelEn"
FROM (VALUES
    ('core.access',              'core',     'الدخول إلى النظام',         'System Access'),
    ('finance.access',           'finance',  'الوحدة المالية',            'Finance Module'),
    ('finance.advanced_reports', 'finance',  'تقارير مالية متقدمة',       'Advanced Finance Reports'),
    ('hr.access',                'hr',       'الموارد البشرية',           'HR Module'),
    ('hr.payroll',               'hr',       'الرواتب والمسيرات',         'Payroll'),
    ('fleet.access',             'fleet',    'إدارة الأسطول',             'Fleet Module'),
    ('fleet.advanced_telemetry', 'fleet',    'تتبع متقدم للمركبات',       'Advanced Telemetry'),
    ('crm.access',               'crm',      'إدارة العملاء',             'CRM Module'),
    ('umrah.access',             'umrah',    'العمرة والحج',              'Umrah & Hajj'),
    ('logistics.access',         'logistics','المستودعات',                'Warehouses'),
    ('insights.ai',              'insights', 'مساعد الذكاء الاصطناعي',    'AI Assistant')
) AS v("featureKey","productKeyRef","labelAr","labelEn")
JOIN public.subscription_products p ON p."productKey" = v."productKeyRef"
ON CONFLICT ("featureKey") DO NOTHING;

-- ─── 5. Grandfather every existing company on every feature ─────────────
-- Backwards-compatible deploy: every tenant that exists today gets
-- status='active' on every seeded feature. Ops disables specific
-- features per company via the admin endpoint (P4.5) once they want
-- to tier customers.

INSERT INTO public.company_subscription_features ("companyId", "featureKey", status)
SELECT c.id, f."featureKey", 'active'
FROM public.companies c
CROSS JOIN public.subscription_features f
ON CONFLICT ("companyId", "featureKey") DO NOTHING;

COMMIT;
