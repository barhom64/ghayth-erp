-- ============================================================
-- Migration 016: Accounting Engine Infrastructure
-- ============================================================

-- ============================================================
-- 1. Ensure chart_of_accounts has ALL required columns
-- ============================================================
DO $$ BEGIN
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN "nameEn" VARCHAR(200); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN "parentId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN "parentCode" VARCHAR(20); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN level INTEGER NOT NULL DEFAULT 1; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN "allowPosting" BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN "openingBalance" NUMERIC(15,2) NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN "currentBalance" NUMERIC(15,2) NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN description TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN "branchId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN "activityType" VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN "costCenter" VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN "isAnalytical" BOOLEAN NOT NULL DEFAULT FALSE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Add unique constraint if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chart_of_accounts_company_code_uq'
  ) THEN
    ALTER TABLE chart_of_accounts ADD CONSTRAINT chart_of_accounts_company_code_uq UNIQUE ("companyId", code);
  END IF;
END $$;

-- ============================================================
-- 2. Ensure journal_entries has required columns
-- ============================================================
DO $$ BEGIN
  BEGIN ALTER TABLE journal_entries ADD COLUMN date DATE NOT NULL DEFAULT CURRENT_DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN type VARCHAR(30) NOT NULL DEFAULT 'manual'; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'draft'; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN "sourceType" VARCHAR(50); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN "sourceId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- ============================================================
-- 3. Ensure journal_lines has required columns
-- ============================================================
DO $$ BEGIN
  BEGIN ALTER TABLE journal_lines ADD COLUMN "accountId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN description TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "costCenter" VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "departmentId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "projectId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "employeeId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "vehicleId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "propertyId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "contractId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "activityType" VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "templateId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- ============================================================
-- 4. Accounting Mappings table
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting_mappings (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "operationType" VARCHAR(100) NOT NULL,
  "operationLabel" VARCHAR(200) NOT NULL,
  "debitAccountId"  INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  "creditAccountId" INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  "debitAccountCode"  VARCHAR(20),
  "creditAccountCode" VARCHAR(20),
  "branchId"      INTEGER,
  "activityType"  VARCHAR(100),
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("companyId", "operationType")
);

CREATE INDEX IF NOT EXISTS accounting_mappings_company_idx ON accounting_mappings ("companyId");

