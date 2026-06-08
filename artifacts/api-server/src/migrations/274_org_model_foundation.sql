-- Migration 274 — Operational Enterprise Model foundation (#1799 §B)
--
-- @rollback: Fully additive. To undo (reverse-dependency order):
--   DROP TABLE IF EXISTS employee_committee_memberships;
--   DROP TABLE IF EXISTS employee_project_assignments;
--   DROP TABLE IF EXISTS employee_team_memberships;
--   DROP TABLE IF EXISTS committees;
--   DROP TABLE IF EXISTS teams;
--   ALTER TABLE employee_assignments DROP COLUMN IF EXISTS "positionId";
--   ALTER TABLE employee_assignments DROP COLUMN IF EXISTS "legalEntityId";
--   ALTER TABLE branches DROP COLUMN IF EXISTS "legalEntityId";
--   DROP TABLE IF EXISTS positions;
--   DROP TABLE IF EXISTS legal_entities;
--
-- The inventory (docs/HR_OPERATING_FOUNDATION_TASK.md §A.10 + §B)
-- found the system models the employee through only 2 dimensions:
-- companyId + departmentId. The «نموذج المؤسسة التشغيلي» section
-- requires 6 more: legalEntity, position, team, committee, project,
-- supervisionLine.
--
-- This migration establishes the schema for the first 5. The 6
-- bridges + position catalog let the system answer all six pivotal
-- questions:
--   - من يتبع من؟       (managerId + supervisionLines later)
--   - من يعتمد من؟      (approval_authorities later)
--   - من يرى من؟        (RBAC scope=team/project)
--   - من يتحمل التكلفة؟ (employee_project_assignments.allocationPercent)
--   - كيف يرتبط الموظف بالمشاريع/اللجان/الفرق؟  (3 bridge tables)

-- ════════════════════════════════════════════════════════════════════
-- 1. legal_entities (one company can have multiple ZATCA/CR entities)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS legal_entities (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "nameAr" VARCHAR(200) NOT NULL,
  "nameEn" VARCHAR(200),
  "crNumber" VARCHAR(40),
  "vatNumber" VARCHAR(40),
  "taxNumber" VARCHAR(40),
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_entities_company
  ON legal_entities("companyId") WHERE "isActive" = TRUE;

-- branches.legalEntityId — nullable so existing rows aren't broken.
-- Companies that don't use multi-entity stay untouched.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'legalEntityId'
  ) THEN
    ALTER TABLE branches ADD COLUMN "legalEntityId" INTEGER REFERENCES legal_entities(id);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- 2. positions (distinct from job_titles — مدير قسم vs محامي)
-- ════════════════════════════════════════════════════════════════════
-- job_titles holds the PROFESSIONAL identity (محامي / محاسب / سائق).
-- positions holds the ADMINISTRATIVE role (مدير قسم / نائب / مشرف).
-- Same person can be «محامي» (job_title) holding the «مدير قسم
-- القانوني» (position).
CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER REFERENCES companies(id) ON DELETE CASCADE, -- NULL = system catalog
  "positionKey" VARCHAR(50) NOT NULL,
  "labelAr" VARCHAR(120) NOT NULL,
  "labelEn" VARCHAR(120),
  description TEXT,
  -- Hierarchy level — bigger = more senior. Used for org-chart
  -- rendering and «who can approve whom» rules.
  level SMALLINT NOT NULL DEFAULT 50,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("companyId", "positionKey")
);

-- Seed the 9 system positions (companyId IS NULL = template).
INSERT INTO positions ("companyId", "positionKey", "labelAr", "labelEn", level)
VALUES
  (NULL, 'staff',           'موظف',             'Staff',                10),
  (NULL, 'specialist',      'أخصائي',           'Specialist',           20),
  (NULL, 'senior',           'أخصائي أول',       'Senior Specialist',    30),
  (NULL, 'team_lead',        'قائد فريق',         'Team Lead',            40),
  (NULL, 'supervisor',       'مشرف',              'Supervisor',           50),
  (NULL, 'assistant_manager','نائب مدير',         'Assistant Manager',    60),
  (NULL, 'manager',          'مدير قسم',           'Department Manager',   70),
  (NULL, 'general_manager',  'مدير عام',           'General Manager',      85),
  (NULL, 'executive',         'تنفيذي',            'Executive',            95)
