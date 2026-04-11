DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_client_portal_accounts_client'
      AND conrelid = 'client_portal_accounts'::regclass
  ) THEN
    ALTER TABLE client_portal_accounts
      ADD CONSTRAINT uq_client_portal_accounts_client UNIQUE ("clientId", "companyId");
  END IF;
END $$;
