-- ===========================================================================
-- 448_site_cms.sql
-- ---------------------------------------------------------------------------
-- WHAT:  Multi-tenant website CMS — site_config (one per company) + content
--        tables (packages, services, hotels, posts). Lets Ghayth CONTROL each
--        company's public website from the admin UI instead of hardcoding it
--        in the React artifact.
-- WHY:   موائمة بدون تكرار — every company can have a site (standard/managed)
--        with a custom domain, edited through Ghayth. No duplicate backend.
-- SAFETY: additive — new tables + indexes only. Safe for rolling deploy.
-- @rollback: DROP TABLE IF EXISTS site_posts; DROP TABLE IF EXISTS site_hotels; DROP TABLE IF EXISTS site_services; DROP TABLE IF EXISTS site_packages; DROP TABLE IF EXISTS site_config;
-- ===========================================================================

-- ── إعدادات موقع الشركة (صف واحد لكل شركة) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS site_config (
  "companyId"       INTEGER PRIMARY KEY REFERENCES companies(id),
  enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  template          TEXT NOT NULL DEFAULT 'standard',
  slug              TEXT NOT NULL,
  "customDomain"    TEXT,
  "brandName"       TEXT,
  tagline           TEXT,
  "logoUrl"         TEXT,
  "primaryColor"    TEXT NOT NULL DEFAULT 'oklch(0.52 0.12 185)',
  phone             TEXT,
  whatsapp          TEXT,
  email             TEXT,
  address           TEXT,
  socials           JSONB NOT NULL DEFAULT '{}'::jsonb,
  "heroTitle"       TEXT,
  "heroSubtitle"    TEXT,
  "heroImageUrl"    TEXT,
  "aboutTitle"      TEXT,
  "aboutBody"       TEXT,
  "metaTitle"       TEXT,
  "metaDescription" TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_config_slug ON site_config (LOWER(slug));
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_config_domain ON site_config (LOWER("customDomain")) WHERE "customDomain" IS NOT NULL;

-- ── الباقات (برامج العمرة/الحج) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_packages (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id),
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  subtitle        TEXT,
  price           NUMERIC(12,2),
  currency        TEXT NOT NULL DEFAULT 'SAR',
  "durationLabel" TEXT,
  "durationDays"  INTEGER,
  badge           TEXT,
  features        JSONB NOT NULL DEFAULT '[]'::jsonb,
  "notIncluded"   JSONB NOT NULL DEFAULT '[]'::jsonb,
  "imageUrl"      TEXT,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "deletedAt"     TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_packages_company ON site_packages ("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_packages_company_slug ON site_packages ("companyId", LOWER(slug)) WHERE "deletedAt" IS NULL;

-- ── الخدمات ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_services (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id),
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  subtitle      TEXT,
  description   TEXT,
  icon          TEXT,
  link          TEXT,
  features      JSONB NOT NULL DEFAULT '[]'::jsonb,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "deletedAt"   TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_services_company ON site_services ("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_services_company_slug ON site_services ("companyId", LOWER(slug)) WHERE "deletedAt" IS NULL;

-- ── الفنادق ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_hotels (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id),
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  city            TEXT,
  "distanceLabel" TEXT,
  stars           INTEGER,
  badge           TEXT,
  "imageUrl"      TEXT,
  description     TEXT,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "deletedAt"     TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_hotels_company ON site_hotels ("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_hotels_company_slug ON site_hotels ("companyId", LOWER(slug)) WHERE "deletedAt" IS NULL;

-- ── المدوّنة/المقالات ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_posts (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id),
  slug            TEXT NOT NULL,
  title           TEXT NOT NULL,
  excerpt         TEXT,
  body            TEXT,
  "coverImageUrl" TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
  "publishedAt"   TIMESTAMPTZ,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "deletedAt"     TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_posts_company ON site_posts ("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_posts_company_slug ON site_posts ("companyId", LOWER(slug)) WHERE "deletedAt" IS NULL;
