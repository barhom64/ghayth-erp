ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS "user_roles_userId_roleKey_key";

CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_userId_roleKey_companyId_key"
  ON user_roles ("userId", "roleKey", "companyId");
