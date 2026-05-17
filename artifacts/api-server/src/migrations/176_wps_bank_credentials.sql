-- Task #329 — Per-company WPS bank delivery credentials.
--
-- Each company stores its own SFTP / HTTPS credentials per bank
-- adapter. Until this table existed, delivery.ts read everything
-- from process.env (e.g. WPS_NCB_SFTP_HOST), which forced a single
-- bank relationship across every tenant on the host. Multi-tenant
-- deployments need each company admin to be able to paste their
-- own bank-issued private key / token without an infra round-trip.
--
-- The `fields` column stores the full credential map (host, port,
-- user, privateKey, token, …) as a single AES-256-GCM ciphertext
-- produced by lib/secrets.ts (`encryptSecret`). The whole blob is
-- encrypted because the non-secret fields (host, port, dir) are
-- still tenant-confidential operational data.
CREATE TABLE IF NOT EXISTS wps_bank_credentials (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id),
  "bankCode"      TEXT    NOT NULL,
  channel         TEXT    NOT NULL,
  "encryptedFields" TEXT  NOT NULL,
  "fieldNames"    TEXT[]  NOT NULL DEFAULT '{}'::text[],
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdBy"     INTEGER,
  "updatedBy"     INTEGER,
  CONSTRAINT chk_wps_bank_credentials_channel
    CHECK (channel IN ('sftp', 'https'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wps_bank_credentials_company_bank
  ON wps_bank_credentials ("companyId", "bankCode");
