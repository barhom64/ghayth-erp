-- Migration 287 — Administrative layer between branch and department (#2077 PR-7).
--
-- @rollback: Fully additive. To undo:
--   ALTER TABLE departments DROP COLUMN IF EXISTS "administrationId";
--   DROP TABLE IF EXISTS administrations;
--
-- The product owner's deep audit (docs/hr/HR_FIVE_AREAS_DEEP_AUDIT.md §٣)
-- found that «إدارة» — the level between Branch and Department — was
-- completely dark in the schema. The org tree the operator wanted is:
--
--   Company → Branch → Administration → Department → Team
--
-- but the codebase only had Company → Branch → Department → Team. PR-7
-- adds the missing level so HR can group departments under an
-- administrative parent (إدارة التشغيل, إدارة المالية, إدارة الموارد
-- البشرية, …) — same shape every mid-size Saudi org chart uses.
--
-- IMPORTANT: This migration is ONLY additive. The `departments.parentId`
-- column that already exists in the schema (see schema_pre.sql) is left
-- in place but kept dormant; this PR does NOT migrate sub-departments
-- into an administrations row, because the operator's current
-- inventory has zero rows using parentId (verified live).
--
-- The administrationId is NULLABLE for back-compat — every existing
-- department row currently has it = NULL. The admin UI lets HR fill
-- it in incrementally; the employee wizard doesn't require it (yet)
-- so seed scripts + tests don't break.
--
-- Committee / Project / Cost Center are deliberately NOT inserted into
-- this hierarchy. The product owner's decision: they are «ارتباطات
-- تشغيلية فوق الشجرة وليست جزءًا منها». They keep their existing
-- bridge tables (employee_committee_memberships,
-- employee_project_assignments, employee_assignments.costCenterId
-- via the project bridge) — see PR-1 wiring.

CREATE TABLE IF NOT EXISTS administrations (
  id BIGSERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId" INTEGER REFERENCES branches(id),
  "managerAssignmentId" INTEGER, -- FK enforced at app level (employee_assignments)
  name VARCHAR(200) NOT NULL,
  "nameEn" VARCHAR(200),
  description TEXT,
  "isActive" BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now(),
  UNIQUE ("companyId", name)
);

CREATE INDEX IF NOT EXISTS idx_administrations_company_active
  ON administrations("companyId") WHERE "isActive" = TRUE;
CREATE INDEX IF NOT EXISTS idx_administrations_branch
  ON administrations("branchId") WHERE "branchId" IS NOT NULL;

-- ── Wire departments → administrations ────────────────────────────────
-- Adding `administrationId` so a department can name its parent
-- administration. Existing rows = NULL = «orphan قسم» that the admin
-- UI surfaces with an «بدون إدارة» badge. HR Manager assigns it later.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'departments' AND column_name = 'administrationId'
  ) THEN
    ALTER TABLE departments ADD COLUMN "administrationId" BIGINT REFERENCES administrations(id);
    CREATE INDEX idx_departments_administration
      ON departments("administrationId") WHERE "administrationId" IS NOT NULL;
  END IF;
END $$;
