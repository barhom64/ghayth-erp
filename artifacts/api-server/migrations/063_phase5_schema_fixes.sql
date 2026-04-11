-- Phase 5 schema fixes: align columns with route SQL

-- public_holidays: add updatedAt
ALTER TABLE public_holidays ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

-- employee_transfers: add columns to match route SQL
ALTER TABLE employee_transfers
  ADD COLUMN IF NOT EXISTS "fromDeptId" INTEGER,
  ADD COLUMN IF NOT EXISTS "toDeptId" INTEGER,
  ADD COLUMN IF NOT EXISTS "fromJobTitle" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "toJobTitle" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "fromSalary" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "toSalary" NUMERIC(12,2);

-- employee_development_plans: add missing columns
ALTER TABLE employee_development_plans
  ADD COLUMN IF NOT EXISTS "trainingIds" JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "reviewDate" DATE,
  ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;

-- fleet_preventive_plans: add missing columns
ALTER TABLE fleet_preventive_plans
  ADD COLUMN IF NOT EXISTS "nextServiceMileage" INTEGER,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

-- property_inspections: add missing columns
ALTER TABLE property_inspections
  ADD COLUMN IF NOT EXISTS findings JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

-- project_milestones: add title and targetDate columns (route uses these names)
ALTER TABLE project_milestones
  ADD COLUMN IF NOT EXISTS title VARCHAR(300),
  ADD COLUMN IF NOT EXISTS "targetDate" DATE;

-- project_risks: fix riskScore (route writes it directly, not generated)
ALTER TABLE project_risks DROP COLUMN IF EXISTS "riskScore";
ALTER TABLE project_risks ADD COLUMN IF NOT EXISTS "riskScore" INTEGER DEFAULT 9;
ALTER TABLE project_risks ADD COLUMN IF NOT EXISTS "responsibleId" INTEGER;

-- project_resources: add missing columns
ALTER TABLE project_resources
  ADD COLUMN IF NOT EXISTS "taskId" INTEGER,
  ADD COLUMN IF NOT EXISTS "allocatedHours" NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "budgetAllocated" NUMERIC(12,2) DEFAULT 0;

-- project_costs: add missing columns
ALTER TABLE project_costs
  ADD COLUMN IF NOT EXISTS "enteredBy" INTEGER,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- project_task_dependencies: add dependsOnId (route uses this name instead of dependsOnTaskId)
ALTER TABLE project_task_dependencies ADD COLUMN IF NOT EXISTS "dependsOnId" INTEGER;

-- inventory_count_items: convert variance from generated to regular writable column
ALTER TABLE inventory_count_items DROP COLUMN IF EXISTS variance;
ALTER TABLE inventory_count_items ADD COLUMN IF NOT EXISTS variance NUMERIC(12,3) DEFAULT 0;
