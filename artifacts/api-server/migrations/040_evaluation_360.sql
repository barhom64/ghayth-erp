-- ============================================================
-- Migration 026: 360° Smart Employee Evaluation System
-- ============================================================

-- دورات التقييم: تحدد فترة التقييم والموظف المُقيَّم
CREATE TABLE IF NOT EXISTS evaluation_cycles (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "employeeId"    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  "initiatorId"   INTEGER REFERENCES employees(id),
  period          VARCHAR(50) NOT NULL,
  "startDate"     DATE NOT NULL DEFAULT CURRENT_DATE,
  "endDate"       DATE,
  status          VARCHAR(20) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','completed','closed')),
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evaluation_cycles_company_idx ON evaluation_cycles ("companyId");
CREATE INDEX IF NOT EXISTS evaluation_cycles_employee_idx ON evaluation_cycles ("employeeId");

-- التقييم الآلي: محسوب تلقائياً من بيانات النظام
CREATE TABLE IF NOT EXISTS system_evaluations (
  id              SERIAL PRIMARY KEY,
  "cycleId"       INTEGER NOT NULL REFERENCES evaluation_cycles(id) ON DELETE CASCADE,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "employeeId"    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  "attendanceScore"     NUMERIC(5,2) DEFAULT 0,
  "taskCompletionScore" NUMERIC(5,2) DEFAULT 0,
  "onTimeScore"         NUMERIC(5,2) DEFAULT 0,
  "clientSatScore"      NUMERIC(5,2) DEFAULT 0,
  "docQualityScore"     NUMERIC(5,2) DEFAULT 0,
  "overallScore"        NUMERIC(5,2) DEFAULT 0,
  metrics         JSONB,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS system_evaluations_cycle_idx ON system_evaluations ("cycleId");

-- تقييم المدير والزملاء
CREATE TABLE IF NOT EXISTS peer_evaluations (
  id              SERIAL PRIMARY KEY,
  "cycleId"       INTEGER NOT NULL REFERENCES evaluation_cycles(id) ON DELETE CASCADE,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "evaluatorId"   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  "employeeId"    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  "evaluatorRole" VARCHAR(20) NOT NULL DEFAULT 'peer'
                    CHECK ("evaluatorRole" IN ('manager','peer','self')),
  "overallScore"  NUMERIC(5,2) NOT NULL,
  scores          JSONB,
  comments        TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS peer_evaluations_cycle_evaluator_idx ON peer_evaluations ("cycleId","evaluatorId");
CREATE INDEX IF NOT EXISTS peer_evaluations_company_idx ON peer_evaluations ("companyId");
CREATE INDEX IF NOT EXISTS peer_evaluations_employee_idx ON peer_evaluations ("employeeId");

-- التقييم العكسي السري: الموظف يقيّم مديره
CREATE TABLE IF NOT EXISTS anonymous_upward_reviews (
  id              SERIAL PRIMARY KEY,
  "cycleId"       INTEGER NOT NULL REFERENCES evaluation_cycles(id) ON DELETE CASCADE,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "managerId"     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  "overallScore"  NUMERIC(5,2) NOT NULL,
  scores          JSONB,
  comments        TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NOTE: لا يُحفظ هوية المقيِّم عمداً لضمان السرية التامة
);

CREATE INDEX IF NOT EXISTS anon_reviews_cycle_idx ON anonymous_upward_reviews ("cycleId");
CREATE INDEX IF NOT EXISTS anon_reviews_manager_idx ON anonymous_upward_reviews ("managerId");

-- ملخص التقييم 360°: يجمع المصادر الثلاثة في سجل واحد
CREATE TABLE IF NOT EXISTS evaluation_summaries (
  id                    SERIAL PRIMARY KEY,
  "cycleId"             INTEGER NOT NULL REFERENCES evaluation_cycles(id) ON DELETE CASCADE,
  "companyId"           INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "employeeId"          INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  "systemScore"         NUMERIC(5,2),
  "peerScore"           NUMERIC(5,2),
  "managerScore"        NUMERIC(5,2),
  "upwardAvgScore"      NUMERIC(5,2),
  "upwardReviewCount"   INTEGER DEFAULT 0,
  "finalScore"          NUMERIC(5,2),
  "completedAt"         TIMESTAMPTZ,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS evaluation_summaries_cycle_idx ON evaluation_summaries ("cycleId");
CREATE INDEX IF NOT EXISTS evaluation_summaries_company_idx ON evaluation_summaries ("companyId");
CREATE INDEX IF NOT EXISTS evaluation_summaries_employee_idx ON evaluation_summaries ("employeeId");