ON CONFLICT ("companyId", "positionKey") DO NOTHING;

-- employee_assignments.positionId — the position this assignment
-- represents (manager of dept X, supervisor of branch Y).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employee_assignments' AND column_name = 'positionId'
  ) THEN
    ALTER TABLE employee_assignments ADD COLUMN "positionId" INTEGER REFERENCES positions(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employee_assignments' AND column_name = 'legalEntityId'
  ) THEN
    ALTER TABLE employee_assignments ADD COLUMN "legalEntityId" INTEGER REFERENCES legal_entities(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_employee_assignments_positionId
  ON employee_assignments("positionId") WHERE "positionId" IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════
-- 3. teams (sub-unit within a department)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "departmentId" INTEGER REFERENCES departments(id),
  "leaderAssignmentId" INTEGER REFERENCES employee_assignments(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  -- Whether the team's visibility scope counts for RBAC (so scope=team
  -- can be enforced for queries against this team's records).
  "scopeType" VARCHAR(30) DEFAULT 'department',  -- department | branch | cross_company
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teams_company_active
  ON teams("companyId") WHERE "isActive" = TRUE;

-- ════════════════════════════════════════════════════════════════════
-- 4. committees (cross-department + time-bounded)
-- ════════════════════════════════════════════════════════════════════
-- Unlike teams (which sit inside a department), committees are
-- cross-department by design. They have a chair + a start/end date +
-- a type. Examples: لجنة المشتريات، لجنة السلامة، لجنة الانضباط.
CREATE TABLE IF NOT EXISTS committees (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(40) NOT NULL,   -- audit | discipline | safety | procurement | ...
  "chairAssignmentId" INTEGER REFERENCES employee_assignments(id),
  description TEXT,
  "startDate" DATE,
  "endDate" DATE,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_committees_company_active
  ON committees("companyId") WHERE "isActive" = TRUE;

-- ════════════════════════════════════════════════════════════════════
-- 5. employee_team_memberships
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS employee_team_memberships (
  id SERIAL PRIMARY KEY,
  "assignmentId" INTEGER NOT NULL REFERENCES employee_assignments(id) ON DELETE CASCADE,
  "teamId" INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role VARCHAR(40) DEFAULT 'member',  -- member | lead | observer
  "startDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  "endDate" DATE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("assignmentId", "teamId")
);

-- ════════════════════════════════════════════════════════════════════
-- 6. employee_project_assignments (with allocation% for cost split)
-- ════════════════════════════════════════════════════════════════════
-- A moviemaker who spends 60% on Project A, 40% on Project B, gets
-- TWO rows. Allocation percentages should sum to 100 in practice
-- (enforced at app layer, not DB CHECK, so HR can temporarily set
-- 70%/40% during a transition window). Cost engines read these to
-- distribute salary across project cost centers.
CREATE TABLE IF NOT EXISTS employee_project_assignments (
  id SERIAL PRIMARY KEY,
  "assignmentId" INTEGER NOT NULL REFERENCES employee_assignments(id) ON DELETE CASCADE,
  "projectId" INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role VARCHAR(80) DEFAULT 'contributor',  -- contributor | lead | reviewer
  "allocationPercent" NUMERIC(5,2) NOT NULL DEFAULT 100.00 CHECK ("allocationPercent" > 0 AND "allocationPercent" <= 100),
  "startDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  "endDate" DATE,
  -- Optional: which cost center collects this assignment's payroll
  -- share. NULL = inherit project's default cost center.
  "costCenterId" INTEGER REFERENCES cost_centers(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("assignmentId", "projectId", "startDate")
);
CREATE INDEX IF NOT EXISTS idx_emp_project_assignments_active
  ON employee_project_assignments("assignmentId") WHERE "endDate" IS NULL;

-- ════════════════════════════════════════════════════════════════════
-- 7. employee_committee_memberships
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS employee_committee_memberships (
  id SERIAL PRIMARY KEY,
  "assignmentId" INTEGER NOT NULL REFERENCES employee_assignments(id) ON DELETE CASCADE,
  "committeeId" INTEGER NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
  role VARCHAR(40) DEFAULT 'member',   -- member | chair | secretary
  "isVoting" BOOLEAN NOT NULL DEFAULT TRUE,
  "startDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  "endDate" DATE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("assignmentId", "committeeId")
);
