-- ===========================================================================
-- fin_datafix_subsidiary_parent_audit.sql  (#2090 / FIN-DATAFIX — READ ONLY)
-- ---------------------------------------------------------------------------
-- PURPOSE: a STRICTLY READ-ONLY audit that lists every per-entity subsidiary
--          account (subsidiary_accounts → chart_of_accounts) suspected of
--          having been opened under the WRONG control parent by the pre-#2070
--          createSubsidiaryAccountsForEntity (which hardcoded parents that
--          matched neither the default seed nor the SOCPA chart: client
--          receivable→1111 cash, employee advance→1121 bank, custody→1131
--          clients, …). #2070 fixed NEW creation; this finds the historical
--          rows so a finance-reviewed correction can be planned.
--
-- SAFETY:  contains ONLY SELECT. It NEVER writes, moves, re-parents, or
--          touches balances. Run it, read the rows, decide. (#2090 scope:
--          report only — no correction without owner sign-off.)
--
-- USAGE:   psql "$DATABASE_URL" -f scripts/finance-audit/fin_datafix_subsidiary_parent_audit.sql
--          (or via the Node wrapper that formats + writes the markdown report).
--
-- COLUMNS (one row per suspect):
--   account / current_parent / proposed_correct_parent / entity /
--   current_balance / linked_lines / posted_lines / suspicion_reason /
--   severity / disposition (auto_fixable | needs_finance_review)
-- ===========================================================================

WITH
-- The CORRECT control parent per (entityType, accountType): the same intent
-- (type + name keywords) the post-#2070 resolveSubsidiaryParent uses.
expected(entity_type, account_type, exp_type, kws) AS (VALUES
  ('client',      'receivable',   'asset',     ARRAY['الذمم المدينة','العملاء']),
  ('vendor',      'payable',      'liability', ARRAY['الذمم الدائنة','الموردون']),
  ('employee',    'advance',      'asset',     ARRAY['سلف الموظف','سلف']),
  ('employee',    'custody',      'asset',     ARRAY['عهد مالية للموظف']),
  ('driver',      'custody',      'asset',     ARRAY['العهد النقدية','عهد']),
  ('vehicle',     'custody',      'asset',     ARRAY['العهد النقدية']),
  ('vehicle',     'fuel',         'expense',   ARRAY['الوقود','وقود']),
  ('vehicle',     'maintenance',  'expense',   ARRAY['صيانة وإصلاح المركبات','صيانة']),
  ('vehicle',     'depreciation', 'expense',   ARRAY['إهلاك المركبات','إهلاك']),
  ('umrah_agent', 'revenue',      'revenue',   ARRAY['إيرادات الخدمات','عمرة'])
),
sub AS (
  SELECT
    sa.id AS sub_id, sa."companyId", sa."entityType", sa."entityId", sa."accountType",
    acc.id AS acc_id, acc.code AS acc_code, acc.name AS acc_name, acc.type AS acc_type,
    COALESCE(acc."currentBalance", 0) AS current_balance,
    p.code AS parent_code, p.name AS parent_name
  FROM subsidiary_accounts sa
  JOIN chart_of_accounts acc ON acc.id = sa."accountId" AND acc."deletedAt" IS NULL
  LEFT JOIN chart_of_accounts p ON p.id = acc."parentId" AND p."companyId" = sa."companyId"
  WHERE sa."deletedAt" IS NULL AND sa."isActive" = true
),
resolved AS (
  SELECT s.*,
    (SELECT k.code FROM chart_of_accounts k
       WHERE k."companyId" = s."companyId" AND k.type = e.exp_type AND k."deletedAt" IS NULL
         AND EXISTS (SELECT 1 FROM unnest(e.kws) kw WHERE k.name LIKE '%' || kw || '%')
       ORDER BY length(k.code), k.code LIMIT 1) AS expected_parent_code,
    (SELECT k.name FROM chart_of_accounts k
       WHERE k."companyId" = s."companyId" AND k.type = e.exp_type AND k."deletedAt" IS NULL
         AND EXISTS (SELECT 1 FROM unnest(e.kws) kw WHERE k.name LIKE '%' || kw || '%')
       ORDER BY length(k.code), k.code LIMIT 1) AS expected_parent_name
  FROM sub s
  JOIN expected e ON e.entity_type = s."entityType" AND e.account_type = s."accountType"
),
counted AS (
  SELECT r.*,
    (SELECT count(*) FROM journal_lines jl WHERE jl."accountCode" = r.acc_code) AS linked_lines,
    (SELECT count(*) FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId"
      WHERE jl."accountCode" = r.acc_code AND je."deletedAt" IS NULL AND je."balancesApplied" = true) AS posted_lines,
    CASE r."entityType"
      WHEN 'client'      THEN (SELECT name FROM clients        WHERE id = r."entityId" AND "companyId" = r."companyId")
      WHEN 'vendor'      THEN (SELECT name FROM suppliers      WHERE id = r."entityId" AND "companyId" = r."companyId")
      WHEN 'employee'    THEN (SELECT name FROM employees      WHERE id = r."entityId")
      WHEN 'driver'      THEN (SELECT name FROM fleet_drivers  WHERE id = r."entityId")
      WHEN 'vehicle'     THEN (SELECT "plateNumber" FROM fleet_vehicles WHERE id = r."entityId")
      WHEN 'umrah_agent' THEN (SELECT name FROM umrah_agents   WHERE id = r."entityId")
      ELSE NULL END AS entity_name
  FROM resolved r
)
SELECT
  "companyId"                                              AS company_id,
  acc_code || ' — ' || acc_name                            AS account,
  COALESCE(parent_code || ' — ' || parent_name, '(بلا أصل)') AS current_parent,
  expected_parent_code || ' — ' || expected_parent_name    AS proposed_correct_parent,
  "entityType" || '#' || "entityId" ||
    COALESCE(' (' || entity_name || ')', '')               AS entity,
  "accountType"                                            AS account_type,
  current_balance,
  linked_lines,
  posted_lines,
  ('حساب «' || "accountType" || '» للكيان «' || "entityType" ||
    '» تحت «' || COALESCE(parent_name, 'بلا أصل') ||
    '» بدل «' || expected_parent_name || '»')               AS suspicion_reason,
  CASE
    WHEN current_balance <> 0 OR posted_lines > 0 THEN 'high'
    WHEN linked_lines > 0                          THEN 'medium'
    ELSE 'low' END                                          AS severity,
  CASE
    WHEN current_balance = 0 AND posted_lines = 0 THEN 'auto_fixable'
    ELSE 'needs_finance_review' END                         AS disposition
FROM counted
WHERE expected_parent_code IS NOT NULL
  AND parent_code IS DISTINCT FROM expected_parent_code
ORDER BY (current_balance <> 0 OR posted_lines > 0) DESC, "companyId", acc_code;
