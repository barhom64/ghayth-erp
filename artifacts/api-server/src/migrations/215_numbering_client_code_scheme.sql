-- Migration 215 — client code numbering scheme (#1141 phase 3)
--
-- @rollback:
--   DELETE FROM numbering_schemes
--     WHERE ("moduleKey", "entityKey") = ('crm', 'client_code');
--
-- Adds the scheme used by clients.ts to issue customer codes. The
-- previous `generateTimeRef("CLT")` produced a time-based id without
-- audit or per-company sequencing; routing through the numbering
-- center gives each company a clean per-year sequence (`CLT-2026-00001`)
-- with full audit + uniqueness enforcement.

INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses"
)
SELECT c.id, 'crm', 'client_code',
       'كود عميل', 'CLT', '{PREFIX}-{YYYY}-{SEQ}', 5,
       'yearly', 'company', 'on_submit',
       'privileged', '["active","inactive"]'::jsonb
FROM companies c
WHERE COALESCE(c.status, 'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;
