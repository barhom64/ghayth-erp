CREATE TABLE IF NOT EXISTS audit_umrah_access (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id),
  "userId"      INTEGER NOT NULL,
  action        TEXT NOT NULL,
  entity        TEXT NOT NULL,
  "entityId"    INTEGER,
  "ipAddress"   TEXT,
  "userAgent"   TEXT,
  details       JSONB,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_umrah_access_company
  ON audit_umrah_access ("companyId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_audit_umrah_access_user
  ON audit_umrah_access ("userId", "createdAt" DESC);
