-- ===========================================================================
-- 311_journal_status_axes_trigger.sql
-- ---------------------------------------------------------------------------
-- WHAT:    a BEFORE INSERT OR UPDATE trigger on journal_entries that keeps the
--          three status axes (documentStatus / paymentStatus / postingStatus)
--          derived and consistent on EVERY write, plus a one-time corrective
--          re-derivation of existing rows.
-- WHY:     #2098 / FIN-SUB-03 — migration 287 added the three axis columns and
--          a one-time backfill, but no WRITER populates them: every journal
--          writer still only sets the legacy `status`/`isPaid`, so any entry
--          created after 287 was born with NULL axes. Rather than touch the
--          two INSERT paths + the ten UPDATE sites (and risk a missed/stale
--          writer), one trigger fills the triad centrally for every current
--          and future writer (the owner's chosen mechanism, #2098 review).
--
--          DERIVATION (single source of truth, mirrors the FE status-model):
--            documentStatus  — the approval lifecycle, from `status`
--                              (byte-for-byte mapJournalStatus / migration 287).
--            postingStatus   — from the ACTUAL posting, NOT the loose `status`:
--                              a directly-posted entry carries status='draft'
--                              with balancesApplied=true (proven live), so
--                              status-derivation would mislabel a real posting
--                              as 'unposted'. Owner decision (#2098): derive
--                              from balancesApplied — reversed/cancelled →
--                              'reversed'; balances applied → 'posted'; else
--                              'unposted'.
--            paymentStatus   — the canBePaid invariant: 'paid' only when isPaid
--                              AND the document is approved; never a paid draft.
-- SAFETY:  expand phase — additive. The axes shadow the legacy columns; reads
--          stay on `status`/`isPaid` until a later contract PR. The trigger is
--          deterministic and idempotent (re-running yields identical axes), has
--          no period/account/balance side-effects, and the values stay within
--          the CHECK domains migration 287 installed. Idempotent DDL.
-- @rollback:
--   DROP TRIGGER IF EXISTS trg_journal_entries_status_axes ON journal_entries;
--   DROP FUNCTION IF EXISTS journal_entries_derive_status_axes();
-- ===========================================================================

CREATE OR REPLACE FUNCTION journal_entries_derive_status_axes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- documentStatus — approval lifecycle from the legacy single status.
  NEW."documentStatus" := CASE NEW.status
     WHEN 'posted'           THEN 'approved'
     WHEN 'approved'         THEN 'approved'
     WHEN 'reversed'         THEN 'approved'
     WHEN 'pending_approval' THEN 'submitted'
     WHEN 'returned'         THEN 'submitted'
     WHEN 'rejected'         THEN 'rejected'
     WHEN 'cancelled'        THEN 'cancelled'
     ELSE 'draft' END;

  -- postingStatus — from the ACTUAL posting (balancesApplied), not `status`.
  NEW."postingStatus" := CASE
     WHEN NEW.status IN ('reversed', 'cancelled') THEN 'reversed'
     WHEN NEW."balancesApplied" IS TRUE           THEN 'posted'
     ELSE 'unposted' END;

  -- paymentStatus — canBePaid: paid only when isPaid AND the document is
  -- approved (so a draft/pending entry is never 'paid').
  NEW."paymentStatus" := CASE
     WHEN NEW."isPaid" IS TRUE AND NEW."documentStatus" = 'approved' THEN 'paid'
     ELSE 'unpaid' END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_status_axes ON journal_entries;
CREATE TRIGGER trg_journal_entries_status_axes
  BEFORE INSERT OR UPDATE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION journal_entries_derive_status_axes();

-- One-time corrective re-derivation of existing rows. Migration 287 derived
-- postingStatus from `status`; this aligns historical rows with the truthful
-- balancesApplied rule (and fills any row born NULL after 287). Deterministic.
UPDATE journal_entries SET
  "documentStatus" = CASE status
     WHEN 'posted' THEN 'approved' WHEN 'approved' THEN 'approved' WHEN 'reversed' THEN 'approved'
     WHEN 'pending_approval' THEN 'submitted' WHEN 'returned' THEN 'submitted'
     WHEN 'rejected' THEN 'rejected' WHEN 'cancelled' THEN 'cancelled' ELSE 'draft' END,
  "postingStatus" = CASE
     WHEN status IN ('reversed', 'cancelled') THEN 'reversed'
     WHEN "balancesApplied" IS TRUE           THEN 'posted'
     ELSE 'unposted' END,
  "paymentStatus" = CASE
     WHEN "isPaid" IS TRUE AND status IN ('posted', 'approved', 'reversed') THEN 'paid'
     ELSE 'unpaid' END;
