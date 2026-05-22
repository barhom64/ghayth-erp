-- Migration 187: enforce one-bank-line-per-journal-line at the database.
--
-- RCA: Finance Deep Governance RCA (docs/audit/FINANCE_DEEP_GOVERNANCE_RCA.md)
--      finding REC-2 (P0).
--
-- WHAT: a partial UNIQUE index on bank_statements."matchedJournalLineId",
--       preceded by a one-shot dedup of any pre-existing duplicate matches.
--
-- WHY:  bank reconciliation matched a journal line to a bank-statement line
--       behind only an application-level `NOT EXISTS` guard, with no database
--       constraint. Two concurrent /bank-reconciliation match requests both
--       pass the guard, then both UPDATE — the same journal line is
--       reconciled against two bank lines and the cash position is
--       double-counted. A UNIQUE index closes the race at the database.
--
-- SAFETY: the index is partial (WHERE "matchedJournalLineId" IS NOT NULL) so
--       the many unmatched rows stay unconstrained. Creating it would fail if
--       the bug has already produced duplicate matches in this database, so
--       the migration first resolves them: for each journal line matched on
--       more than one bank_statements row it keeps the match on the lowest-id
--       row and resets the rest to ("matchedJournalLineId"=NULL,
--       "matchStatus"='unmatched') — back into the re-review queue. Both
--       steps are idempotent; the dedup is a no-op on a clean database.
--
-- @rollback: DROP INDEX IF EXISTS bank_statements_matched_journal_line_uq;
--   The dedup UPDATE is NOT reversible — bank lines reset to 'unmatched'
--   must be re-matched by an operator. Rollback drops only the index.

UPDATE bank_statements
   SET "matchedJournalLineId" = NULL,
       "matchStatus" = 'unmatched'
 WHERE id IN (
   SELECT id FROM (
     SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY "matchedJournalLineId" ORDER BY id ASC
            ) AS rn
       FROM bank_statements
      WHERE "matchedJournalLineId" IS NOT NULL
   ) ranked
   WHERE rn > 1
 );

CREATE UNIQUE INDEX IF NOT EXISTS bank_statements_matched_journal_line_uq
  ON bank_statements ("matchedJournalLineId")
  WHERE "matchedJournalLineId" IS NOT NULL;
