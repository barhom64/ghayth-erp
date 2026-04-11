-- Comprehensive test data seed for Ghayth ERP
-- 20+ employees, 10+ clients, more vehicles, varied statuses

-- Additional Employees (already have 2)
INSERT INTO employees ("nationalId", "empNumber", name, "nameEn", phone, email, gender, nationality, status) VALUES
  ('1088776655', 'E003', 'خالد المالكي', 'Khalid Al-Maliki', '0551234567', 'khalid@door.sa', 'male', 'سعودي', 'active'),
  ('1077665544', 'E004', 'نورة الشمري', 'Noura Al-Shammari', '0559876543', 'noura@door.sa', 'female', 'سعودية', 'active'),
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

-- Employee Assignments (link new employees to company/branch/dept)
INSERT INTO employee_assignments ("employeeId", "companyId", "branchId", "departmentId", "jobTitle", role, salary, "isPrimary", "hireDate", status)
SELECT e.id, 1, 1, 1, 'مهندس برمجيات', 'employee', 12000, true, '2024-03-15', 'active' FROM employees e WHERE e."empNumber"='E003'
UNION ALL
SELECT e.id, 1, 1, 2, 'محاسبة', 'employee', 9500, true, '2024-06-01', 'active' FROM employees e WHERE e."empNumber"='E004'
UNION ALL
SELECT e.id, 1, 1, 3, 'مدير مشاريع', 'manager', 15000, true, '2023-11-01', 'active' FROM employees e WHERE e."empNumber"='E005'
UNION ALL
SELECT e.id, 1, 1, 2, 'محللة مالية', 'employee', 11000, true, '2024-01-15', 'active' FROM employees e WHERE e."empNumber"='E006'
UNION ALL
SELECT e.id, 1, 1, 1, 'مطور واجهات', 'employee', 10000, true, '2024-07-01', 'active' FROM employees e WHERE e."empNumber"='E007'
UNION ALL
SELECT e.id, 1, 1, 4, 'أخصائية موارد بشرية', 'employee', 9000, true, '2024-04-01', 'active' FROM employees e WHERE e."empNumber"='E008'
UNION ALL
SELECT e.id, 1, 1, 1, 'مهندس شبكات', 'employee', 13000, true, '2023-09-01', 'active' FROM employees e WHERE e."empNumber"='E009'
UNION ALL
SELECT e.id, 1, 1, 5, 'مصممة جرافيك', 'employee', 8500, true, '2024-08-01', 'active' FROM employees e WHERE e."empNumber"='E010'
UNION ALL
SELECT e.id, 1, 2, 1, 'مهندس أنظمة', 'employee', 14000, true, '2023-06-01', 'active' FROM employees e WHERE e."empNumber"='E011'
UNION ALL
SELECT e.id, 1, 2, 2, 'محاسبة أولى', 'senior', 12500, true, '2023-03-01', 'active' FROM employees e WHERE e."empNumber"='E012'
UNION ALL
SELECT e.id, 1, 2, 3, 'مدير عمليات', 'manager', 16000, true, '2022-12-01', 'active' FROM employees e WHERE e."empNumber"='E013'
UNION ALL
SELECT e.id, 1, 2, 4, 'منسقة إدارية', 'employee', 7500, true, '2024-09-01', 'active' FROM employees e WHERE e."empNumber"='E014'
UNION ALL
SELECT e.id, 1, 1, 1, 'مطور تطبيقات', 'employee', 11500, true, '2024-02-01', 'active' FROM employees e WHERE e."empNumber"='E015'
UNION ALL
SELECT e.id, 1, 1, 5, 'مديرة تسويق', 'manager', 13500, true, '2023-08-01', 'active' FROM employees e WHERE e."empNumber"='E016'
UNION ALL
SELECT e.id, 1, 2, 1, 'مهندس أمن معلومات', 'senior', 15500, true, '2023-01-01', 'active' FROM employees e WHERE e."empNumber"='E017'
UNION ALL
SELECT e.id, 1, 2, 4, 'أخصائية تدريب', 'employee', 8000, true, '2024-05-01', 'active' FROM employees e WHERE e."empNumber"='E018'
UNION ALL
SELECT e.id, 1, 1, 3, 'مشرف مشاريع', 'senior', 14500, true, '2023-04-01', 'on_leave' FROM employees e WHERE e."empNumber"='E019'
UNION ALL
SELECT e.id, 1, 2, 2, 'مراجعة حسابات', 'employee', 10500, true, '2024-03-01', 'active' FROM employees e WHERE e."empNumber"='E020'
UNION ALL
SELECT e.id, 1, 1, 1, 'مطور قواعد بيانات', 'employee', 12000, true, '2023-07-01', 'inactive' FROM employees e WHERE e."empNumber"='E021'
UNION ALL
SELECT e.id, 1, 2, 5, 'مصممة UX', 'employee', 10000, true, '2024-10-01', 'active' FROM employees e WHERE e."empNumber"='E022'
ON CONFLICT DO NOTHING;

