-- Phase 2 Umrah + commission tables (extracted from db/schema.sql)
CREATE TABLE IF NOT EXISTS public.umrah_sub_agents (
  id serial PRIMARY KEY,
  "companyId" integer NOT NULL,
  "branchId" integer,
  "nuskCode" varchar(30),
  name varchar(255) NOT NULL,
  "agentId" integer,
  "clientId" integer,
  "paymentTerms" varchar(20) DEFAULT 'postpaid',
  "defaultPricePerMutamer" numeric(12,2),
  phone varchar(50),
  email varchar(200),
  country varchar(100),
  "isActive" boolean DEFAULT true,
  notes text,
  "createdBy" integer,
  "updatedBy" integer,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now(),
  "deletedAt" timestamptz
);

CREATE TABLE IF NOT EXISTS public.umrah_groups (
  id serial PRIMARY KEY,
  "companyId" integer NOT NULL,
  "branchId" integer,
  "nuskGroupNumber" varchar(30) NOT NULL,
  name varchar(255),
  "agentId" integer,
  "subAgentId" integer,
  "seasonId" integer,
  "mutamerCount" integer DEFAULT 0,
  "programDuration" integer,
  status varchar(30) DEFAULT 'imported',
  "nuskInvoiceNumber" varchar(30),
  "salesInvoiceId" integer,
  "createdBy" integer,
  "updatedBy" integer,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now(),
  "deletedAt" timestamptz
);

CREATE TABLE IF NOT EXISTS public.umrah_pricing (
  id serial PRIMARY KEY,
  "companyId" integer NOT NULL,
  "branchId" integer,
  "subAgentId" integer,
  "agentId" integer,
  "seasonId" integer,
  "pricePerMutamer" numeric(10,2) NOT NULL,
  "includesHotel" boolean DEFAULT false,
  "includesTransport" boolean DEFAULT false,
  "validFrom" date NOT NULL,
  "validTo" date NOT NULL,
  notes text,
  "createdBy" integer,
  "updatedBy" integer,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now(),
  "deletedAt" timestamptz
);

CREATE TABLE IF NOT EXISTS public.umrah_nusk_invoices (
  id serial PRIMARY KEY,
  "companyId" integer NOT NULL,
  "branchId" integer,
  "nuskInvoiceNumber" varchar(30) NOT NULL,
  "agentId" integer,
  "subAgentId" integer,
  "groupId" integer,
  "mutamerCount" integer DEFAULT 0,
  "groundServices" numeric(12,2) DEFAULT 0,
  "electronicFees" numeric(12,2) DEFAULT 0,
  "visaFees" numeric(12,2) DEFAULT 0,
  "insuranceFees" numeric(12,2) DEFAULT 0,
  "enrichmentServices" numeric(12,2) DEFAULT 0,
  "additionalServices" numeric(12,2) DEFAULT 0,
  "transportTotal" numeric(12,2) DEFAULT 0,
  "hotelTotal" numeric(12,2) DEFAULT 0,
  "refundAmount" numeric(12,2) DEFAULT 0,
  "netCost" numeric(12,2) DEFAULT 0,
  "totalAmount" numeric(12,2) DEFAULT 0,
  "nuskStatus" varchar(20) DEFAULT 'pending',
  "issueDate" timestamptz,
  "expiryDate" timestamptz,
  "purchaseInvoiceId" integer,
  "journalEntryId" integer,
  "programDuration" integer,
  "createdBy" integer,
  "updatedBy" integer,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now(),
  "deletedAt" timestamptz
);

CREATE TABLE IF NOT EXISTS public.umrah_violations (
  id serial PRIMARY KEY,
  "companyId" integer NOT NULL,
  "branchId" integer,
  type varchar(20) NOT NULL,
  "referenceType" varchar(20),
  "referenceNumber" varchar(40),
  "mutamerId" integer,
  "groupId" integer,
  "subAgentId" integer,
  "agentId" integer,
  description text,
  "penaltyAmount" numeric(10,2) DEFAULT 0,
  status varchar(20) DEFAULT 'open',
  "linkedInvoiceId" integer,
  "detectedAt" timestamptz DEFAULT now(),
  "createdBy" integer,
  "updatedBy" integer,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now(),
  "deletedAt" timestamptz
);

CREATE TABLE IF NOT EXISTS public.employee_commission_plans (
  id serial PRIMARY KEY,
  "companyId" integer NOT NULL,
  "branchId" integer,
  "employeeId" integer NOT NULL,
  "assignmentId" integer NOT NULL,
  "seasonId" integer,
  "planName" varchar(255) NOT NULL,
  "baseSalary" numeric(12,2),
  "commissionType" varchar(20),
  "percentageRate" numeric(5,2),
  "fixedAmount" numeric(12,2),
  "conditionType" varchar(20),
  "minProfitPerVisa" numeric(10,2),
  "minSalesPercent" numeric(5,2),
  "minAvgPrice" numeric(10,2),
  "excludedMonths" jsonb DEFAULT '[]'::jsonb,
  "tierUnit" integer DEFAULT 10000,
  "partialTiersAllowed" boolean DEFAULT false,
  "violationBlocksCommission" boolean DEFAULT true,
  status varchar(20) DEFAULT 'active',
  "approvedBy" integer,
  "approvedAt" timestamptz,
  notes text,
  "createdBy" integer,
  "updatedBy" integer,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now(),
  "deletedAt" timestamptz
);

CREATE TABLE IF NOT EXISTS public.employee_commission_tiers (
  id serial PRIMARY KEY,
  "planId" integer NOT NULL,
  "fromCount" integer NOT NULL,
  "toCount" integer,
  "bonusPerUnit" numeric(12,2) NOT NULL,
  "isCumulative" boolean DEFAULT true,
  "tierOrder" integer DEFAULT 1,
  "createdAt" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_commission_calculations (
  id serial PRIMARY KEY,
  "companyId" integer NOT NULL,
  "branchId" integer,
  "planId" integer NOT NULL,
  "employeeId" integer NOT NULL,
  month integer NOT NULL,
  year integer NOT NULL,
  "totalMutamers" integer DEFAULT 0,
  "avgProfitPerVisa" numeric(10,2),
  "salesPercent" numeric(5,2),
  "avgSalePrice" numeric(10,2),
  "conditionMet" boolean DEFAULT false,
  "conditionDetails" text,
  "completedTiers" integer DEFAULT 0,
  "commissionAmount" numeric(12,2) DEFAULT 0,
  "hasViolations" boolean DEFAULT false,
  "finalAmount" numeric(12,2) DEFAULT 0,
  "isExcludedMonth" boolean DEFAULT false,
  status varchar(20) DEFAULT 'calculated',
  "payrollLineId" integer,
  "createdBy" integer,
  "updatedBy" integer,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now(),
  "deletedAt" timestamptz
);

CREATE INDEX IF NOT EXISTS idx_umrah_sub_agents_company ON public.umrah_sub_agents("companyId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_pricing_company ON public.umrah_pricing("companyId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_violations_company ON public.umrah_violations("companyId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_ecp_company ON public.employee_commission_plans("companyId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_ect_plan ON public.employee_commission_tiers("planId");
CREATE INDEX IF NOT EXISTS idx_ecc_plan ON public.employee_commission_calculations("planId") WHERE "deletedAt" IS NULL;
