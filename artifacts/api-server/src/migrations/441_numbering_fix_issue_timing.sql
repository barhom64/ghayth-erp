-- Migration 441 — correct numbering_schemes.issueTiming to match the real
-- runtime issuance paths (fix the 422 timing-mismatch introduced when #440
-- re-seeded the catalog with the legacy canonical timings).
--
-- Background: numberingService.issueNumber() refuses to issue when a scheme's
-- issueTiming differs from the expectedTiming the calling code declares. After
-- #440 re-seeded the full catalog, every company had its schemes back, but with
-- the historical timings (on_submit / on_posting / on_approval). The production
-- code, however, issues nearly every entity at "on_draft" (route-level creation).
-- The mismatch was actively crash-looping admin bootstrap (hr/employee_code
-- on_submit vs the on_draft create path) and would 422 every document create
-- across HR/CRM/Finance/Legal/Projects/etc.
--
-- finance/sales_invoice and umrah/umrah_agent_invoice are special: they are
-- issued BOTH at route level (on_draft — routes/finance-invoices.ts,
-- routes/transport-pricing.ts, routes/umrah.ts) AND via
-- financialEngine.postSalesInvoice. A single scheme cannot satisfy two different
-- declared timings, so the engine was unified to declare 'on_draft' too (the
-- timing is a pure consistency assertion — it does NOT change when the number is
-- allocated; the engine still allocates at posting time). Both entities are
-- therefore included in the on_draft allowlist below so every issuance path —
-- manual route AND engine (recurring invoices, umrah façade) — passes the guard.
--
-- This migration sets issueTiming='on_draft' for every entity that has a real
-- issuance path. Idempotent (WHERE issueTiming <> 'on_draft'); only touches the
-- vetted (moduleKey, entityKey) allowlist below — entities with NO issuing route
-- (e.g. incoming_letter, *_voucher, vendor_invoice) are intentionally untouched.
--
-- @rollback:
--   -- No safe automatic rollback: this realigns scheme timing to the code's
--   -- actual issuance timing; reverting to the prior per-row values would
--   -- re-break document creation. To override a SPECIFIC scheme's timing,
--   -- update that one row from the Numbering Settings UI.

UPDATE numbering_schemes ns
SET "issueTiming" = 'on_draft',
    "updatedAt" = now()
FROM (VALUES
  ('crm','client_code'),
  ('crm','contract'),
  ('finance','bank_guarantee'),
  ('finance','credit_memo'),
  ('finance','customer_advance'),
  ('finance','debit_memo'),
  ('finance','intercompany'),
  ('finance','journal_entry'),
  ('finance','sales_invoice'),
  ('finance','vendor_advance'),
  ('finance','vendor_credit_memo'),
  ('fleet','fleet_trip'),
  ('hr','employee_code'),
  ('hr','employee_contract'),
  ('hr','exit'),
  ('hr','inquiry_memo'),
  ('hr','loan'),
  ('hr','official_letter'),
  ('hr','overtime'),
  ('legal','case'),
  ('projects','project'),
  ('properties','lease_contract'),
  ('properties','lease_receipt'),
  ('purchase','goods_receipt'),
  ('purchase','payment_run'),
  ('purchase','purchase_order'),
  ('purchase','purchase_request'),
  ('requests','general_request'),
  ('store','store_order'),
  ('support','support_ticket'),
  ('umrah','umrah_agent_invoice'),
  ('umrah','umrah_group'),
  ('umrah','umrah_payment'),
  ('umrah','umrah_sales_invoice'),
  ('warehouse','stock_movement'),
  ('warehouse','stock_transfer')
) AS code_paths("moduleKey","entityKey")
WHERE ns."moduleKey" = code_paths."moduleKey"
  AND ns."entityKey" = code_paths."entityKey"
  AND ns."issueTiming" <> 'on_draft';
