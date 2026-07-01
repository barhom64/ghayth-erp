-- ===========================================================================
-- 452_site_cms_expansion.sql
-- ---------------------------------------------------------------------------
-- WHAT:  Expands the multi-tenant website CMS (448) with the remaining content
--        blocks so a company can fully control its public site from Ghayth:
--        FAQ, testimonials, team members, image gallery, promo/campaign
--        banners, and the top navigation menu.
-- WHY:   موائمة بدون تكرار — كل ما كان ثابتًا في قالب الموقع (الأسئلة الشائعة،
--        آراء العملاء، الفريق، المعرض، البانر الإعلاني، القائمة) صار محرَّرًا من
--        لوحة تحكم غيث لكل شركة على حدة.
-- SAFETY: additive — new tables + indexes only. Safe for rolling deploy.
-- @rollback: DROP TABLE IF EXISTS site_nav_items; DROP TABLE IF EXISTS site_banners; DROP TABLE IF EXISTS site_gallery; DROP TABLE IF EXISTS site_team; DROP TABLE IF EXISTS site_testimonials; DROP TABLE IF EXISTS site_faqs;
-- ===========================================================================

-- ── الأسئلة الشائعة ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_faqs (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id),
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  category      TEXT,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "deletedAt"   TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_faqs_company ON site_faqs ("companyId");

-- ── آراء العملاء ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_testimonials (
  id             SERIAL PRIMARY KEY,
  "companyId"    INTEGER NOT NULL REFERENCES companies(id),
  "authorName"   TEXT NOT NULL,
  "authorTitle"  TEXT,
  body           TEXT NOT NULL,
  rating         INTEGER,
  "avatarUrl"    TEXT,
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "isActive"     BOOLEAN NOT NULL DEFAULT TRUE,
  "deletedAt"    TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_testimonials_company ON site_testimonials ("companyId");

-- ── فريق العمل ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_team (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id),
  name          TEXT NOT NULL,
  role          TEXT,
  bio           TEXT,
  "photoUrl"    TEXT,
  socials       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "deletedAt"   TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_team_company ON site_team ("companyId");

-- ── معرض الصور ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_gallery (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id),
  title         TEXT,
  "imageUrl"    TEXT NOT NULL,
  category      TEXT,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "deletedAt"   TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_gallery_company ON site_gallery ("companyId");

-- ── البانرات الإعلانية / الحملات ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_banners (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id),
  title         TEXT NOT NULL,
  message       TEXT,
  "ctaLabel"    TEXT,
  "ctaUrl"      TEXT,
  "imageUrl"    TEXT,
  "bgColor"     TEXT,
  "startsAt"    TIMESTAMPTZ,
  "endsAt"      TIMESTAMPTZ,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "deletedAt"   TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_banners_company ON site_banners ("companyId");

-- ── قائمة التنقّل العلوية ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_nav_items (
  id             SERIAL PRIMARY KEY,
  "companyId"    INTEGER NOT NULL REFERENCES companies(id),
  label          TEXT NOT NULL,
  url            TEXT NOT NULL,
  "openInNewTab" BOOLEAN NOT NULL DEFAULT FALSE,
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "isActive"     BOOLEAN NOT NULL DEFAULT TRUE,
  "deletedAt"    TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_nav_items_company ON site_nav_items ("companyId");