-- Additional Clients (already have 2)
INSERT INTO clients ("companyId", code, type, name, phone, email, classification, source, "totalRevenue") VALUES
  (1, 'CL-003', 'company', 'شركة الفجر للتقنية', '0112345678', 'info@alfajr.sa', 'premium', 'referral', 250000),
  (1, 'CL-004', 'company', 'مؤسسة الريادة التجارية', '0113456789', 'contact@riada.sa', 'regular', 'website', 85000),
  (1, 'CL-005', 'company', 'شركة المستقبل للاستشارات', '0114567890', 'info@mustaqbal.sa', 'vip', 'direct', 520000),
  (1, 'CL-006', 'individual', 'أحمد بن سعيد العمري', '0555123456', 'ahmed.amri@email.sa', 'regular', 'referral', 45000),
  (1, 'CL-007', 'company', 'مجموعة النخبة القابضة', '0115678901', 'info@nukhba.sa', 'vip', 'direct', 890000),
  (1, 'CL-008', 'company', 'شركة البناء الحديث', '0116789012', 'contact@hadith.sa', 'premium', 'exhibition', 340000),
  (1, 'CL-009', 'individual', 'فهد المنصور', '0556234567', 'fahd.mansour@email.sa', 'prospect', 'website', 0),
  (1, 'CL-010', 'company', 'مصنع الخليج للبلاستيك', '0117890123', 'sales@khalij.sa', 'regular', 'referral', 120000),
  (1, 'CL-011', 'company', 'شركة الأمان للتأمين', '0118901234', 'info@amaan.sa', 'premium', 'direct', 275000),
  (1, 'CL-012', 'company', 'مؤسسة الوطن للمقاولات', '0119012345', 'info@watan.sa', 'churned', 'exhibition', 65000)
ON CONFLICT DO NOTHING;

-- Additional Vehicles (already have 3)
INSERT INTO fleet_vehicles ("companyId", "plateNumber", make, model, year, color, "fuelType", "fuelCapacity", "currentMileage", status) VALUES
  (1, 'ر ك م 4567', 'نيسان', 'باترول', 2024, 'أبيض', 'gasoline', 140, 12000, 'active'),
  (1, 'س ع د 7890', 'هيونداي', 'سوناتا', 2025, 'فضي', 'gasoline', 70, 5000, 'active'),
  (1, 'ع م ر 1234', 'تويوتا', 'هايلكس', 2023, 'أسود', 'diesel', 80, 45000, 'active'),
  (1, 'م ح د 5678', 'كيا', 'سبورتاج', 2024, 'رمادي', 'gasoline', 62, 18000, 'active'),
  (1, 'ف ي ص 9012', 'شيفروليه', 'تاهو', 2023, 'أبيض لؤلؤي', 'gasoline', 91, 35000, 'maintenance'),
  (1, 'ن و ر 3456', 'مرسيدس', 'سبرنتر', 2022, 'أبيض', 'diesel', 75, 78000, 'active'),
  (1, 'ب د ر 7891', 'ميتسوبيشي', 'L200', 2024, 'أحمر', 'diesel', 75, 8000, 'active')
ON CONFLICT DO NOTHING;

-- Additional Fleet Drivers (already have 2)
INSERT INTO fleet_drivers ("companyId", name, phone, "licenseNumber", "licenseExpiry", status) VALUES
  (1, 'سعود الحربي', '0571234567', 'DL-003', '2027-06-30', 'active'),
  (1, 'عبدالله العنزي', '0572345678', 'DL-004', '2026-12-31', 'active'),
  (1, 'ماجد السلمي', '0573456789', 'DL-005', '2027-03-15', 'active'),
  (1, 'طارق الشهري', '0574567890', 'DL-006', '2026-09-30', 'inactive')
ON CONFLICT DO NOTHING;

