-- artifacts/api-server/src/migrations/173_role_permissions_branchId.sql
--
-- Adds `branchId` to role_permissions so an operator can grant a role
-- extra capabilities in a specific branch without leaking those
-- capabilities to the same role in another branch. The May 2026 audit
-- flagged this as a "BIGGEST GAP" — role permissions were company-wide,
-- so finance_manager in Branch A and Branch B were indistinguishable.
--
-- Semantics:
--   • (role, companyId=NULL, branchId=NULL)  → global default
--   • (role, companyId=X,    branchId=NULL)  → company-wide for X
--   • (role, companyId=X,    branchId=Y)     → branch-specific extra
-- The middleware UNIONs all three tiers for a user, so a branch-specific
-- row ADDS to the company-wide permissions rather than replacing them.
-- This matches the principle of least surprise — admins grant extra
-- explicitly, never silently revoke.
--
-- The existing uniqueness on (role, permission, companyId) is replaced
-- by partial unique indexes that also cover branchId.

BEGIN;

ALTER TABLE role_permissions
  ADD COLUMN IF NOT EXISTS "branchId" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'role_permissions_branchId_fkey'
  ) THEN
    ALTER TABLE role_permissions
      ADD CONSTRAINT "role_permissions_branchId_fkey"
        FOREIGN KEY ("branchId") REFERENCES branches(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Drop the old partial uniques (they only covered company + global tiers).
DROP INDEX IF EXISTS role_permissions_role_perm_company_uq;
DROP INDEX IF EXISTS role_permissions_role_perm_global_uq;

-- Rebuild with branchId in the key. Three partial indexes, one per tier,
-- because NULLs are distinct in btree.
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_role_perm_branch_uq
  ON role_permissions (role, permission, "companyId", "branchId")
  WHERE "branchId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_role_perm_company_uq
  ON role_permissions (role, permission, "companyId")
  WHERE "companyId" IS NOT NULL AND "branchId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_role_perm_global_uq
  ON role_permissions (role, permission)
  WHERE "companyId" IS NULL AND "branchId" IS NULL;

CREATE INDEX IF NOT EXISTS idx_role_permissions_branchid
  ON role_permissions ("branchId")
  WHERE "branchId" IS NOT NULL;

COMMIT;
