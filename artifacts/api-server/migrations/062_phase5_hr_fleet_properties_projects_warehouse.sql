-- Phase 5: HR, Fleet, Properties, Projects, Warehouse new tables

-- Public Holidays
CREATE TABLE IF NOT EXISTS public_holidays (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  year INTEGER NOT NULL,
  type VARCHAR(50) DEFAULT 'national',
  description TEXT,
  "isRecurring" BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Employee Transfers
CREATE TABLE IF NOT EXISTS employee_transfers (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "fromBranchId" INTEGER,
  "fromDepartmentId" INTEGER,
  "fromJobTitleId" INTEGER,
  "toBranchId" INTEGER,
  "toDepartmentId" INTEGER,
  "toJobTitleId" INTEGER,
  "effectiveDate" DATE,
  reason TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  "requestedBy" INTEGER,
  "approvedBy" INTEGER,
  "approvedAt" TIMESTAMPTZ,
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Employee Development Plans (IDP)
CREATE TABLE IF NOT EXISTS employee_development_plans (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  title VARCHAR(300),
  goals JSONB DEFAULT '[]',
  skills JSONB DEFAULT '[]',
  "targetDate" DATE,
  status VARCHAR(50) DEFAULT 'planned',
  notes TEXT,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Fleet Preventive Maintenance Plans
CREATE TABLE IF NOT EXISTS fleet_preventive_plans (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "vehicleId" INTEGER NOT NULL,
  "serviceType" VARCHAR(100) NOT NULL,
  "intervalKm" INTEGER,
  "intervalDays" INTEGER,
  "lastServiceDate" DATE,
  "lastServiceMileage" INTEGER,
  "nextServiceDate" DATE,
  "estimatedCost" NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Fleet Traffic Violations
CREATE TABLE IF NOT EXISTS fleet_traffic_violations (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "vehicleId" INTEGER NOT NULL,
  "driverId" INTEGER,
  "violationType" VARCHAR(100) NOT NULL,
  "violationDate" DATE NOT NULL,
  "fineAmount" NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  location VARCHAR(300),
  "violationNumber" VARCHAR(100),
  "paidAt" TIMESTAMPTZ,
  "paidBy" INTEGER,
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Property Inspections
CREATE TABLE IF NOT EXISTS property_inspections (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "unitId" INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  "scheduledDate" DATE,
  "inspectionDate" DATE,
  "inspectorName" VARCHAR(200),
  "conditionRating" INTEGER,
  status VARCHAR(50) DEFAULT 'scheduled',
  notes TEXT,
  "completedBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Property Security Deposits
CREATE TABLE IF NOT EXISTS property_security_deposits (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "contractId" INTEGER NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  "receivedDate" DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'held',
  "refundAmount" NUMERIC(12,2),
  "refundDate" DATE,
  "refundReason" TEXT,
  "journalEntryId" INTEGER,
  "refundJournalEntryId" INTEGER,
  notes TEXT,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Project Milestones
CREATE TABLE IF NOT EXISTS project_milestones (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "projectId" INTEGER NOT NULL,
  name VARCHAR(300) NOT NULL,
  description TEXT,
  "dueDate" DATE,
  "completedDate" DATE,
  status VARCHAR(50) DEFAULT 'pending',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Project Risks
CREATE TABLE IF NOT EXISTS project_risks (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "projectId" INTEGER NOT NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  probability INTEGER DEFAULT 3,
  impact INTEGER DEFAULT 3,
  "riskScore" INTEGER GENERATED ALWAYS AS (probability * impact) STORED,
  "riskLevel" VARCHAR(50) DEFAULT 'medium',
  "mitigationPlan" TEXT,
  status VARCHAR(50) DEFAULT 'open',
  "ownerId" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Project Resources
CREATE TABLE IF NOT EXISTS project_resources (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "projectId" INTEGER NOT NULL,
  "employeeId" INTEGER,
  role VARCHAR(200),
  "hoursAllocated" NUMERIC(8,2) DEFAULT 0,
  "hoursSpent" NUMERIC(8,2) DEFAULT 0,
  "startDate" DATE,
  "endDate" DATE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Project Costs
CREATE TABLE IF NOT EXISTS project_costs (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "projectId" INTEGER NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL,
  "costDate" DATE NOT NULL,
  "invoiceRef" VARCHAR(200),
  "createdBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Project Task Dependencies
CREATE TABLE IF NOT EXISTS project_task_dependencies (
  id SERIAL PRIMARY KEY,
  "taskId" INTEGER NOT NULL,
  "dependsOnTaskId" INTEGER NOT NULL,
  type VARCHAR(50) DEFAULT 'finish_to_start',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory Counts (Cycle Counts)
CREATE TABLE IF NOT EXISTS inventory_counts (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "countDate" DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  "warehouseLocation" VARCHAR(200),
  notes TEXT,
  "conductedBy" INTEGER,
  "approvedBy" INTEGER,
  "approvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory Count Items
CREATE TABLE IF NOT EXISTS inventory_count_items (
  id SERIAL PRIMARY KEY,
  "countId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "systemStock" NUMERIC(12,3) DEFAULT 0,
  "physicalCount" NUMERIC(12,3) NOT NULL,
  variance NUMERIC(12,3) GENERATED ALWAYS AS ("physicalCount" - "systemStock") STORED,
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("countId", "productId")
);
