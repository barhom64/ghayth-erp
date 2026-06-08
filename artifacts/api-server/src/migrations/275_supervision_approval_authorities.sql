-- Migration 275 — Supervision lines + approval authorities (#1799 §B.3-B.4)
--
-- @rollback: Fully additive. To undo:
--   DROP TABLE IF EXISTS approval_authorities;
--   DROP TABLE IF EXISTS supervision_lines;
--
-- Completes the org-model bridges started in migration 274. The two
-- tables here answer the LAST two of #1799 §B.4's six pivotal
-- questions that weren't yet covered:
--
--   من يتبع من؟  — beyond direct managerId (already in
--                  employee_assignments.managerId), real orgs have
--                  matrix reporting: a backend engineer reports
--                  ADMINISTRATIVELY to the IT manager and
--                  PROJECT-WISE to a project lead. supervision_lines
--                  captures these extra lines.
--
--   من يعتمد من؟ — beyond role-based chains (approval_chains.requiredRole),
--                  some approvals need a PERSON-LEVEL authority — «المدير
--                  المالي محمد يعتمد حتى 500K، نائبه أحمد حتى 100K». That's
--                  approval_authorities.

-- ════════════════════════════════════════════════════════════════════
-- supervision_lines — matrix reporting (multi-axis)
-- ════════════════════════════════════════════════════════════════════
-- The supervisor + supervisee are both assignment IDs (not employees),
-- so cross-company supervision (e.g. a regional CTO supervising a
-- subsidiary's IT lead) works without ambiguity.
--
-- `lineType` distinguishes the axis: administrative is the default
-- org-chart line, project = matrix line for a project context,
-- functional = a dotted line for technical guidance.
CREATE TABLE IF NOT EXISTS supervision_lines (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "supervisorAssignmentId" INTEGER NOT NULL REFERENCES employee_assignments(id) ON DELETE CASCADE,
  "superviseeAssignmentId" INTEGER NOT NULL REFERENCES employee_assignments(id) ON DELETE CASCADE,
  "lineType" VARCHAR(20) NOT NULL DEFAULT 'administrative'
    CHECK ("lineType" IN ('administrative', 'project', 'functional', 'dotted')),
  -- Optional scope to bound the supervision (project ID for project
  -- lines, team ID for team-lead lines, NULL for company-wide).
  "scopeType" VARCHAR(20),  -- project | team | committee | branch | null
  "scopeId" INTEGER,
  "startDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  "endDate" DATE,
  "isPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Self-supervision is meaningless and almost always a bug; reject
  -- at the DB layer.
  CHECK ("supervisorAssignmentId" <> "superviseeAssignmentId"),
  -- One (supervisor, supervisee, line type, scope) pair is unique.
  -- Different scopes (e.g. project A vs project B) are allowed
  -- under the same pair so the supervisor can lead an engineer on
  -- two different projects without merging the lines.
  UNIQUE ("supervisorAssignmentId", "superviseeAssignmentId", "lineType", "scopeType", "scopeId")
);

CREATE INDEX IF NOT EXISTS idx_supervision_lines_supervisee
  ON supervision_lines("superviseeAssignmentId") WHERE "endDate" IS NULL;
CREATE INDEX IF NOT EXISTS idx_supervision_lines_supervisor
  ON supervision_lines("supervisorAssignmentId") WHERE "endDate" IS NULL;

-- ════════════════════════════════════════════════════════════════════
-- approval_authorities — per-person approval limits
-- ════════════════════════════════════════════════════════════════════
-- `rbac_approval_limits` (migration 109) already binds limits to a
-- ROLE — every accountant_manager can approve up to 100K. Real orgs
-- need PERSON-level overrides: «أحمد المحاسب الكبير يعتمد إلى 200K
-- رغم أن دوره العام limited to 100K».
--
-- approval_authorities records that override per (assignment × feature
-- × action). When the authorize() engine resolves a request, it checks
-- assignment-level limit first, then falls back to role-level.
CREATE TABLE IF NOT EXISTS approval_authorities (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "assignmentId" INTEGER NOT NULL REFERENCES employee_assignments(id) ON DELETE CASCADE,
  "featureKey" VARCHAR(80) NOT NULL,   -- e.g. 'finance.invoices', 'hr.leaves'
  action VARCHAR(40) NOT NULL,          -- e.g. 'approve', 'release'
  currency VARCHAR(3) NOT NULL DEFAULT 'SAR',
  "maxAmount" NUMERIC(14,2),            -- NULL = unlimited
  "requiresDualControl" BOOLEAN NOT NULL DEFAULT FALSE,
  -- The reason this person-level grant exists. Required because these
  -- overrides bypass the role matrix; auditors want a paper trail.
  reason TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ,
  "grantedBy" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("assignmentId", "featureKey", action, currency)
);

CREATE INDEX IF NOT EXISTS idx_approval_authorities_assignment
  ON approval_authorities("assignmentId")
  WHERE "expiresAt" IS NULL OR "expiresAt" > now();
