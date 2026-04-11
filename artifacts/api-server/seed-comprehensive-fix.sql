-- Fix employees with unique phones
INSERT INTO employees ("nationalId", "empNumber", name, "nameEn", phone, email, gender, nationality, status) VALUES
  ('1088776655', 'E003', 'خالد المالكي', 'Khalid Al-Maliki', '0551234567', 'khalid@door.sa', 'male', 'سعودي', 'active'),
  ('1077665544', 'E004', 'نورة الشمري', 'Noura Al-Shammari', '0559876999', 'noura@door.sa', 'female', 'سعودية', 'active'),
  ('1066554433', 'E005', 'عبدالرحمن الغامدي', 'Abdulrahman Al-Ghamdi', '0543216789', 'abdulrahman@door.sa', 'male', 'سعودي', 'active'),
  ('1055443322', 'E006', 'فاطمة الزهراني', 'Fatima Al-Zahrani', '0537891234', 'fatima@door.sa', 'female', 'سعودية', 'active'),
  ('1044332211', 'E007', 'محمد القرني', 'Mohammed Al-Qarni', '0521234567', 'mohammed.q@door.sa', 'male', 'سعودي', 'active'),
  ('1033221100', 'E008', 'سارة العنزي', 'Sara Al-Anazi', '0519876543', 'sara@door.sa', 'female', 'سعودية', 'active'),
  ('1022110099', 'E009', 'فيصل الحربي', 'Faisal Al-Harbi', '0567891234', 'faisal@door.sa', 'male', 'سعودي', 'active'),
  ('1011009988', 'E010', 'ريم الدوسري', 'Reem Al-Dosari', '0578123456', 'reem@door.sa', 'female', 'سعودية', 'active'),
  ('1099887766', 'E011', 'تركي السبيعي', 'Turki Al-Subaie', '0534567890', 'turki@door.sa', 'male', 'سعودي', 'active'),
  ('1088776600', 'E012', 'هيفاء البقمي', 'Haifa Al-Bugami', '0545678901', 'haifa@door.sa', 'female', 'سعودية', 'active'),
  ('1077665500', 'E013', 'بندر العمري', 'Bandar Al-Amri', '0556789012', 'bandar@door.sa', 'male', 'سعودي', 'active'),
  ('1066554400', 'E014', 'لمياء الشهري', 'Lamia Al-Shahri', '0567890123', 'lamia@door.sa', 'female', 'سعودية', 'active'),
  ('1055443300', 'E015', 'ياسر الجهني', 'Yasser Al-Juhani', '0578901234', 'yasser@door.sa', 'male', 'سعودي', 'active'),
  ('1044332200', 'E016', 'منال العتيبي', 'Manal Al-Otaibi', '0589012345', 'manal@door.sa', 'female', 'سعودية', 'active'),
  ('1033221199', 'E017', 'سلمان الشريف', 'Salman Al-Shareef', '0590123456', 'salman@door.sa', 'male', 'سعودي', 'active'),
  ('1022119988', 'E018', 'عبير المطيري', 'Abeer Al-Mutairi', '0501234598', 'abeer@door.sa', 'female', 'سعودية', 'active'),
  ('1011008877', 'E019', 'حسن الزهراني', 'Hassan Al-Zahrani', '0512345678', 'hassan@door.sa', 'male', 'سعودي', 'on_leave'),
  ('1099886655', 'E020', 'دلال القحطاني', 'Dalal Al-Qahtani', '0523456789', 'dalal@door.sa', 'female', 'سعودية', 'active'),
  ('1088775544', 'E021', 'عادل السلمي', 'Adel Al-Sulami', '0534567891', 'adel@door.sa', 'male', 'سعودي', 'inactive'),
  ('1077664433', 'E022', 'أمل الرشيدي', 'Amal Al-Rashidi', '0545678912', 'amal@door.sa', 'female', 'سعودية', 'active')
ON CONFLICT ("nationalId") DO NOTHING;

