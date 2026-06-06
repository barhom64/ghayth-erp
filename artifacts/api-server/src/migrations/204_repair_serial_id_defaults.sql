-- 204_repair_serial_id_defaults.sql
--
-- Operational-readiness P1 repair (issue #1594).
--
-- PROBLEM
-- Several tables were created in their migrations with `id serial PRIMARY KEY`,
-- but the regenerated baseline dump (db/schema_pre.sql / schema_post.sql)
-- captured them as bare `id integer NOT NULL` and LOST the backing sequence
-- default (the `ALTER TABLE ... ALTER COLUMN id SET DEFAULT nextval(...)`
-- clause pg_dump normally emits). Because the table then already exists from
-- the dump, the original migration's `CREATE TABLE IF NOT EXISTS` no-ops and
-- never restores the default. The result: every INSERT that relies on the
-- serial default fails with
--   null value in column "id" of relation "<table>" violates not-null constraint
--
-- BLAST RADIUS (verified on a fresh bootstrap):
--   accounting_allocation_results  -> blocks invoice /approve GL posting
--   accounting_allocation_rules
--   budget_approval_requests       -> blocks budget-approval workflow
--   fleet_alerts
--   tax_codes                      -> migration 205 seed INSERT crashed
--   umrah_attachments
--   umrah_import_mapping_presets
--   vendor_contracts               -> blocks vendor-contract create
--   wht_categories                 -> migration 208 seed INSERT crashed
--
-- This migration is numbered 204 (after the already-applied
-- 204_journal_lines_deleted_at.sql, before the seed migrations 205/208) so the
-- defaults are restored BEFORE those seed INSERTs re-run on the next boot.
--
-- FIX
-- For each affected table that still has no `id` default, (re)create a serial
-- sequence owned by the column, align it to MAX(id)+1, and set it as the
-- column default. Fully idempotent: skips any table whose id already has a
-- default, and CREATE SEQUENCE IF NOT EXISTS reuses a pre-existing sequence
-- (the budget_approval_requests / vendor_contracts / fleet_alerts case, where
-- the dump kept the sequence object but dropped the column default).
--
-- NOTE: the long-term root-cause fix is regenerating db/schema_pre.sql +
-- schema_post.sql so the dump carries the serial defaults. Tracked in
-- docs/OPERATIONAL_LOGIC_ACTIVATION_AUDIT.md.
--
-- This migration is purely additive (it only adds a column DEFAULT where one
-- was missing); it cannot break an older app version during a rolling deploy.
--
-- @rollback:
--   For each repaired table, drop the default again, e.g.:
--     ALTER TABLE public.accounting_allocation_results ALTER COLUMN id DROP DEFAULT;
--   (rarely desirable — this would re-introduce the NOT NULL insert failures).

DO $$
DECLARE
  t   text;
  seq text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounting_allocation_results',
    'accounting_allocation_rules',
    'budget_approval_requests',
    'fleet_alerts',
    'tax_codes',
    'umrah_attachments',
    'umrah_import_mapping_presets',
    'vendor_contracts',
    'wht_categories'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t
        AND column_name = 'id'
        AND column_default IS NULL
    ) THEN
      seq := t || '_id_seq';
      EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I OWNED BY public.%I.id', seq, t);
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(id) FROM public.%I), 0) + 1, false)', 'public.' || seq, t);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT nextval(%L)', t, 'public.' || seq);
      RAISE NOTICE '[204] repaired %.id default -> %', t, seq;
    END IF;
  END LOOP;
END $$;