-- Additional Tasks (already have 8)
INSERT INTO tasks ("companyId", "assignedTo", title, description, priority, status, "scheduledStart", "dueDate") VALUES
  (1, 3, 'تحديث الموقع الإلكتروني', 'تحديث صفحات الموقع بالمحتوى الجديد', 'high', 'in_progress', CURRENT_DATE - 5, CURRENT_DATE + 10),
  (1, 5, 'مراجعة العقود السنوية', 'مراجعة جميع العقود المنتهية والتجديد', 'medium', 'pending', CURRENT_DATE + 2, CURRENT_DATE + 30),
  (1, 7, 'تركيب خوادم جديدة', 'تركيب وتهيئة خوادم البريد الجديدة', 'high', 'completed', CURRENT_DATE - 20, CURRENT_DATE - 5),
  (1, 8, 'تحديث سياسات الموارد البشرية', 'مراجعة وتحديث سياسات الإجازات', 'low', 'pending', CURRENT_DATE + 5, CURRENT_DATE + 45),
  (1, 9, 'فحص أمني للشبكة', 'إجراء اختبار اختراق شامل', 'high', 'in_progress', CURRENT_DATE - 3, CURRENT_DATE + 7),
  (1, 10, 'تصميم هوية المشروع الجديد', 'تصميم الشعار والهوية البصرية', 'medium', 'in_progress', CURRENT_DATE - 10, CURRENT_DATE + 5)
ON CONFLICT DO NOTHING;

-- Additional Support Tickets (already have 9)
INSERT INTO support_tickets ("companyId", ref, title, description, category, priority, status, "clientId") VALUES
  (1, 'TK-010', 'مشكلة في الطباعة', 'طابعة الطابق الثالث لا تعمل', 'hardware', 'medium', 'open', 1),
  (1, 'TK-011', 'طلب تحديث نظام', 'تحديث نظام المحاسبة للإصدار الجديد', 'software', 'high', 'in_progress', 2),
  (1, 'TK-012', 'انقطاع الإنترنت', 'انقطاع متكرر في الإنترنت بالفرع الثاني', 'network', 'urgent', 'open', 1),
  (1, 'TK-013', 'طلب صلاحيات', 'طلب صلاحيات إضافية للنظام المالي', 'access', 'low', 'resolved', 3),
  (1, 'TK-014', 'بطء النظام', 'بطء ملحوظ في تحميل التقارير', 'performance', 'high', 'in_progress', 4),
  (1, 'TK-015', 'خطأ في الفاتورة', 'فاتورة صادرة بمبلغ خاطئ', 'billing', 'medium', 'closed', 2)
ON CONFLICT DO NOTHING;

-- Additional Invoices (already have ~10)
INSERT INTO invoices ("companyId", "invoiceNumber", "clientId", amount, tax, total, status, "issueDate", "dueDate") VALUES
  (1, 'INV-011', 3, 35000, 5250, 40250, 'sent', CURRENT_DATE - 15, CURRENT_DATE + 15),
  (1, 'INV-012', 4, 12500, 1875, 14375, 'paid', CURRENT_DATE - 45, CURRENT_DATE - 15),
  (1, 'INV-013', 5, 95000, 14250, 109250, 'draft', CURRENT_DATE, CURRENT_DATE + 30),
  (1, 'INV-014', 6, 8500, 1275, 9775, 'overdue', CURRENT_DATE - 60, CURRENT_DATE - 30),
  (1, 'INV-015', 7, 150000, 22500, 172500, 'sent', CURRENT_DATE - 7, CURRENT_DATE + 23)
ON CONFLICT DO NOTHING;

-- Additional Expenses
INSERT INTO expenses ("companyId", description, amount, category, status, "expenseDate") VALUES
  (1, 'صيانة مكيفات المكتب', 4500, 'maintenance', 'approved', CURRENT_DATE - 10),
  (1, 'شراء أثاث مكتبي', 25000, 'furniture', 'approved', CURRENT_DATE - 30),
  (1, 'رسوم تجديد تراخيص', 8000, 'licenses', 'pending', CURRENT_DATE - 5),
  (1, 'مصاريف سفر - مؤتمر تقني', 12000, 'travel', 'approved', CURRENT_DATE - 20),
  (1, 'اشتراكات برمجية سنوية', 35000, 'software', 'approved', CURRENT_DATE - 2)
ON CONFLICT DO NOTHING;

