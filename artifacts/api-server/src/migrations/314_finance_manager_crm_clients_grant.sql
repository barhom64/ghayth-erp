-- ===========================================================================
-- 314_finance_manager_crm_clients_grant.sql
-- ---------------------------------------------------------------------------
-- WHAT:    grants the `finance_manager` role read (view/list) + create on the
--          `crm.clients` feature, company-scoped, for every EXISTING
--          finance_manager role row that doesn't already carry a crm.clients
--          grant.
-- WHY:     #2134 — the invoice/voucher forms read the client master
--          (GET /clients) for their client picker and quick-create a client
--          inline (POST /clients). Both routes authorize against crm.clients,
--          but the default finance_manager role carried NO crm grant at all,
--          so a finance manager got an EMPTY client field on the invoice (the
--          list 403s silently) and «+ عميل جديد» failed too — the billing path
--          dead-ended even though the client existed. New companies get the
--          grant from the updated DEFAULT_ROLE_DEFS (autoMigrate.ts); this
--          backfills tenants whose roles were seeded before the fix.
-- SAFETY:  additive, idempotent. Inserts at most one (role_id, 'crm.clients')
--          row per existing finance_manager role and ONLY when that role has
--          no crm.clients grant yet — an admin-customized grant is never
--          touched (NOT EXISTS + ON CONFLICT DO NOTHING). Narrow by design:
--          view/list/create only (no update/delete/export), scope 'company'
--          (allowed by the catalog for crm.clients). No data, balance, or
--          posting changes.
-- @rollback:
--   DELETE FROM rbac_role_grants g USING rbac_roles r
--    WHERE g.role_id = r.id AND r.role_key = 'finance_manager'
--      AND g.feature_key = 'crm.clients'
--      AND g.actions = ARRAY['view','list','create']::text[] AND g.scope = 'company';
-- ===========================================================================

INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'crm.clients', ARRAY['view','list','create']::text[], 'company'
  FROM rbac_roles r
 WHERE r.role_key = 'finance_manager'
   AND NOT EXISTS (
     SELECT 1 FROM rbac_role_grants g
      WHERE g.role_id = r.id AND g.feature_key = 'crm.clients'
   )
ON CONFLICT (role_id, feature_key) DO NOTHING;
