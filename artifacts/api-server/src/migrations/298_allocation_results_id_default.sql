-- ===========================================================================
-- 298_allocation_results_id_default.sql
-- ---------------------------------------------------------------------------
-- WHAT:    restore the id sequence + DEFAULT on accounting_allocation_results.
-- WHY:     #1945 item 6 exposed it — migration 203 created the table with
--          `id serial PRIMARY KEY`, but the committed schema dump (and the
--          DB it was generated from) carries `id integer NOT NULL` with NO
--          sequence and NO default. On any database bootstrapped from the
--          dump, EVERY INSERT into accounting_allocation_results fails with
--          a not-null violation on id. The failure is caught + logged by
--          writeAllocationResult, but it has already ABORTED the caller's
--          transaction — so POST /invoices/:id/approve dies downstream with
--          «current transaction is aborted» (500) on every invoice with
--          lines. Same broken-on-fresh-DB class as the journal_lines.branchId
--          gap fixed in the item-2 PR.
-- SAFETY:  zero-downtime, idempotent, non-destructive. Creates the sequence
--          only if missing, never moves it backwards (GREATEST against the
--          current max id), and only adds the default — no data touched.
-- @rollback:
--   ALTER TABLE public.accounting_allocation_results ALTER COLUMN id DROP DEFAULT;
--   DROP SEQUENCE IF EXISTS public.accounting_allocation_results_id_seq;
-- ===========================================================================

CREATE SEQUENCE IF NOT EXISTS public.accounting_allocation_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.accounting_allocation_results_id_seq
    OWNED BY public.accounting_allocation_results.id;

-- Catch up with any rows inserted while a default existed historically.
SELECT setval(
  'public.accounting_allocation_results_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(id) FROM public.accounting_allocation_results), 0) + 1,
    (SELECT last_value FROM public.accounting_allocation_results_id_seq)
  ),
  false
);

ALTER TABLE public.accounting_allocation_results
    ALTER COLUMN id SET DEFAULT nextval('public.accounting_allocation_results_id_seq');
