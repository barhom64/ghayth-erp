-- 403_cash_in_transit.sql
-- ميزة: النقد في الطريق (#2714، الجزء المتبقّي) — باعتماد إبراهيم («كلها»).
--
-- يمسّ الدفتر — لكن **لا منطق قيد جديد**: الطوران يُرحَّلان عبر
-- financialEngine.postJournalEntry القائم (قيد متوازن + idempotency بـ sourceKey).
-- هذا الجدول يتتبّع حالة التحويل العابر فقط (لا يخزّن أرصدة — الأرصدة في الدفتر).
--
-- الطور 1 (إرسال): مدين «النقد في الطريق» / دائن الحساب المصدر.
-- الطور 2 (تأكيد الوصول): مدين الحساب الهدف / دائن «النقد في الطريق».
--
-- DDL-only (لا seed) → seed-drift safe. > baseline-cutoff (297). idempotent.
--
-- @rollback: DROP TABLE IF EXISTS cash_in_transit_transfers;

CREATE TABLE IF NOT EXISTS cash_in_transit_transfers (
  id                      BIGSERIAL PRIMARY KEY,
  "companyId"             INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"              INTEGER,
  "sourceAccountCode"     TEXT NOT NULL,
  "destinationAccountCode" TEXT NOT NULL,
  "clearingAccountCode"   TEXT NOT NULL,
  amount                  NUMERIC(18,2) NOT NULL,
  currency                TEXT NOT NULL DEFAULT 'SAR',
  -- in_transit | arrived | cancelled
  status                  TEXT NOT NULL DEFAULT 'in_transit',
  "sentDate"              DATE NOT NULL,
  "arrivedDate"           DATE,
  "sentJournalId"         BIGINT,
  "arrivedJournalId"      BIGINT,
  reference               TEXT,
  notes                   TEXT,
  "createdBy"             INTEGER,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cit_company_status
  ON cash_in_transit_transfers ("companyId", status) WHERE "deletedAt" IS NULL;
