-- 388_vendor_secrets_per_company.sql
-- Per-company vendor secrets — starting with per-company SMTP ("بريد الشركة").
--
-- Adds a nullable "companyId" so a slug can have ONE platform row
-- (companyId IS NULL) PLUS one row per company. resolveSystemSmtpConfig then
-- prefers a company's own active SMTP row over the platform default, while a
-- company with no row falls through to the platform default UNCHANGED.
--
-- SAFE / idempotent — designed so it can NEVER break the boot card-seed on
-- production:
--   * the column is additive and NULL for every existing row;
--   * UNIQUE(slug) is replaced by TWO partial unique indexes that the existing
--     platform rows already satisfy (each slug appears once with companyId
--     NULL), so no existing row violates anything;
--   * the boot seed keeps inserting via ON CONFLICT (slug) WHERE "companyId"
--     IS NULL, matched by vendor_secrets_slug_platform_uq below.
-- Every statement is IF EXISTS / IF NOT EXISTS so a re-run is a no-op.
--
-- @rollback: DROP INDEX vendor_secrets_slug_company_uq, vendor_secrets_slug_platform_uq;
--            ALTER TABLE public.vendor_secrets ADD CONSTRAINT vendor_secrets_slug_key UNIQUE (slug);
--            ALTER TABLE public.vendor_secrets DROP CONSTRAINT IF EXISTS vendor_secrets_company_fk;
--            ALTER TABLE public.vendor_secrets DROP COLUMN IF EXISTS "companyId";
--            (the UNIQUE(slug) restore only succeeds if no per-company rows exist.)

ALTER TABLE public.vendor_secrets ADD COLUMN IF NOT EXISTS "companyId" integer;

-- Idempotent FK (drop-then-add — never throws 42710 on re-run).
ALTER TABLE public.vendor_secrets DROP CONSTRAINT IF EXISTS vendor_secrets_company_fk;
ALTER TABLE public.vendor_secrets
  ADD CONSTRAINT vendor_secrets_company_fk
  FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;

-- @policy:breaking — drops the global UNIQUE(slug) and replaces it with the
-- partial unique indexes below. This is SAFE under rolling deploy: the only
-- consumers of ON CONFLICT (slug) are the boot-time seeds (migration 340/385
-- + ensureVendorSecretsSeed), which run once per container boot. Migrations
-- run before the new code serves, and the new code's seed targets the
-- partial index (ON CONFLICT (slug) WHERE "companyId" IS NULL); the old
-- container already finished its boot-seed and performs no further
-- ON CONFLICT (slug) inserts at runtime. Platform slug-uniqueness is fully
-- preserved by vendor_secrets_slug_platform_uq.
ALTER TABLE public.vendor_secrets DROP CONSTRAINT IF EXISTS vendor_secrets_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_secrets_slug_platform_uq
  ON public.vendor_secrets (slug) WHERE "companyId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_secrets_slug_company_uq
  ON public.vendor_secrets (slug, "companyId") WHERE "companyId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS vendor_secrets_company_idx
  ON public.vendor_secrets ("companyId") WHERE "companyId" IS NOT NULL;
