-- Property lease lifecycle: ensure runtime tables exist that properties.ts + cronScheduler reference.
-- rent_payments and late_rent_actions are queried extensively but were never created in src/migrations.
-- Also adds lifecycle columns on rental_contracts to track termination/renewal handoff.

-- 1. rent_payments: monthly (or per-frequency) rent installments billed against a contract
CREATE TABLE IF NOT EXISTS rent_payments (
  id SERIAL PRIMARY KEY,
  "contractId" INTEGER NOT NULL REFERENCES rental_contracts(id) ON DELETE CASCADE,
  "dueDate" DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "paidDate" DATE,
  method VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | partial | paid | overdue | cancelled
  "receiptNumber" VARCHAR(100),
  "journalEntryId" INTEGER,
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rent_payments_contract ON rent_payments("contractId");
CREATE INDEX IF NOT EXISTS idx_rent_payments_status ON rent_payments(status);
CREATE INDEX IF NOT EXISTS idx_rent_payments_due ON rent_payments("dueDate");

-- 2. late_rent_actions: audit trail for the escalation phases (alert → notification → field_visit → …)
CREATE TABLE IF NOT EXISTS late_rent_actions (
  id SERIAL PRIMARY KEY,
  "contractId" INTEGER NOT NULL REFERENCES rental_contracts(id) ON DELETE CASCADE,
  "paymentId" INTEGER REFERENCES rent_payments(id) ON DELETE SET NULL,
  phase VARCHAR(50) NOT NULL, -- alert | notification | field_visit | escalation | penalty_applied | legal_transfer
  action TEXT,
  "sentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_late_rent_actions_payment ON late_rent_actions("paymentId");
CREATE INDEX IF NOT EXISTS idx_late_rent_actions_contract ON late_rent_actions("contractId");
CREATE INDEX IF NOT EXISTS idx_late_rent_actions_phase ON late_rent_actions(phase);

-- 3. Lifecycle columns on rental_contracts to track renewal / termination handoff
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "renewedFromId" INTEGER REFERENCES rental_contracts(id) ON DELETE SET NULL;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "renewalNoticeSentAt" TIMESTAMPTZ;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "terminatedAt" TIMESTAMPTZ;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "terminationReason" TEXT;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMPTZ;

-- 4. Backfill rent_payments from contract_payment_schedule if the legacy schedule holds data
INSERT INTO rent_payments ("contractId","dueDate",amount,"paidAmount","paidDate",method,status,"receiptNumber",notes,"createdAt","updatedAt")
SELECT cps."contractId", cps."dueDate", cps.amount, COALESCE(cps."paidAmount",0), cps."paidDate", cps.method, cps.status, cps."receiptNumber", cps.notes, cps."createdAt", cps."updatedAt"
FROM contract_payment_schedule cps
WHERE NOT EXISTS (
  SELECT 1 FROM rent_payments rp
  WHERE rp."contractId" = cps."contractId" AND rp."dueDate" = cps."dueDate"
);
