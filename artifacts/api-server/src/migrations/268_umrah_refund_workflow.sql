-- Migration 268 — Umrah refund workflow
--
-- @rollback:
--   DROP INDEX IF EXISTS idx_umrah_refund_requests_companyId;
--   DROP INDEX IF EXISTS idx_umrah_refund_requests_status;
--   DROP INDEX IF EXISTS idx_umrah_refund_requests_pilgrim;
--   DROP INDEX IF EXISTS idx_umrah_refund_requests_invoice;
--   DROP TABLE IF EXISTS umrah_refund_requests;
--
-- A pilgrim cancels. Money has flowed through both sides of the
-- system already (their NUSK voucher → AP, their sales invoice →
-- AR). The agency needs to:
--
--   1. Open a refund request — "pilgrim X cancelled, owed Y SAR"
--   2. Either chase MOFA for the NUSK side (refundAmount field already
--      exists on `umrah_nusk_invoices`) or absorb the cost
--   3. Generate the reversal sales credit memo for the customer side
--   4. Pay the refund through treasury
--   5. Close the cycle
--
-- The schema captures the request + its lifecycle. The GL postings
-- (credit memo + treasury debit) reuse the existing financial engines;
-- this migration only adds the operational workflow on top.

CREATE TABLE IF NOT EXISTS umrah_refund_requests (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Either pilgrimId (refund to the pilgrim) or agentId (refund to the
  -- agent who paid on their behalf). One of the two is REQUIRED, both
  -- can be present (refund flows pilgrim → agent → treasury).
  "pilgrimId"     INTEGER REFERENCES umrah_pilgrims(id) ON DELETE SET NULL,
  "agentId"       INTEGER REFERENCES umrah_agents(id)   ON DELETE SET NULL,
  -- The sales invoice / NUSK invoice the refund traces back to. Both
  -- nullable — sometimes the operator opens the request from a manual
  -- cancellation event without an invoice line.
  "salesInvoiceId" INTEGER,
  "nuskInvoiceId"  INTEGER,
  -- Operator's claim. Net amount = grossAmount - mofaRetention.
  "grossAmount"    NUMERIC(12,2) NOT NULL,
  "mofaRetention"  NUMERIC(12,2) DEFAULT 0,
  "netAmount"      NUMERIC(12,2) GENERATED ALWAYS AS ("grossAmount" - COALESCE("mofaRetention", 0)) STORED,
  currency         CHAR(3) DEFAULT 'SAR' NOT NULL,
  -- Lifecycle: requested → approved → paid → closed (or rejected /
  -- cancelled). The state machine + transitions live in the route
  -- handler (mirrors penalty waiver pattern).
  status           VARCHAR(20) DEFAULT 'requested' NOT NULL
                   CHECK (status IN ('requested', 'approved', 'rejected',
                                     'paid', 'closed', 'cancelled')),
  reason           TEXT NOT NULL,
  "rejectionReason" TEXT,
  -- Audit trail for each milestone.
  "requestedBy"    INTEGER NOT NULL,
  "requestedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "approvedBy"     INTEGER,
  "approvedAt"     TIMESTAMPTZ,
  "rejectedBy"     INTEGER,
  "rejectedAt"     TIMESTAMPTZ,
  "paidBy"         INTEGER,
  "paidAt"         TIMESTAMPTZ,
  "paymentReference" VARCHAR(60),
  "treasuryId"     INTEGER,
  "creditMemoId"   INTEGER,
  -- Pin the actual refund amount AFTER negotiations conclude (often
  -- different from grossAmount as MOFA retention shifts). Used by GL.
  "settledAmount"  NUMERIC(12,2),
  notes            TEXT,
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"      TIMESTAMPTZ,
  CONSTRAINT umrah_refund_either_party_required
    CHECK ("pilgrimId" IS NOT NULL OR "agentId" IS NOT NULL),
  CONSTRAINT umrah_refund_amount_positive
    CHECK ("grossAmount" > 0)
);

CREATE INDEX IF NOT EXISTS idx_umrah_refund_requests_companyId
  ON umrah_refund_requests("companyId");
CREATE INDEX IF NOT EXISTS idx_umrah_refund_requests_status
  ON umrah_refund_requests("companyId", status)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_refund_requests_pilgrim
  ON umrah_refund_requests("pilgrimId")
  WHERE "pilgrimId" IS NOT NULL AND "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_refund_requests_invoice
  ON umrah_refund_requests("salesInvoiceId")
  WHERE "salesInvoiceId" IS NOT NULL;
