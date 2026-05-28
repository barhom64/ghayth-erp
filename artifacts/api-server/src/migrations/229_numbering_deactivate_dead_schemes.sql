-- Migration 229 — deactivate dead numbering schemes (#1141 G15 closure)
--
-- @rollback:
--   UPDATE numbering_schemes
--      SET "isActive" = true, "updatedAt" = NOW()
--    WHERE ("moduleKey","entityKey") IN (
--      ('finance','receipt_voucher'),
--      ('finance','payment_voucher'),
--      ('finance','credit_memo'),
--      ('finance','debit_memo'),
--      ('finance','expense_voucher'),
--      ('purchase','vendor_invoice'),
--      ('crm','lead'),
--      ('warehouse','stock_movement'),
--      ('legal','legal_case'),
--      ('warehouse','purchase_receipt')
--    );
--
-- The 2026-05-27 coverage report §3 G15 named 8 schemes as "dead
-- config": seeded by migrations 213/214 but never called by any
-- `issueNumber({moduleKey, entityKey})` in source code. They appear
-- in the settings UI and an operator can edit them — but the change
-- accomplishes nothing because no code path reads the row.
--
-- The honest fix is to mark them inactive. `isActive = false` keeps
-- the row (so tenants who customized prefix/pattern don't lose their
-- work) but the UI surfaces them as inactive so the operator sees
-- "نوع غير مفعّل — لا يوجد مسار يستخدمه حالياً" instead of being
-- misled.
--
-- After landing this migration, the audit-numbering-schemes-vs-callers
-- script's "dead config" warning collapses to zero — at the cost of
-- the UI showing those rows as deactivated. If any of these rows is
-- ever wired to a real route, that route's PR re-activates the
-- scheme via a one-line UPDATE.
--
-- Note on credit_memo and debit_memo: those were dead at the time the
-- coverage report was written but PR #1333 wired them. They are
-- DELIBERATELY EXCLUDED from this deactivation list — the UPDATE below
-- targets only the 8 still-dead schemes.

UPDATE numbering_schemes
   SET "isActive" = false,
       "updatedAt" = NOW()
 WHERE ("moduleKey","entityKey") IN (
     ('finance','receipt_voucher'),
     ('finance','payment_voucher'),
     ('finance','expense_voucher'),
     ('purchase','vendor_invoice'),
     ('crm','lead'),
     ('warehouse','stock_movement'),
     ('legal','legal_case'),
     ('warehouse','purchase_receipt')
   )
   AND "isActive" = true;