-- ============================================================
-- 5. Journal Entry Templates
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_entry_templates (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  "operationType" VARCHAR(100) NOT NULL,
  description     TEXT,
  "branchId"      INTEGER,
  "activityType"  VARCHAR(100),
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_entry_template_lines (
  id              SERIAL PRIMARY KEY,
  "templateId"    INTEGER NOT NULL REFERENCES journal_entry_templates(id) ON DELETE CASCADE,
  "accountId"     INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  "accountCode"   VARCHAR(20),
  "lineType"      VARCHAR(10) NOT NULL CHECK ("lineType" IN ('debit', 'credit')),
  description     TEXT,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS jet_company_idx ON journal_entry_templates ("companyId");
CREATE INDEX IF NOT EXISTS jet_lines_template_idx ON journal_entry_template_lines ("templateId");

-- ============================================================
-- 6. Subsidiary Accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS subsidiary_accounts (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "entityType"    VARCHAR(50) NOT NULL CHECK ("entityType" IN ('employee', 'client', 'vendor', 'project', 'property')),
  "entityId"      INTEGER NOT NULL,
  "accountType"   VARCHAR(50) NOT NULL,
  "accountId"     INTEGER NOT NULL REFERENCES chart_of_accounts(id) ON DELETE CASCADE,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("companyId", "entityType", "entityId", "accountType")
);

CREATE INDEX IF NOT EXISTS subsidiary_accounts_company_idx ON subsidiary_accounts ("companyId");
CREATE INDEX IF NOT EXISTS subsidiary_accounts_entity_idx ON subsidiary_accounts ("companyId", "entityType", "entityId");

-- ============================================================
-- 7. Seed default operation types
-- ============================================================
DO $$
DECLARE
  comp_id INTEGER;
  op_types TEXT[][] := ARRAY[
    ARRAY['payroll',          'الرواتب والأجور'],
    ARRAY['payroll_advance',  'سلف الموظفين'],
    ARRAY['custody',          'عهد الموظفين'],
    ARRAY['fuel',             'مصروفات الوقود'],
    ARRAY['vehicle_maint',    'صيانة المركبات'],
    ARRAY['rent',             'الإيجارات'],
    ARRAY['vendor_payment',   'مدفوعات الموردين'],
    ARRAY['vat',              'ضريبة القيمة المضافة'],
    ARRAY['settlement',       'تسويات'],
    ARRAY['invoice',          'الفواتير والإيرادات'],
    ARRAY['cash_receipt',     'سندات القبض النقدية'],
    ARRAY['bank_receipt',     'سندات القبض البنكية'],
    ARRAY['cash_payment',     'سندات الصرف النقدية'],
    ARRAY['bank_payment',     'سندات الصرف البنكية'],
    ARRAY['depreciation',     'الاستهلاك'],
    ARRAY['inventory',        'حركة المخزون'],
    ARRAY['project_cost',     'تكاليف المشاريع'],
    ARRAY['property_income',  'إيرادات العقارات'],
    ARRAY['insurance',        'التأمين'],
    ARRAY['leave_provision',  'مخصص الإجازات']
  ];
  t TEXT[];
BEGIN
  FOR comp_id IN SELECT id FROM companies LOOP
    FOREACH t SLICE 1 IN ARRAY op_types LOOP
      INSERT INTO accounting_mappings ("companyId", "operationType", "operationLabel")
      VALUES (comp_id, t[1], t[2])
      ON CONFLICT ("companyId", "operationType") DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- 8. Helper function to safely insert an account
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_account(
  p_company_id INTEGER,
  p_code VARCHAR(20),
  p_name VARCHAR(200),
  p_type VARCHAR(20),
  p_parent_id INTEGER,
  p_parent_code VARCHAR(20),
  p_level INTEGER,
  p_allow_posting BOOLEAN,
  p_is_analytical BOOLEAN DEFAULT FALSE
) RETURNS INTEGER AS $$
DECLARE
  v_id INTEGER;
BEGIN
  SELECT id INTO v_id FROM chart_of_accounts WHERE "companyId" = p_company_id AND code = p_code;
  IF v_id IS NULL THEN
    INSERT INTO chart_of_accounts (
      "companyId", code, name, type, "parentId", "parentCode",
      level, "allowPosting", "isAnalytical"
    ) VALUES (
      p_company_id, p_code, p_name, p_type, p_parent_id, p_parent_code,
      p_level, p_allow_posting, p_is_analytical
    ) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 9. Seed professional chart of accounts using the helper
-- ============================================================
DO $$
DECLARE
  comp_id INTEGER;
  id1000 INTEGER; id2000 INTEGER; id3000 INTEGER;
  id4000 INTEGER; id5000 INTEGER;
  id1100 INTEGER; id1200 INTEGER;
  id2100 INTEGER; id2200 INTEGER;
  id4100 INTEGER; id4200 INTEGER;
  id5100 INTEGER; id5200 INTEGER; id5210 INTEGER;
  id5220 INTEGER; id5230 INTEGER; id5300 INTEGER; id5400 INTEGER;
  id1110 INTEGER; id1120 INTEGER; id1130 INTEGER;
  id2101 INTEGER;
BEGIN
  FOR comp_id IN SELECT id FROM companies LOOP
    -- L1
    id1000 := upsert_account(comp_id,'1000','الأصول','asset',NULL,NULL,1,false,false);
    id2000 := upsert_account(comp_id,'2000','الخصوم','liability',NULL,NULL,1,false,false);
    id3000 := upsert_account(comp_id,'3000','حقوق الملكية','equity',NULL,NULL,1,false,false);
    id4000 := upsert_account(comp_id,'4000','الإيرادات','revenue',NULL,NULL,1,false,false);
    id5000 := upsert_account(comp_id,'5000','المصروفات','expense',NULL,NULL,1,false,false);

    -- L2 Assets
    id1100 := upsert_account(comp_id,'1100','الأصول المتداولة','asset',id1000,'1000',2,false,false);
    id1200 := upsert_account(comp_id,'1200','الأصول الثابتة','asset',id1000,'1000',2,false,false);

    -- L3 Current Assets
    PERFORM upsert_account(comp_id,'1101','الصندوق','asset',id1100,'1100',3,true,false);
    PERFORM upsert_account(comp_id,'1102','البنك الرئيسي','asset',id1100,'1100',3,true,false);
    PERFORM upsert_account(comp_id,'1103','البنك الثاني','asset',id1100,'1100',3,true,false);
    id1110 := upsert_account(comp_id,'1110','ذمم مدينة','asset',id1100,'1100',3,false,false);
    id1120 := upsert_account(comp_id,'1120','سلف الموظفين','asset',id1100,'1100',3,false,false);
    id1130 := upsert_account(comp_id,'1130','عهد الموظفين','asset',id1100,'1100',3,false,false);
    PERFORM upsert_account(comp_id,'1140','ضريبة القيمة المضافة المدخلات','asset',id1100,'1100',3,true,false);
    PERFORM upsert_account(comp_id,'1150','مخزون','asset',id1100,'1100',3,true,false);
    PERFORM upsert_account(comp_id,'1160','مصروفات مدفوعة مقدماً','asset',id1100,'1100',3,true,false);

    -- L4 Analytical
    PERFORM upsert_account(comp_id,'1111','ذمم العملاء - حساب تجميعي','asset',id1110,'1110',4,true,true);
    PERFORM upsert_account(comp_id,'1121','سلف الموظفين - حساب تجميعي','asset',id1120,'1120',4,true,true);
    PERFORM upsert_account(comp_id,'1131','عهد الموظفين - حساب تجميعي','asset',id1130,'1130',4,true,true);

    -- L3 Fixed Assets
    PERFORM upsert_account(comp_id,'1210','مركبات','asset',id1200,'1200',3,true,false);
    PERFORM upsert_account(comp_id,'1211','مجمع إهلاك المركبات','asset',id1200,'1200',3,true,false);
    PERFORM upsert_account(comp_id,'1220','أثاث ومعدات مكتبية','asset',id1200,'1200',3,true,false);
    PERFORM upsert_account(comp_id,'1221','مجمع إهلاك الأثاث','asset',id1200,'1200',3,true,false);
    PERFORM upsert_account(comp_id,'1230','أجهزة تقنية المعلومات','asset',id1200,'1200',3,true,false);
    PERFORM upsert_account(comp_id,'1231','مجمع إهلاك الأجهزة','asset',id1200,'1200',3,true,false);
    PERFORM upsert_account(comp_id,'1240','عقارات','asset',id1200,'1200',3,true,false);
    PERFORM upsert_account(comp_id,'1241','مجمع إهلاك العقارات','asset',id1200,'1200',3,true,false);

    -- L2 Liabilities
    id2100 := upsert_account(comp_id,'2100','الخصوم المتداولة','liability',id2000,'2000',2,false,false);
    id2200 := upsert_account(comp_id,'2200','الخصوم طويلة الأجل','liability',id2000,'2000',2,false,false);

    -- L3 Current Liabilities
    id2101 := upsert_account(comp_id,'2101','ذمم دائنة - موردون','liability',id2100,'2100',3,false,false);
    PERFORM upsert_account(comp_id,'2110','رواتب مستحقة','liability',id2100,'2100',3,true,false);
    PERFORM upsert_account(comp_id,'2120','ضريبة القيمة المضافة المخرجات','liability',id2100,'2100',3,true,false);
    PERFORM upsert_account(comp_id,'2130','ضريبة الاستقطاع','liability',id2100,'2100',3,true,false);
    PERFORM upsert_account(comp_id,'2140','مستحقات أخرى','liability',id2100,'2100',3,true,false);
    PERFORM upsert_account(comp_id,'2150','إيرادات مؤجلة','liability',id2100,'2100',3,true,false);

    -- L4 Vendor Analytical
    PERFORM upsert_account(comp_id,'2102','ذمم الموردين - حساب تجميعي','liability',id2101,'2101',4,true,true);

    -- L3 Long-term Liabilities
    PERFORM upsert_account(comp_id,'2210','قروض بنكية','liability',id2200,'2200',3,true,false);
    PERFORM upsert_account(comp_id,'2220','مخصص مكافأة نهاية الخدمة','liability',id2200,'2200',3,true,false);

    -- L2 Equity
    PERFORM upsert_account(comp_id,'3100','رأس المال','equity',id3000,'3000',2,true,false);
    PERFORM upsert_account(comp_id,'3200','الأرباح المحتجزة','equity',id3000,'3000',2,true,false);
    PERFORM upsert_account(comp_id,'3300','أرباح وخسائر العام','equity',id3000,'3000',2,true,false);

    -- L2 Revenue
    id4100 := upsert_account(comp_id,'4100','إيرادات الخدمات','revenue',id4000,'4000',2,false,false);
    PERFORM upsert_account(comp_id,'4110','إيرادات المبيعات','revenue',id4000,'4000',2,true,false);
    PERFORM upsert_account(comp_id,'4120','إيرادات الإيجارات','revenue',id4000,'4000',2,true,false);
    PERFORM upsert_account(comp_id,'4130','إيرادات المشاريع','revenue',id4000,'4000',2,true,false);
    id4200 := upsert_account(comp_id,'4200','إيرادات أخرى','revenue',id4000,'4000',2,false,false);

    -- L3 Revenue
    PERFORM upsert_account(comp_id,'4101','إيرادات خدمات رئيسية','revenue',id4100,'4100',3,true,false);
    PERFORM upsert_account(comp_id,'4102','إيرادات خدمات استشارية','revenue',id4100,'4100',3,true,false);
    PERFORM upsert_account(comp_id,'4210','فوائد بنكية','revenue',id4200,'4200',3,true,false);
    PERFORM upsert_account(comp_id,'4220','أرباح بيع أصول','revenue',id4200,'4200',3,true,false);
    PERFORM upsert_account(comp_id,'4230','إيرادات متنوعة','revenue',id4200,'4200',3,true,false);

    -- L2 Expense
    id5100 := upsert_account(comp_id,'5100','تكاليف الموارد البشرية','expense',id5000,'5000',2,false,false);
    id5200 := upsert_account(comp_id,'5200','مصروفات التشغيل','expense',id5000,'5000',2,false,false);
    id5210 := upsert_account(comp_id,'5210','مصروفات الأسطول','expense',id5000,'5000',2,false,false);
    id5220 := upsert_account(comp_id,'5220','مصروفات المشاريع','expense',id5000,'5000',2,false,false);
    id5230 := upsert_account(comp_id,'5230','الاستهلاك والإطفاء','expense',id5000,'5000',2,false,false);
    id5300 := upsert_account(comp_id,'5300','مصروفات إدارية وعمومية','expense',id5000,'5000',2,false,false);
    id5400 := upsert_account(comp_id,'5400','مصروفات تمويلية','expense',id5000,'5000',2,false,false);

    -- L3 HR
    PERFORM upsert_account(comp_id,'5101','الرواتب والأجور','expense',id5100,'5100',3,true,false);
    PERFORM upsert_account(comp_id,'5102','مكافأة نهاية الخدمة','expense',id5100,'5100',3,true,false);
    PERFORM upsert_account(comp_id,'5103','مكافآت وحوافز','expense',id5100,'5100',3,true,false);
    PERFORM upsert_account(comp_id,'5104','التأمين الطبي','expense',id5100,'5100',3,true,false);
    PERFORM upsert_account(comp_id,'5105','التأمينات الاجتماعية','expense',id5100,'5100',3,true,false);
    PERFORM upsert_account(comp_id,'5106','بدلات السكن والنقل','expense',id5100,'5100',3,true,false);

    -- L3 Operations
    PERFORM upsert_account(comp_id,'5201','إيجارات المكاتب','expense',id5200,'5200',3,true,false);
    PERFORM upsert_account(comp_id,'5202','كهرباء وماء وخدمات','expense',id5200,'5200',3,true,false);
    PERFORM upsert_account(comp_id,'5203','اتصالات وإنترنت','expense',id5200,'5200',3,true,false);
    PERFORM upsert_account(comp_id,'5204','قرطاسية ومستلزمات مكتبية','expense',id5200,'5200',3,true,false);
    PERFORM upsert_account(comp_id,'5205','تسويق وإعلان','expense',id5200,'5200',3,true,false);

    -- L3 Fleet
    PERFORM upsert_account(comp_id,'5211','وقود','expense',id5210,'5210',3,true,false);
    PERFORM upsert_account(comp_id,'5212','صيانة مركبات','expense',id5210,'5210',3,true,false);
    PERFORM upsert_account(comp_id,'5213','تأمين مركبات','expense',id5210,'5210',3,true,false);
    PERFORM upsert_account(comp_id,'5214','مخالفات مرورية','expense',id5210,'5210',3,true,false);

    -- L3 Projects
    PERFORM upsert_account(comp_id,'5221','تكاليف مباشرة للمشاريع','expense',id5220,'5220',3,true,false);
    PERFORM upsert_account(comp_id,'5222','مواد ومستلزمات المشاريع','expense',id5220,'5220',3,true,false);

    -- L3 Depreciation
    PERFORM upsert_account(comp_id,'5231','استهلاك المركبات','expense',id5230,'5230',3,true,false);
    PERFORM upsert_account(comp_id,'5232','استهلاك الأجهزة والمعدات','expense',id5230,'5230',3,true,false);
    PERFORM upsert_account(comp_id,'5233','استهلاك العقارات','expense',id5230,'5230',3,true,false);

    -- L3 G&A
    PERFORM upsert_account(comp_id,'5301','رسوم قانونية واستشارية','expense',id5300,'5300',3,true,false);
    PERFORM upsert_account(comp_id,'5302','رسوم حكومية وتراخيص','expense',id5300,'5300',3,true,false);
    PERFORM upsert_account(comp_id,'5303','ضيافة وسفر','expense',id5300,'5300',3,true,false);
    PERFORM upsert_account(comp_id,'5304','صيانة وإصلاح عامة','expense',id5300,'5300',3,true,false);
    PERFORM upsert_account(comp_id,'5305','تدريب وتطوير','expense',id5300,'5300',3,true,false);

    -- L3 Financial
    PERFORM upsert_account(comp_id,'5401','فوائد بنكية مدفوعة','expense',id5400,'5400',3,true,false);
    PERFORM upsert_account(comp_id,'5402','عمولات بنكية','expense',id5400,'5400',3,true,false);
    PERFORM upsert_account(comp_id,'5410','مصروفات متنوعة','expense',id5400,'5400',3,true,false);

  END LOOP;
END $$;
