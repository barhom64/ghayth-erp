-- artifacts/api-server/src/migrations/171_support_tickets_branchId.sql
--
-- Adds `branchId` to support_tickets so a support agent assigned to
-- branch X can no longer see tickets that belong to branch Y under
-- the same company. Without this, every agent in the company sees
-- every ticket — confirmed by the May 2026 branch-isolation audit.
--
-- Backfill rule: existing tickets get `branchId` from their assignee's
-- active employee_assignment when available; otherwise NULL (treated
-- as company-wide by the UI, same as before). Nothing is dropped.

BEGIN;

-- 1. Column + FK
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS "branchId" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'support_tickets_branchId_fkey'
  ) THEN
    ALTER TABLE support_tickets
      ADD CONSTRAINT "support_tickets_branchId_fkey"
        FOREIGN KEY ("branchId") REFERENCES branches(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_tickets_branchid
  ON support_tickets ("branchId")
  WHERE "branchId" IS NOT NULL;

-- 2. Backfill from assignee's primary active assignment.
--    The choice is: pick the assignment whose companyId matches the
--    ticket and whose status is active, preferring `isPrimary=true`.
UPDATE support_tickets t
   SET "branchId" = sub."branchId"
  FROM (
    SELECT DISTINCT ON (u.id, ea."companyId")
           u.id          AS user_id,
           ea."companyId" AS company_id,
           ea."branchId"
      FROM users u
      JOIN employee_assignments ea
        ON ea."employeeId" = u."employeeId"
       AND ea.status = 'active'
     ORDER BY u.id, ea."companyId", ea."isPrimary" DESC NULLS LAST, ea.id
  ) sub
 WHERE t."assigneeId" = sub.user_id
   AND t."companyId"  = sub.company_id
   AND t."branchId" IS NULL;

COMMIT;
