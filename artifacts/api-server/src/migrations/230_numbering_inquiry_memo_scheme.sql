-- Migration 230 — inquiry_memo numbering scheme (#1141 G1 closure)
--
-- @rollback:
--   DELETE FROM numbering_schemes
--     WHERE ("moduleKey", "entityKey") = ('hr', 'inquiry_memo');
--
-- Closes G1 from coverage report. lib/disciplineEngine.ts:331
-- generateMemoNumber used a SELECT COUNT(*) + 1 to compute memoNumber:
--
--   SELECT COUNT(*) FROM hr_inquiry_memos
--     WHERE "companyId" = $1 AND EXTRACT(YEAR FROM "createdAt") = $2
--   → seq = cnt + 1
--   → MEMO-{YYYY}-{SEQ}
--
-- Three defects with this pattern:
--   1. NOT atomic — two concurrent callers (dailyDeductionCheck running
--      back-to-back, manual disciplinary action overlapping the cron)
--      both see the same COUNT and both produce the same memoNumber.
--      The schema's uq_hr_inquiry_memos_violation index catches the
--      duplicate INSERT, but only for memos with a violationId. Manual
--      memos without violationId can collide silently.
--   2. NO audit trail — the COUNT-based seq doesn't land in
--      numbering_assignments, so the central UI can't show "who issued
--      MEMO-2026-00042 and when".
--   3. NO policy enforcement — the scheme's lockAfterStatuses,
--      manualEditPolicy, issueTiming, branchPrefixOverrides are all
--      ignored.
--
-- The companion code change replaces generateMemoNumber with a call to
-- issueNumber({ moduleKey: "hr", entityKey: "inquiry_memo", ... }) which
-- runs the atomic FOR UPDATE on numbering_counters + logs the assignment
-- + enforces the scheme policy.

INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses",
    "defaultEntityTable", "defaultRefColumn"
)
SELECT c.id, 'hr', 'inquiry_memo',
       'مذكرة تحقيق', 'MEMO', '{PREFIX}-{YYYY}-{SEQ}', 5,
       'yearly', 'company', 'on_draft',
       'disabled', '["pending_employee","employee_responded","hr_reviewed","resolved","closed"]'::jsonb,
       'hr_inquiry_memos', 'memoNumber'
FROM companies c
WHERE COALESCE(c.status, 'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;
