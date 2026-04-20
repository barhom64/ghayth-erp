-- Add missing columns to clients table (frontend sends these but backend was dropping them)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "type" VARCHAR(30) DEFAULT 'individual';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nationality VARCHAR(60);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'ar';

-- Add missing columns to employees table (banking + emergency contact)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "bankName" VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "bankAccount" VARCHAR(60);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS iban VARCHAR(34);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "emergencyContact" VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "emergencyPhone" VARCHAR(20);