-- Additional Leave Requests
INSERT INTO hr_leave_requests ("companyId", "assignmentId", "leaveType", "startDate", "endDate", days, status, reason)
SELECT 1, ea.id, 'annual', CURRENT_DATE + 10, CURRENT_DATE + 20, 10, 'pending', 'إجازة سنوية'
FROM employee_assignments ea JOIN employees e ON ea."employeeId" = e.id WHERE e."empNumber" = 'E005'
UNION ALL
SELECT 1, ea.id, 'sick', CURRENT_DATE - 3, CURRENT_DATE - 1, 2, 'approved', 'مراجعة طبية'
FROM employee_assignments ea JOIN employees e ON ea."employeeId" = e.id WHERE e."empNumber" = 'E008'
UNION ALL
SELECT 1, ea.id, 'annual', CURRENT_DATE + 30, CURRENT_DATE + 40, 10, 'approved', 'إجازة صيفية'
FROM employee_assignments ea JOIN employees e ON ea."employeeId" = e.id WHERE e."empNumber" = 'E012'
UNION ALL
SELECT 1, ea.id, 'emergency', CURRENT_DATE - 1, CURRENT_DATE, 1, 'pending', 'ظرف طارئ'
FROM employee_assignments ea JOIN employees e ON ea."employeeId" = e.id WHERE e."empNumber" = 'E015'
ON CONFLICT DO NOTHING;

-- Additional Warehouse Products (already have 9)
INSERT INTO warehouse_products ("companyId", sku, name, category, unit, quantity, "minQuantity", price, status) VALUES
  (1, 'WH-010', 'طابعة ليزر HP', 'electronics', 'unit', 5, 2, 2500, 'active'),
  (1, 'WH-011', 'شاشة كمبيوتر 27 بوصة', 'electronics', 'unit', 8, 3, 1800, 'active'),
  (1, 'WH-012', 'كرسي مكتبي دوار', 'furniture', 'unit', 15, 5, 950, 'active'),
  (1, 'WH-013', 'ورق تصوير A4', 'supplies', 'box', 50, 20, 45, 'active'),
  (1, 'WH-014', 'حبر طابعة أسود', 'supplies', 'unit', 12, 5, 280, 'low_stock'),
  (1, 'WH-015', 'لابتوب Dell Latitude', 'electronics', 'unit', 3, 2, 4500, 'active')
ON CONFLICT DO NOTHING;

-- Additional CRM Opportunities (already have 4)
INSERT INTO crm_opportunities ("companyId", "clientId", title, value, stage, probability, "expectedCloseDate", status) VALUES
  (1, 5, 'مشروع رقمنة الأرشيف', 350000, 'تفاوض', 60, CURRENT_DATE + 45, 'active'),
  (1, 7, 'عقد صيانة سنوي شامل', 180000, 'تقديم عرض', 30, CURRENT_DATE + 60, 'active'),
  (1, 8, 'تطوير بوابة إلكترونية', 420000, 'تأهيل مبدئي', 10, CURRENT_DATE + 90, 'active'),
  (1, 3, 'ترقية البنية التحتية', 275000, 'إغلاق ناجح', 100, CURRENT_DATE - 10, 'won')
ON CONFLICT DO NOTHING;

-- Additional Legal Contracts
INSERT INTO legal_contracts ("companyId", title, "partyName", "contractType", value, "startDate", "endDate", status) VALUES
  (1, 'عقد تأجير مستودع', 'شركة الأمان للعقارات', 'lease', 120000, '2026-01-01', '2026-12-31', 'active'),
  (1, 'عقد توريد معدات', 'مؤسسة التقنية المتقدمة', 'supply', 85000, '2026-03-01', '2026-09-30', 'active'),
  (1, 'اتفاقية شراكة استراتيجية', 'مجموعة النخبة القابضة', 'partnership', 500000, '2026-01-01', '2027-12-31', 'active'),
  (1, 'عقد صيانة سنوي', 'شركة الصيانة الشاملة', 'service', 45000, '2025-06-01', '2026-05-31', 'expired')
ON CONFLICT DO NOTHING;

-- Additional Property Units
INSERT INTO property_units ("companyId", name, type, area, "monthlyRent", status, location) VALUES
  (1, 'مكتب 401', 'office', 120, 8000, 'available', 'المبنى الرئيسي - الطابق الرابع'),
  (1, 'مكتب 402', 'office', 85, 5500, 'rented', 'المبنى الرئيسي - الطابق الرابع'),
  (1, 'مستودع C', 'warehouse', 500, 15000, 'available', 'المنطقة الصناعية'),
  (1, 'شقة 201', 'residential', 150, 4000, 'rented', 'مبنى السكن - الطابق الثاني'),
  (1, 'محل 5', 'commercial', 60, 12000, 'maintenance', 'المركز التجاري')
ON CONFLICT DO NOTHING;
