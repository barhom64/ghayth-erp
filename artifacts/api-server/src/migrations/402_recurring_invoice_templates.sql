-- 402_recurring_invoice_templates.sql
-- ميزة: الفوترة المتكررة للعملاء (اشتراكات/إيجارات دورية) — باعتماد إبراهيم («كلها»).
--
-- هذه الدفعة: جدول القوالب فقط — **غير دفتري** (تخزين الجداول الزمنية لا غير).
-- التوليد الفعلي للفواتير (يمسّ الدفتر) في دفعة لاحقة منفصلة عبر
-- financialEngine.postSalesInvoice (إعادة استخدام مسار الترحيل القائم، لا منطق
-- قيد جديد) مع assertion على سطور القيد.
--
-- DDL-only (لا seed) → seed-drift safe. > baseline-cutoff (297) ليعمل على
-- fresh/CI. كل العبارات idempotent.
--
-- @rollback: DROP TABLE IF EXISTS recurring_invoice_templates;

CREATE TABLE IF NOT EXISTS recurring_invoice_templates (
  id            BIGSERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"    INTEGER,
  "clientId"    INTEGER NOT NULL,
  title         TEXT NOT NULL,
  -- سطور الفاتورة كما يتوقّعها postSalesInvoice:
  -- [{ description, quantity, unitPriceExclTax, isTaxable, taxCode }]
  lines         JSONB NOT NULL DEFAULT '[]'::jsonb,
  currency      TEXT NOT NULL DEFAULT 'SAR',
  -- daily | weekly | monthly | quarterly | yearly
  frequency     TEXT NOT NULL,
  "startDate"   DATE NOT NULL,
  "nextRunDate" DATE NOT NULL,
  "dueInDays"   INTEGER NOT NULL DEFAULT 30,
  notes         TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  "lastRunDate" DATE,
  "runsCount"   INTEGER NOT NULL DEFAULT 0,
  "createdBy"   INTEGER,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rit_company_active
  ON recurring_invoice_templates ("companyId", active) WHERE "deletedAt" IS NULL;
-- لاختيار القوالب المستحقّة بكفاءة (المولّد لاحقًا).
CREATE INDEX IF NOT EXISTS idx_rit_due
  ON recurring_invoice_templates ("nextRunDate") WHERE active = TRUE AND "deletedAt" IS NULL;
