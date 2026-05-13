-- db/seed-aldiyaa-albayan.sql
--
-- Creates the "Al-Diyaa wal-Bayan" parent company and "Al-Door Al-Hadithah"
-- branch under it, plus a user account for the owner.
--
-- Hierarchy:
--   company  : مؤسسة الضياء والبيان للمقاولات  (CR 4031188915, VAT 310369110700003)
--     branches (flat — schema has no parentId on branches):
--       - مؤسسة الدور الحديثة للتطوير العقاري  (مكة، موحد 7026091814, CR 4031255541)
--           activities under Al-Door (also flat siblings):
--             * الدور الحديثة — نشاط النقل الثقيل   (رخصة 11/00086037)
--             * الدور الحديثة — نشاط التطوير العقاري (شهادة 2392866777)
--       - مؤسسة الضياء والبيان للنقليات — مكة المكرمة  (موحد 7026091798)
--       - مؤسسة الضياء والبيان للنقليات — حفر الباطن  (موحد 7033364436)
--
-- User account:
--   email:    door@door.sa
--   password: Door@2026Diaa     (bcrypt cost 10; regenerate before sharing)
--   role:     owner
--
-- Apply via:
--   psql "$DATABASE_URL" -f db/seed-aldiyaa-albayan.sql
--
-- Idempotent: re-running updates existing rows by lookup keys
-- (companies.name, branches.name+companyId, users.email, employees.nationalId).

BEGIN;

DO $$
DECLARE
  v_company_id  integer;
  v_branch_id   integer;
  v_branch_freight_id integer;
  v_branch_devcert_id integer;
  v_employee_id integer;
  v_user_id     integer;