-- Employee Assignments with correct date casting
INSERT INTO employee_assignments ("employeeId", "companyId", "branchId", "departmentId", "jobTitle", role, salary, "isPrimary", "hireDate", status)
SELECT e.id, 1, 1, 1, 'مهندس برمجيات', 'employee', 12000, true, '2024-03-15'::date, 'active' FROM employees e WHERE e."empNumber"='E003' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 1, 2, 'محاسبة', 'employee', 9500, true, '2024-06-01'::date, 'active' FROM employees e WHERE e."empNumber"='E004' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 1, 3, 'مدير مشاريع', 'manager', 15000, true, '2023-11-01'::date, 'active' FROM employees e WHERE e."empNumber"='E005' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 1, 2, 'محللة مالية', 'employee', 11000, true, '2024-01-15'::date, 'active' FROM employees e WHERE e."empNumber"='E006' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 1, 1, 'مطور واجهات', 'employee', 10000, true, '2024-07-01'::date, 'active' FROM employees e WHERE e."empNumber"='E007' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 1, 4, 'أخصائية موارد بشرية', 'employee', 9000, true, '2024-04-01'::date, 'active' FROM employees e WHERE e."empNumber"='E008' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 1, 1, 'مهندس شبكات', 'employee', 13000, true, '2023-09-01'::date, 'active' FROM employees e WHERE e."empNumber"='E009' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 1, 5, 'مصممة جرافيك', 'employee', 8500, true, '2024-08-01'::date, 'active' FROM employees e WHERE e."empNumber"='E010' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 2, 1, 'مهندس أنظمة', 'employee', 14000, true, '2023-06-01'::date, 'active' FROM employees e WHERE e."empNumber"='E011' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 2, 2, 'محاسبة أولى', 'senior', 12500, true, '2023-03-01'::date, 'active' FROM employees e WHERE e."empNumber"='E012' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 2, 3, 'مدير عمليات', 'manager', 16000, true, '2022-12-01'::date, 'active' FROM employees e WHERE e."empNumber"='E013' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 2, 4, 'منسقة إدارية', 'employee', 7500, true, '2024-09-01'::date, 'active' FROM employees e WHERE e."empNumber"='E014' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 1, 1, 'مطور تطبيقات', 'employee', 11500, true, '2024-02-01'::date, 'active' FROM employees e WHERE e."empNumber"='E015' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 1, 5, 'مديرة تسويق', 'manager', 13500, true, '2023-08-01'::date, 'active' FROM employees e WHERE e."empNumber"='E016' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 2, 1, 'مهندس أمن معلومات', 'senior', 15500, true, '2023-01-01'::date, 'active' FROM employees e WHERE e."empNumber"='E017' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 2, 4, 'أخصائية تدريب', 'employee', 8000, true, '2024-05-01'::date, 'active' FROM employees e WHERE e."empNumber"='E018' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 1, 3, 'مشرف مشاريع', 'senior', 14500, true, '2023-04-01'::date, 'on_leave' FROM employees e WHERE e."empNumber"='E019' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 2, 2, 'مراجعة حسابات', 'employee', 10500, true, '2024-03-01'::date, 'active' FROM employees e WHERE e."empNumber"='E020' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 1, 1, 'مطور قواعد بيانات', 'employee', 12000, true, '2023-07-01'::date, 'inactive' FROM employees e WHERE e."empNumber"='E021' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
UNION ALL
SELECT e.id, 1, 2, 5, 'مصممة UX', 'employee', 10000, true, '2024-10-01'::date, 'active' FROM employees e WHERE e."empNumber"='E022' AND NOT EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId"=e.id)
ON CONFLICT DO NOTHING;

-- Additional Tasks with correct column names (scheduledEnd instead of dueDate)
INSERT INTO tasks ("companyId", "assignedTo", title, description, priority, status, "scheduledStart", "scheduledEnd") VALUES
  (1, 3, 'تحديث الموقع الإلكتروني', 'تحديث صفحات الموقع بالمحتوى الجديد', 'high', 'in_progress', CURRENT_DATE - 5, CURRENT_DATE + 10),
  (1, 5, 'مراجعة العقود السنوية', 'مراجعة جميع العقود المنتهية والتجديد', 'medium', 'pending', CURRENT_DATE + 2, CURRENT_DATE + 30),
  (1, 7, 'تركيب خوادم جديدة', 'تركيب وتهيئة خوادم البريد الجديدة', 'high', 'completed', CURRENT_DATE - 20, CURRENT_DATE - 5),
  (1, 8, 'تحديث سياسات الموارد البشرية', 'مراجعة وتحديث سياسات الإجازات', 'low', 'pending', CURRENT_DATE + 5, CURRENT_DATE + 45),
  (1, 9, 'فحص أمني للشبكة', 'إجراء اختبار اختراق شامل', 'high', 'in_progress', CURRENT_DATE - 3, CURRENT_DATE + 7),
  (1, 10, 'تصميم هوية المشروع الجديد', 'تصميم الشعار والهوية البصرية', 'medium', 'in_progress', CURRENT_DATE - 10, CURRENT_DATE + 5)
ON CONFLICT DO NOTHING;

-- Additional Invoices with correct column names (ref instead of invoiceNumber)
INSERT INTO invoices ("companyId", ref, "clientId", subtotal, "vatRate", "vatAmount", total, status, "dueDate") VALUES
  (1, 'INV-011', 3, 35000, 15, 5250, 40250, 'sent', CURRENT_DATE + 15),
  (1, 'INV-012', 4, 12500, 15, 1875, 14375, 'paid', CURRENT_DATE - 15),
  (1, 'INV-013', 5, 95000, 15, 14250, 109250, 'draft', CURRENT_DATE + 30),
  (1, 'INV-014', 6, 8500, 15, 1275, 9775, 'overdue', CURRENT_DATE - 30),
  (1, 'INV-015', 7, 150000, 15, 22500, 172500, 'sent', CURRENT_DATE + 23)
