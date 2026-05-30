-- ============================================================
-- Migration 242: umrah_pilgrims — overstay exemption fields
-- ============================================================
--
-- The operator's stated rule:
--   "ولابد تسجل تلقائيا اذا ما خرج وممكن تستثنى اذا تم الاتفاق عليه"
--   (Must auto-register on overstay; can be exempted by agreement.)
--
-- PR #1477 + #1479 shipped the tiered penalty model + UI for global/
-- company-scoped penalty knobs. But the cron auto-flags EVERY pilgrim
-- past their programDuration as overstayed, even those the operator
-- has agreed with the agent to exempt (hospitalisation, documented
-- delay, etc.). The flagging itself was correct, but the operator
-- had no way to OPT a specific pilgrim OUT — they'd have to manually
-- waive the violation after creation, leaving an audit trail of
-- false-positives.
--
-- This migration adds 4 columns to umrah_pilgrims:
--   overstayExempt        — bool, default false. When true the
--                            cron skips this row entirely (no
--                            violation row, no penalty calc).
--   overstayExemptReason  — text, why the operator decided to
--                            exempt. Surfaces on the pilgrim
--                            detail card so compliance can audit.
--   overstayExemptBy      — FK to users.id; tracks WHO decided.
--   overstayExemptAt      — timestamptz; tracks WHEN.
--
-- All nullable — pre-existing pilgrim rows stay valid without a
-- backfill. The cron's NOT COALESCE("overstayExempt", false) guard
-- treats null as the regular non-exempt path.
--
-- @rollback: ALTER TABLE umrah_pilgrims
--              DROP COLUMN IF EXISTS "overstayExemptAt",
--              DROP COLUMN IF EXISTS "overstayExemptBy",
--              DROP COLUMN IF EXISTS "overstayExemptReason",
--              DROP COLUMN IF EXISTS "overstayExempt";
--   (Additive columns — drop them and the cron falls back to its
--   pre-PR scan path; no data loss; existing violations stay
--   intact. The pilgrim_detail UI's exemption card simply
--   disappears.)

ALTER TABLE umrah_pilgrims
  ADD COLUMN IF NOT EXISTS "overstayExempt" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "overstayExemptReason" text,
  ADD COLUMN IF NOT EXISTS "overstayExemptBy" integer,
  ADD COLUMN IF NOT EXISTS "overstayExemptAt" timestamptz;

-- Partial index — only rows that ARE exempt; saves on the
-- false-default bucket. Used by the future "exempt pilgrims"
-- compliance report.
CREATE INDEX IF NOT EXISTS umrah_pilgrims_overstay_exempt_idx
  ON umrah_pilgrims ("overstayExempt")
  WHERE "overstayExempt" = true;

COMMENT ON COLUMN umrah_pilgrims."overstayExempt" IS
  'When true, the daily overstay cron (cronScheduler.umrahDailyOverstayScan) skips this pilgrim entirely — no auto-violation row, no penalty calc. Operator-flipped via PATCH /umrah/pilgrims/:id with a reason.';
COMMENT ON COLUMN umrah_pilgrims."overstayExemptReason" IS
  'Free-text justification — surfaces on pilgrim-detail + compliance reports. Required by the PATCH endpoint when overstayExempt is set to true.';
