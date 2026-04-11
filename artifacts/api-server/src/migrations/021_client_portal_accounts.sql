CREATE TABLE IF NOT EXISTS client_portal_accounts (
  id               SERIAL PRIMARY KEY,
  "clientId"       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  "companyId"      INTEGER NOT NULL,
  email            VARCHAR(255) NOT NULL UNIQUE,
  "passwordHash"   TEXT NOT NULL,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt"    TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_portal_accounts_client ON client_portal_accounts ("clientId", "companyId");
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_portal_accounts_email ON client_portal_accounts (email);