ON CONFLICT DO NOTHING;

-- Check for finance_expenses table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='finance_expenses') THEN
    EXECUTE $q$
      INSERT INTO finance_expenses ("companyId", description, amount, category, status, "createdAt") VALUES
        (1, 'صيانة مكيفات المكتب', 4500, 'maintenance', 'approved', NOW() - interval '10 days'),
        (1, 'شراء أثاث مكتبي', 25000, 'furniture', 'approved', NOW() - interval '30 days'),
        (1, 'رسوم تجديد تراخيص', 8000, 'licenses', 'pending', NOW() - interval '5 days')
      ON CONFLICT DO NOTHING;
    $q$;
  END IF;
END $$;

-- Additional Leave Requests with correct column names (employeeId instead of assignmentId)
INSERT INTO hr_leave_requests ("companyId", "employeeId", "leaveTypeId", "startDate", "endDate", days, status, reason)
SELECT 1, e.id, 1, CURRENT_DATE + 10, CURRENT_DATE + 20, 10, 'pending', 'إجازة سنوية'
FROM employees e WHERE e."empNumber" = 'E005' AND NOT EXISTS (SELECT 1 FROM hr_leave_requests lr WHERE lr."employeeId"=e.id AND lr."startDate"=CURRENT_DATE + 10)
UNION ALL
SELECT 1, e.id, 1, CURRENT_DATE - 3, CURRENT_DATE - 1, 2, 'approved', 'مراجعة طبية'
FROM employees e WHERE e."empNumber" = 'E008' AND NOT EXISTS (SELECT 1 FROM hr_leave_requests lr WHERE lr."employeeId"=e.id AND lr."startDate"=CURRENT_DATE - 3)
UNION ALL
SELECT 1, e.id, 1, CURRENT_DATE + 30, CURRENT_DATE + 40, 10, 'approved', 'إجازة صيفية'
FROM employees e WHERE e."empNumber" = 'E012' AND NOT EXISTS (SELECT 1 FROM hr_leave_requests lr WHERE lr."employeeId"=e.id AND lr."startDate"=CURRENT_DATE + 30)
UNION ALL
SELECT 1, e.id, 1, CURRENT_DATE - 1, CURRENT_DATE, 1, 'pending', 'ظرف طارئ'
FROM employees e WHERE e."empNumber" = 'E015' AND NOT EXISTS (SELECT 1 FROM hr_leave_requests lr WHERE lr."employeeId"=e.id AND lr."startDate"=CURRENT_DATE - 1)
ON CONFLICT DO NOTHING;

-- Additional Warehouse Products with correct columns
INSERT INTO warehouse_products ("companyId", sku, name, description, unit, "currentStock", "minStock", "costPrice", "sellPrice", status) VALUES
  (1, 'WH-010', 'طابعة ليزر HP', 'طابعة ليزر ملونة', 'unit', 5, 2, 2000, 2500, 'active'),
  (1, 'WH-011', 'شاشة كمبيوتر 27 بوصة', 'شاشة عالية الدقة', 'unit', 8, 3, 1500, 1800, 'active'),
  (1, 'WH-012', 'كرسي مكتبي دوار', 'كرسي مريح مع مسند ظهر', 'unit', 15, 5, 700, 950, 'active'),
  (1, 'WH-013', 'ورق تصوير A4', 'ورق أبيض 80 جرام', 'box', 50, 20, 35, 45, 'active'),
  (1, 'WH-014', 'حبر طابعة أسود', 'حبر متوافق HP', 'unit', 2, 5, 200, 280, 'active'),
  (1, 'WH-015', 'لابتوب Dell Latitude', 'لابتوب للأعمال', 'unit', 3, 2, 3800, 4500, 'active')
ON CONFLICT DO NOTHING;

-- Additional Property Units with correct columns
INSERT INTO property_units ("companyId", "unitNumber", "buildingName", type, area, "monthlyRent", status, address) VALUES
  (1, '401', 'المبنى الرئيسي', 'office', 120, 8000, 'available', 'الطابق الرابع'),
  (1, '402', 'المبنى الرئيسي', 'office', 85, 5500, 'rented', 'الطابق الرابع'),
  (1, 'C-1', 'المنطقة الصناعية', 'warehouse', 500, 15000, 'available', 'المنطقة الصناعية'),
  (1, '201', 'مبنى السكن', 'residential', 150, 4000, 'rented', 'الطابق الثاني'),
  (1, 'S-5', 'المركز التجاري', 'commercial', 60, 12000, 'maintenance', 'الطابق الأرضي')
ON CONFLICT DO NOTHING;
