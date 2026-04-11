-- ============================================================
-- Migration 015: Company-scope proactive rules
-- Add companyId to proactive_rules for multi-tenant isolation
-- ============================================================

ALTER TABLE proactive_rules ADD COLUMN IF NOT EXISTS "companyId" INTEGER REFERENCES companies(id);

DROP INDEX IF EXISTS proactive_rules_name_idx;
CREATE UNIQUE INDEX IF NOT EXISTS proactive_rules_name_company_idx ON proactive_rules (name, "companyId");
CREATE INDEX IF NOT EXISTS proactive_rules_company_idx ON proactive_rules ("companyId");

DO $$
DECLARE
  comp RECORD;
  rule RECORD;
BEGIN
  FOR comp IN SELECT id FROM companies LOOP
    FOR rule IN
      SELECT name, "nameAr", description, "descriptionAr", module, "triggerType"
      FROM proactive_rules WHERE "companyId" IS NULL
    LOOP
      INSERT INTO proactive_rules (name, "nameAr", description, "descriptionAr", module, "triggerType", "companyId")
      VALUES (rule.name, rule."nameAr", rule.description, rule."descriptionAr", rule.module, rule."triggerType", comp.id)
      ON CONFLICT (name, "companyId") DO NOTHING;
    END LOOP;
  END LOOP;
  DELETE FROM proactive_rules WHERE "companyId" IS NULL;
END $$;