BEGIN
  ------------------------------------------------------------------
  -- 1. Parent company: مؤسسة الضياء والبيان للمقاولات
  ------------------------------------------------------------------
  SELECT id INTO v_company_id
    FROM companies
   WHERE name = 'مؤسسة الضياء والبيان للمقاولات'
   LIMIT 1;

  IF v_company_id IS NULL THEN
    INSERT INTO companies (
      name, "nameEn", "crNumber", "vatNumber",
      address, phone, email, status, "functionalCurrency"
    ) VALUES (
      'مؤسسة الضياء والبيان للمقاولات',
      'Al-Diyaa wal-Bayan Contracting Est.',
      '4031188915',
      '310369110700003',
      'مكة المكرمة، حي التنعيم، سعد بن خيثمة رضي الله عنه 24224',
      NULL,
      NULL,
      'active',
      'SAR'
    )
    RETURNING id INTO v_company_id;
  ELSE
    UPDATE companies
       SET "nameEn"    = 'Al-Diyaa wal-Bayan Contracting Est.',
           "crNumber"  = '4031188915',
           "vatNumber" = '310369110700003',
           address     = 'مكة المكرمة، حي التنعيم، سعد بن خيثمة رضي الله عنه 24224',
           status      = 'active'
     WHERE id = v_company_id;
  END IF;

  ------------------------------------------------------------------
  -- 2. Sub-branch: مؤسسة الدور الحديثة للتطوير العقاري
  ------------------------------------------------------------------
  SELECT id INTO v_branch_id
    FROM branches
   WHERE "companyId" = v_company_id
     AND name = 'مؤسسة الدور الحديثة للتطوير العقاري'
   LIMIT 1;

  IF v_branch_id IS NULL THEN
    INSERT INTO branches (
      "companyId", name, "nameEn", address, city,
      phone, email, website, "crNumber", "taxNumber", status
    ) VALUES (
      v_company_id,
      'مؤسسة الدور الحديثة للتطوير العقاري',
      'Al-Door Al-Hadithah Real Estate Development Est.',
      'السعدية، الشارع العام 17753',
      'محافظة رماح',
      '0125369972',
      'door@door.sa',
      'https://door.sa',
      '4031255541',
      '7026091814',           -- National Unified Number
      'active'
    )
    RETURNING id INTO v_branch_id;
  ELSE
    UPDATE branches
       SET "nameEn"   = 'Al-Door Al-Hadithah Real Estate Development Est.',
           address    = 'السعدية، الشارع العام 17753',
           city       = 'محافظة رماح',
           phone      = '0125369972',
           email      = 'door@door.sa',
           website    = 'https://door.sa',
           "crNumber" = '4031255541',
           "taxNumber" = '7026091814',
           status     = 'active'
     WHERE id = v_branch_id;
  END IF;

  ------------------------------------------------------------------
  -- 3. Activities under Al-Door Al-Hadithah.
  --
  --    The branches table has no parentId column, so the two licensed
  --    activities are stored as additional flat branch rows under the
  --    same company. Names carry the parent prefix so the relationship
  --    is visible in the UI.
  ------------------------------------------------------------------
  -- 3a. Heavy freight transport license 11/00086037
  SELECT id INTO v_branch_freight_id
    FROM branches
   WHERE "companyId" = v_company_id
     AND name = 'الدور الحديثة — نشاط النقل الثقيل'
   LIMIT 1;

  IF v_branch_freight_id IS NULL THEN
    INSERT INTO branches (
      "companyId", name, "nameEn", "crNumber", "taxNumber",
      city, status, "footerText"
    ) VALUES (
      v_company_id,
      'الدور الحديثة — نشاط النقل الثقيل',
      'Al-Door — Heavy Freight Transport Activity',
      '4031255541',
      '7026091814',
      'محافظة رماح',
      'active',
      'رخصة هيئة النقل العام رقم 11/00086037 — صادرة 2025-06-15، تنتهي 2028-06-15'
    );
  END IF;

  -- 3b. Real-estate developer certification 2392866777
  SELECT id INTO v_branch_devcert_id
    FROM branches
   WHERE "companyId" = v_company_id
     AND name = 'الدور الحديثة — نشاط التطوير العقاري'
   LIMIT 1;

  IF v_branch_devcert_id IS NULL THEN
    INSERT INTO branches (
      "companyId", name, "nameEn", "crNumber", "taxNumber",
      city, status, "footerText"
    ) VALUES (
      v_company_id,
      'الدور الحديثة — نشاط التطوير العقاري',
      'Al-Door — Real Estate Developer Activity',
      '4031255541',
      '7026091814',
      'محافظة رماح',
      'active',
      'شهادة تأهيل مطور عقاري رقم 2392866777 — صادرة 2023-09-25'
    );
  END IF;

  -- 3c. Umrah activity under Al-Door Al-Hadithah
  IF NOT EXISTS (
    SELECT 1 FROM branches
     WHERE "companyId" = v_company_id
       AND name = 'الدور الحديثة — نشاط العمرة'
  ) THEN
    INSERT INTO branches (
      "companyId", name, "nameEn", "crNumber", "taxNumber",
      city, status, "footerText"
    ) VALUES (
      v_company_id,
      'الدور الحديثة — نشاط العمرة',
      'Al-Door — Umrah Activity',
      '4031255541',
      '7026091814',
      'محافظة رماح',
      'active',
      'نشاط العمرة تحت مؤسسة الدور الحديثة للتطوير العقاري'
    );
  END IF;

  -- 3d. Hotels activity under Al-Door Al-Hadithah
  IF NOT EXISTS (
    SELECT 1 FROM branches
     WHERE "companyId" = v_company_id
       AND name = 'الدور الحديثة — نشاط الفنادق'
  ) THEN
    INSERT INTO branches (
      "companyId", name, "nameEn", "crNumber", "taxNumber",
      city, status, "footerText"
    ) VALUES (
      v_company_id,
      'الدور الحديثة — نشاط الفنادق',
      'Al-Door — Hotels Activity',
      '4031255541',
      '7026091814',
      'محافظة رماح',
      'active',
      'نشاط الفنادق تحت مؤسسة الدور الحديثة للتطوير العقاري'
    );
  END IF;

  ------------------------------------------------------------------
  -- 3e. Additional taxpayer branches from the ZATCA VAT certificate:
  --       - مؤسسة الضياء والبيان للنقليات — مكة المكرمة  (موحد 7026091798)
  --       - مؤسسة الضياء والبيان للنقليات — حفر الباطن (موحد 7033364436)
  ------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM branches
     WHERE "companyId" = v_company_id
       AND name = 'مؤسسة الضياء والبيان للنقليات — مكة المكرمة'
  ) THEN
    INSERT INTO branches (
      "companyId", name, "nameEn", "taxNumber", city, status
    ) VALUES (
      v_company_id,
      'مؤسسة الضياء والبيان للنقليات — مكة المكرمة',
      'Al-Diyaa wal-Bayan Transport — Makkah',
      '7026091798',           -- National Unified Number
      'مكة المكرمة',
      'active'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM branches
     WHERE "companyId" = v_company_id
       AND name = 'مؤسسة الضياء والبيان للنقليات — حفر الباطن'
  ) THEN
    INSERT INTO branches (
      "companyId", name, "nameEn", "taxNumber", city, status
    ) VALUES (
      v_company_id,
      'مؤسسة الضياء والبيان للنقليات — حفر الباطن',
      'Al-Diyaa wal-Bayan Transport — Hafar Al Batin',
      '7033364436',           -- National Unified Number
      'حفر الباطن',
      'active'
    );
  END IF;

  ------------------------------------------------------------------
  -- 4. Owner employee: ولاء طلال بن صدقه شافعى
  ------------------------------------------------------------------
  SELECT id INTO v_employee_id
    FROM employees
   WHERE "nationalId" = '1056272873'
   LIMIT 1;

  IF v_employee_id IS NULL THEN
    INSERT INTO employees (
      name, "nameEn", "nationalId", nationality,
      phone, email, status,
      "companyId", "branchId"
    ) VALUES (
      'ولاء طلال بن صدقه شافعى',
      'Walaa Talal bin Sadqa Shafei',
      '1056272873',
      'سعودية',
      '0125369972',
      'door@door.sa',
      'active',
      v_company_id,
      v_branch_id
    )
    RETURNING id INTO v_employee_id;
  ELSE
    UPDATE employees
       SET name         = 'ولاء طلال بن صدقه شافعى',
           email        = 'door@door.sa',
           phone        = '0125369972',
           status       = 'active',
           "companyId"  = v_company_id,
           "branchId"   = v_branch_id
     WHERE id = v_employee_id;
  END IF;

  ------------------------------------------------------------------
  -- 5. User account: door@door.sa / Door@2026Diaa
  --    bcrypt cost 10 hash of "Door@2026Diaa".
  ------------------------------------------------------------------
  SELECT id INTO v_user_id
    FROM users
   WHERE email = 'door@door.sa'
   LIMIT 1;

  IF v_user_id IS NULL THEN
    INSERT INTO users (email, "passwordHash", "isActive", "employeeId", role)
    VALUES (
      'door@door.sa',
      '$2b$10$n6ZCJCyVDDzYVL/MdZhQGOn4Zc36KX8d4TvSu4VtCoKNpOc8Oeg3q',
      true,
      v_employee_id,
      'owner'
    )
    RETURNING id INTO v_user_id;
  ELSE
    UPDATE users
       SET "passwordHash"         = '$2b$10$n6ZCJCyVDDzYVL/MdZhQGOn4Zc36KX8d4TvSu4VtCoKNpOc8Oeg3q',
           "isActive"             = true,
           "employeeId"           = v_employee_id,
           role                   = 'owner',
           "failedLoginAttempts"  = 0,
           "lockedUntil"          = NULL
     WHERE id = v_user_id;
  END IF;

  ------------------------------------------------------------------
  -- 6. Owner-role assignment on the Al-Door branch.
  ------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM employee_assignments
     WHERE "employeeId" = v_employee_id
       AND "companyId"  = v_company_id
       AND "branchId"   = v_branch_id
       AND status = 'active'
  ) THEN
    INSERT INTO employee_assignments (
      "employeeId", "companyId", "branchId",
      "jobTitle", role, "isPrimary", status
    ) VALUES (
      v_employee_id, v_company_id, v_branch_id,
      'مالكة المؤسسة', 'owner', true, 'active'
    );
  ELSE
    UPDATE employee_assignments
       SET role        = 'owner',
           "isPrimary" = true,
           status      = 'active'
     WHERE "employeeId" = v_employee_id
       AND "companyId"  = v_company_id
       AND "branchId"   = v_branch_id;
  END IF;

  RAISE NOTICE 'Seeded Al-Diyaa wal-Bayan: companyId=%, branchId=%, employeeId=%, userId=%',
               v_company_id, v_branch_id, v_employee_id, v_user_id;
END $$;

COMMIT;

-- Sanity check
SELECT
  c.id   AS company_id,
  c.name AS company_name,
  b.id   AS branch_id,
  b.name AS branch_name,
  b."crNumber" AS branch_cr,
  u.email,
  u.role,
  e.name AS employee_name
FROM companies c
LEFT JOIN branches b ON b."companyId" = c.id
LEFT JOIN employees e ON e."companyId" = c.id AND e."nationalId" = '1056272873'
LEFT JOIN users u    ON u."employeeId" = e.id
WHERE c.name = 'مؤسسة الضياء والبيان للمقاولات'
ORDER BY b.id;
