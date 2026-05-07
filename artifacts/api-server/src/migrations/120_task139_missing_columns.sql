-- Task #139: deep-CRUD round-trip uncovered three "column does not exist"
-- bugs across modules. Add the missing columns instead of removing them
-- from INSERT/UPDATE handlers, since the route code (and the Zod schemas
-- the frontend posts) clearly expects them.

-- 1) suppliers.category — finance/vendors POST inserts it
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category varchar(80);

-- 2) invoices.costCenter — finance/invoices POST inserts it
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "costCenter" varchar(80);

-- 3) umrah_packages.updatedAt — umrah/packages PATCH sets it
ALTER TABLE umrah_packages ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone DEFAULT now();

-- 4) employees.attachments — POST /api/employees inserts it (employees.ts:387)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
