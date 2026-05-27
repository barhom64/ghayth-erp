-- 224_property_owner_payouts.sql
--
-- WHAT:    track payouts to property owners + link each to its GL journal entry
-- WHY:     /properties/owners/:id/statement (5a2c1aed) computes the net
--          due to owner per period; without a payout record there is no
--          way to know which periods have been settled, no GL footprint
--          when the cash leaves, and no audit trail tying the cheque
--          number / IBAN transfer to the statement that justified it.
-- SAFETY:  zero-downtime, additive only. New table + indexes; no
--          column changes to existing tables. Idempotent via
--          CREATE TABLE / CREATE INDEX IF NOT EXISTS.
-- @rollback:
--   DROP TABLE IF EXISTS public.property_owner_payouts;
--   Safe at any time — no other table FKs this one.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.property_owner_payouts (
  id           SERIAL PRIMARY KEY,
  "companyId"  INTEGER NOT NULL REFERENCES public.companies(id),
  "branchId"   INTEGER,
  "ownerId"    INTEGER NOT NULL REFERENCES public.property_owners(id),

  -- Statement window the payout settles. Range is inclusive on both
  -- ends, matching the GET /properties/owners/:id/statement?from=&to= API.
  -- `period` stores YYYY-MM for convenient (companyId, ownerId, period)
  -- look-ups even when from/to span partial months.
  period       VARCHAR(7) NOT NULL,
  "fromDate"   DATE NOT NULL,
  "toDate"     DATE NOT NULL,

  -- Snapshot of the statement totals at the moment of payout. We freeze
  -- these on the payout row so future statement recomputes (commission
  -- rate edits, late-arriving rent payments) don't retroactively shift
  -- what we tell the owner we paid them.
  "totalRentCollected"  NUMERIC(14,2) NOT NULL DEFAULT 0,
  "totalMaintenance"    NUMERIC(14,2) NOT NULL DEFAULT 0,
  "commissionRate"      NUMERIC(5,2)  NOT NULL DEFAULT 0,
  "commissionAmount"    NUMERIC(14,2) NOT NULL DEFAULT 0,
  "netAmount"           NUMERIC(14,2) NOT NULL,

  -- Treasury-side facts.
  "paymentMethod"  VARCHAR(20) NOT NULL DEFAULT 'bank_transfer',
  reference        VARCHAR(120),
  "paidAt"         DATE NOT NULL DEFAULT CURRENT_DATE,
  "paidBy"         INTEGER,

  -- Journal entry that closed the books on this payout.
  -- propertiesEngine.postOwnerPayoutGL fills this in synchronously.
  "journalEntryId" INTEGER,

  notes        TEXT,

  "createdAt"  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt"  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "deletedAt"  TIMESTAMP WITH TIME ZONE,

  CONSTRAINT property_owner_payouts_payment_method_check
    CHECK ("paymentMethod" IN ('bank_transfer', 'cash', 'cheque', 'other')),
  CONSTRAINT property_owner_payouts_period_format
    CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT property_owner_payouts_date_order
    CHECK ("toDate" >= "fromDate"),
  CONSTRAINT property_owner_payouts_commission_range
    CHECK ("commissionRate" >= 0 AND "commissionRate" <= 100)
);

-- One payout per (company, owner, period) is the operating expectation.
-- A correction is handled by soft-deleting + recording a fresh row, not
-- by editing in place — keeps the journal-entry chain traceable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_payouts_company_owner_period
  ON public.property_owner_payouts ("companyId", "ownerId", period)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_owner_payouts_company_owner
  ON public.property_owner_payouts ("companyId", "ownerId");

CREATE INDEX IF NOT EXISTS idx_owner_payouts_paid_at
  ON public.property_owner_payouts ("companyId", "paidAt" DESC);

CREATE INDEX IF NOT EXISTS idx_owner_payouts_journal
  ON public.property_owner_payouts ("journalEntryId")
  WHERE "journalEntryId" IS NOT NULL;
