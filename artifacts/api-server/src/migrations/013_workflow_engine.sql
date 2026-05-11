-- Migration 012: Unified Workflow Engine + SLA System

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "requestType" VARCHAR(50) NOT NULL,
  "requestTypeLabel" VARCHAR(100) NOT NULL,
  "isActive" BOOLEAN DEFAULT true,
  "isReturnable" BOOLEAN DEFAULT true,
  "enableEscalation" BOOLEAN DEFAULT true,
  "defaultSlaHours" INTEGER DEFAULT 48,
  description TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("companyId", "requestType")
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id SERIAL PRIMARY KEY,
  "definitionId" INTEGER NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  "stepOrder" INTEGER NOT NULL DEFAULT 1,
  "stepName" VARCHAR(100) NOT NULL,
  "requiredRole" VARCHAR(50) NOT NULL,
  "slaHours" INTEGER DEFAULT 48,
  "autoApproveOnTimeout" BOOLEAN DEFAULT false,
  "canReject" BOOLEAN DEFAULT true,
  "canRefer" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("definitionId", "stepOrder")
);

CREATE TABLE IF NOT EXISTS workflow_instances (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "definitionId" INTEGER REFERENCES workflow_definitions(id),
  "requestType" VARCHAR(50) NOT NULL,
  "requestTypeLabel" VARCHAR(100),
  "refTable" VARCHAR(100),
  "refId" INTEGER,
  title VARCHAR(255),
  "submittedBy" INTEGER,
  "submittedByName" VARCHAR(255),
  status VARCHAR(30) DEFAULT 'pending',
  "currentStepOrder" INTEGER DEFAULT 1,
  "currentAssignee" INTEGER,
  "expectedCompletionAt" TIMESTAMPTZ,
  "slaStatus" VARCHAR(20) DEFAULT 'normal',
  "completedAt" TIMESTAMPTZ,
  data JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wf_instances_company ON workflow_instances("companyId");
CREATE INDEX IF NOT EXISTS idx_wf_instances_status ON workflow_instances(status);
CREATE INDEX IF NOT EXISTS idx_wf_instances_ref ON workflow_instances("refTable", "refId");
CREATE INDEX IF NOT EXISTS idx_wf_instances_assignee ON workflow_instances("currentAssignee");
CREATE INDEX IF NOT EXISTS idx_wf_instances_sla ON workflow_instances("slaStatus") WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS workflow_step_actions (
  id SERIAL PRIMARY KEY,
  "instanceId" INTEGER NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  "stepOrder" INTEGER NOT NULL,
  "stepName" VARCHAR(100),
  action VARCHAR(30) NOT NULL,
  "actionBy" INTEGER,
  "actionByName" VARCHAR(255),
  "assignedRole" VARCHAR(50),
  notes TEXT,
  attachments JSONB DEFAULT '[]',
  "beforeData" JSONB,
  "afterData" JSONB,
  "referredTo" INTEGER,
  "referredToName" VARCHAR(255),
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wf_step_actions_instance ON workflow_step_actions("instanceId");

CREATE TABLE IF NOT EXISTS sla_definitions (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "requestType" VARCHAR(50) NOT NULL,
  "warningHours" INTEGER DEFAULT 24,
  "deadlineHours" INTEGER DEFAULT 48,
  "escalationHours" INTEGER DEFAULT 72,
  "autoApproveOnTimeout" BOOLEAN DEFAULT false,
  "escalateTo" VARCHAR(50) DEFAULT 'hr',
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("companyId", "requestType")
);
