-- ============================================================
-- 067: Three-way match (PO → GRN → Invoice)
--
-- Adds:
--   * goods_receipts (header) + goods_receipt_items (lines)
--   * purchase_order_items."receivedQty" and "invoicedQty" tracking
--   * invoice_items."poItemId" and "poId" link columns
--   * accounting_mappings operation types for GRN/GRNI postings
--
-- Design:
--   Each GRN records the physically received qty for each PO line.
--   Each supplier invoice line MUST reference a PO line, and the
--   invoice qty MUST be <= receivedQty - invoicedQty for that line.
--   When an invoice is approved, invoicedQty increments per PO line.
-- ============================================================

CREATE TABLE IF NOT EXISTS goods_receipts (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "poId" INTEGER NOT NULL,
  ref TEXT NOT NULL,
  "receivedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "receivedBy" INTEGER,
  notes TEXT,
  "journalId" INTEGER,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_company ON goods_receipts("companyId");
CREATE INDEX IF NOT EXISTS idx_goods_receipts_po ON goods_receipts("poId");
CREATE UNIQUE INDEX IF NOT EXISTS uq_goods_receipts_ref ON goods_receipts("companyId", ref);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id SERIAL PRIMARY KEY,
  "grnId" INTEGER NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  "poItemId" INTEGER NOT NULL,
  "itemName" TEXT,
  "receivedQty" NUMERIC(18,4) NOT NULL DEFAULT 0,
  "unitPrice" NUMERIC(18,4) NOT NULL DEFAULT 0,
  "lineTotal" NUMERIC(18,4) NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON goods_receipt_items("grnId");
CREATE INDEX IF NOT EXISTS idx_grn_items_po_item ON goods_receipt_items("poItemId");

-- Extend PO items to track cumulative received / invoiced
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS "receivedQty" NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS "invoicedQty" NUMERIC(18,4) NOT NULL DEFAULT 0;

-- Link invoice items back to PO lines (nullable for non-PO invoices)
DO $$
BEGIN
  BEGIN
    ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS "poId" INTEGER;
    ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS "poItemId" INTEGER;
    ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS "grnItemId" INTEGER;
  EXCEPTION WHEN undefined_table THEN NULL; END;
END $$;

-- Seed accounting mappings for GRN/GRNI (idempotent)
DO $$
DECLARE
  comp_id INTEGER;
  op_types TEXT[][] := ARRAY[
    ARRAY['purchase_grn_inventory', 'استلام بضاعة - مخزون (GRN)'],
    ARRAY['purchase_grn_vat',       'استلام بضاعة - ضريبة مدخلات'],
    ARRAY['purchase_grni',          'استلام بضاعة لم تُفوتر (GRNI)'],
    ARRAY['purchase_vendor_ap',     'فاتورة مورد - ذمم دائنة']
  ];
  t TEXT[];
BEGIN
  FOR comp_id IN SELECT id FROM companies LOOP
    FOREACH t SLICE 1 IN ARRAY op_types LOOP
      BEGIN
        INSERT INTO accounting_mappings ("companyId", "operationType", "operationLabel")
        VALUES (comp_id, t[1], t[2])
        ON CONFLICT ("companyId", "operationType") DO NOTHING;
      EXCEPTION WHEN undefined_table THEN NULL; END;
    END LOOP;
  END LOOP;
END $$;
