-- ============================================================================
-- 068_umrah_season_1447_seed.sql
-- Seeds the Hijri 1447 Umrah season for every existing company that doesn't
-- already have it. Sets is_current = TRUE so the UI/import engine pick it up
-- as the default active season.
--
-- Hijri 1447 spans roughly 2025-06-26 → 2026-06-16 Gregorian.
--
-- Idempotent: uses NOT EXISTS so running twice is safe, and skips companies
-- that already have a 1447 row (matched by hijriYear).
-- ============================================================================

INSERT INTO umrah_seasons (
  "companyId",
  title,
  "hijriYear",
  "startDate",
  "endDate",
  "isCurrent",
  status,
  notes,
  "createdAt",
  "updatedAt"
)
SELECT
  c.id                       AS "companyId",
  'موسم عمرة 1447 هـ'        AS title,
  1447                       AS "hijriYear",
  '2025-06-26'::date         AS "startDate",
  '2026-06-16'::date         AS "endDate",
  TRUE                       AS "isCurrent",
  'open'                     AS status,
  'الموسم الحالي (مُضاف بواسطة المهاجر 068)' AS notes,
  NOW(),
  NOW()
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM umrah_seasons s
  WHERE s."companyId" = c.id
    AND s."hijriYear" = 1447
    AND s."deletedAt" IS NULL
);

-- When the 1447 season is newly marked current, relax any other season of the
-- same company that was flagged current — only one season should be current.
UPDATE umrah_seasons target
SET "isCurrent" = FALSE, "updatedAt" = NOW()
FROM umrah_seasons current_1447
WHERE target."companyId"    = current_1447."companyId"
  AND current_1447."hijriYear" = 1447
  AND current_1447."isCurrent" = TRUE
  AND target.id              != current_1447.id
  AND target."isCurrent"      = TRUE
  AND target."deletedAt" IS NULL;

-- ============================================================================
-- End of 068_umrah_season_1447_seed.sql
-- ============================================================================
