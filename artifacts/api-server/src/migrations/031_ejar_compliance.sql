-- =====================================================
-- 028: Ejar Compliance — Property Management Upgrade
-- =====================================================

-- 1. Property Owners table (for third-party property management)
CREATE TABLE IF NOT EXISTS property_owners (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "ownerType" VARCHAR(20) DEFAULT 'individual', -- individual | company
  name VARCHAR(200) NOT NULL,
  "nationalId" VARCHAR(50),
  "crNumber" VARCHAR(50), -- Commercial Registration for companies
  phone VARCHAR(50),
  email VARCHAR(200),
  iban VARCHAR(50),
  "bankName" VARCHAR(100),
  address TEXT,
  city VARCHAR(100),
  "authorizationNumber" VARCHAR(100), -- Power of Attorney / وكالة
  "authorizationDate" DATE,
  "authorizationExpiry" DATE,
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_property_owners_company ON property_owners("companyId");

-- 2. Extend property_buildings for Ejar
ALTER TABLE property_buildings ADD COLUMN IF NOT EXISTS "deedNumber" VARCHAR(100);
ALTER TABLE property_buildings ADD COLUMN IF NOT EXISTS "deedDate" DATE;
ALTER TABLE property_buildings ADD COLUMN IF NOT EXISTS "buildingPermitNumber" VARCHAR(100);
ALTER TABLE property_buildings ADD COLUMN IF NOT EXISTS "nationalAddress" JSONB;
ALTER TABLE property_buildings ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(10,7);
ALTER TABLE property_buildings ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(10,7);
ALTER TABLE property_buildings ADD COLUMN IF NOT EXISTS "totalUnits" INTEGER DEFAULT 0;
ALTER TABLE property_buildings ADD COLUMN IF NOT EXISTS "totalArea" DECIMAL(10,2);
ALTER TABLE property_buildings ADD COLUMN IF NOT EXISTS "yearBuilt" INTEGER;
ALTER TABLE property_buildings ADD COLUMN IF NOT EXISTS "ownerId" INTEGER REFERENCES property_owners(id) ON DELETE SET NULL;
ALTER TABLE property_buildings ADD COLUMN IF NOT EXISTS "managerId" INTEGER;

-- 3. Extend property_units for Ejar
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS "electricityMeter" VARCHAR(50);
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS "waterMeter" VARCHAR(50);
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS "usageType" VARCHAR(50) DEFAULT 'residential'; -- residential | commercial | industrial
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS "ownerId" INTEGER REFERENCES property_owners(id) ON DELETE SET NULL;
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS "parkingSpaces" INTEGER DEFAULT 0;
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS "acType" VARCHAR(50); -- central | split | window | none
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS "hasKitchen" BOOLEAN DEFAULT FALSE;
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS "yearlyRent" DECIMAL(12,2);
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS "insurancePolicy" VARCHAR(100);
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS "insuranceExpiry" DATE;

-- 4. Extend tenants for Ejar
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "tenantType" VARCHAR(20) DEFAULT 'individual'; -- individual | company
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "crNumber" VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "unifiedNumber" VARCHAR(50); -- 700 number
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "birthDate" DATE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "gender" VARCHAR(10); -- male | female
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "guarantorName" VARCHAR(200);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "guarantorId" VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "guarantorPhone" VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "guarantorRelation" VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "emergencyContact" VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "emergencyName" VARCHAR(200);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "maritalStatus" VARCHAR(20); -- single | married | divorced | widowed
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "occupation" VARCHAR(200);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "monthlyIncome" DECIMAL(12,2);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "previousAddress" TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "previousLandlord" VARCHAR(200);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "previousLandlordPhone" VARCHAR(50);

-- 5. Extend rental_contracts for Ejar
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "contractNumber" VARCHAR(100);
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "ejarNumber" VARCHAR(100);
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "contractType" VARCHAR(50) DEFAULT 'residential'; -- residential | commercial | ejar_unified
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "paymentFrequency" VARCHAR(20) DEFAULT 'monthly'; -- monthly | quarterly | semi_annual | annual
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "yearlyRent" DECIMAL(12,2);
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "totalContractValue" DECIMAL(12,2);
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "latePenaltyType" VARCHAR(20) DEFAULT 'percentage'; -- percentage | fixed
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "latePenaltyValue" DECIMAL(10,2) DEFAULT 0;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "gracePeriodDays" INTEGER DEFAULT 0;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "terminationNoticeDays" INTEGER DEFAULT 30;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "earlyTerminationFee" DECIMAL(12,2) DEFAULT 0;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "autoRenewal" BOOLEAN DEFAULT FALSE;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "renewalNoticeDays" INTEGER DEFAULT 60;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "renewalPeriodMonths" INTEGER DEFAULT 12;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "electricityResponsibility" VARCHAR(20) DEFAULT 'tenant'; -- tenant | owner
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "waterResponsibility" VARCHAR(20) DEFAULT 'tenant';
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "gasResponsibility" VARCHAR(20) DEFAULT 'tenant';
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "maintenanceResponsibility" VARCHAR(100) DEFAULT 'shared';
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "brokerageFee" DECIMAL(12,2) DEFAULT 0;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "brokeragePayor" VARCHAR(20) DEFAULT 'tenant'; -- tenant | owner | shared
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "depositHolder" VARCHAR(20) DEFAULT 'owner'; -- owner | ejar_platform | bank
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "insuranceRequired" BOOLEAN DEFAULT FALSE;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "ownerId" INTEGER REFERENCES property_owners(id) ON DELETE SET NULL;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "numberOfInstallments" INTEGER;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "specialConditions" TEXT;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "ejarStatus" VARCHAR(50); -- draft | pending | active | expired | cancelled
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "registrationDate" DATE;

-- 6. Contract Payment Schedule (individual installment tracking)
CREATE TABLE IF NOT EXISTS contract_payment_schedule (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "contractId" INTEGER NOT NULL REFERENCES rental_contracts(id) ON DELETE CASCADE,
  "installmentNumber" INTEGER NOT NULL,
  "dueDate" DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  "paidAmount" DECIMAL(12,2) DEFAULT 0,
  "paidDate" DATE,
  method VARCHAR(50),
  status VARCHAR(20) DEFAULT 'pending', -- pending | partial | paid | overdue
  "receiptNumber" VARCHAR(100),
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_schedule_contract ON contract_payment_schedule("contractId");
CREATE INDEX IF NOT EXISTS idx_payment_schedule_company ON contract_payment_schedule("companyId");
CREATE INDEX IF NOT EXISTS idx_payment_schedule_status ON contract_payment_schedule(status);
CREATE INDEX IF NOT EXISTS idx_payment_schedule_due ON contract_payment_schedule("dueDate");
