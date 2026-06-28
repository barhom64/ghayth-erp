-- 427_company_parent_link.sql
-- Optional parent-company link: a company can be modeled as a subsidiary of
-- another (e.g. «الدور الحديثة» تابعة لـ «الضياء والبيان»). Self-referencing,
-- nullable, additive only. Data isolation per company is UNCHANGED — this is
-- structural/display metadata, not a scoping change.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "parentCompanyId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_parentCompanyId_fkey'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT "companies_parentCompanyId_fkey"
      FOREIGN KEY ("parentCompanyId") REFERENCES companies(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS companies_parent_idx ON companies ("parentCompanyId");
