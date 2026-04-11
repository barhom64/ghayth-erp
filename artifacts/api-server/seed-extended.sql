-- Extended seed data for all empty tables — corrected column names
-- Company=1, Branch=1

-- CRM Pipeline Stages
INSERT INTO crm_pipeline_stages ("companyId", name, "order", color, probability) VALUES
  (1, 'تأهيل مبدئي', 1, '#3B82F6', 10),
  (1, 'تقديم عرض', 2, '#F59E0B', 30),
  (1, 'تفاوض', 3, '#8B5CF6', 60),
  (1, 'إغلاق ناجح', 4, '#22C55E', 100),
  (1, 'مفقودة', 5, '#EF4444', 0)
ON CONFLICT DO NOTHING;

-- CRM Contacts
INSERT INTO crm_contacts ("companyId", "opportunityId", name, email, phone, title, "isPrimary") VALUES
  (1, 3, 'فهد العتيبي', 'fahd@client.sa', '0501234567', 'مدير المشتريات', true),
  (1, 4, 'هند السعيد', 'hind@client.sa', '0559876543', 'مديرة العمليات', true),
  (1, 5, 'سلطان القحطاني', 'sultan@client.sa', '0541112233', 'المدير العام', false)
ON CONFLICT DO NOTHING;

-- CRM Activities
INSERT INTO crm_activities ("opportunityId", type, description, "scheduledAt") VALUES
  (3, 'call', 'متابعة هاتفية مع مدير المشتريات', CURRENT_DATE + 2),
  (4, 'meeting', 'اجتماع تقديم العرض الفني', CURRENT_DATE + 5),
  (5, 'email', 'إرسال عرض أسعار محدث', CURRENT_DATE + 1)
ON CONFLICT DO NOTHING;

-- Budgets (accountCode and period are NOT NULL)
INSERT INTO budgets ("companyId", "accountCode", period, "fiscalYear", name, "totalAmount", used, status, "startDate", "endDate") VALUES
  (1, 'OP-2026', '2026', 2026, 'ميزانية التشغيل 2026', 5000000, 1200000, 'active', '2026-01-01', '2026-12-31'),
  (1, 'PJ-2026', '2026', 2026, 'ميزانية المشاريع 2026', 3000000, 800000, 'active', '2026-01-01', '2026-12-31')
ON CONFLICT DO NOTHING;

-- Budget Lines (month is integer, budgetId via subquery)
INSERT INTO budget_lines ("budgetId", "accountId", category, amount, "spentAmount", month)
SELECT b.id, 1, 'رواتب الموظفين', 2000000, 500000, 1 FROM budgets b WHERE b."accountCode" = 'OP-2026' LIMIT 1
UNION ALL
SELECT b.id, 2, 'إيجارات المكاتب', 500000, 120000, 1 FROM budgets b WHERE b."accountCode" = 'OP-2026' LIMIT 1
UNION ALL
SELECT b.id, 3, 'مصاريف تشغيلية', 1000000, 300000, 2 FROM budgets b WHERE b."accountCode" = 'OP-2026' LIMIT 1
UNION ALL
SELECT b.id, 1, 'تكاليف مشاريع', 2000000, 600000, 1 FROM budgets b WHERE b."accountCode" = 'PJ-2026' LIMIT 1
UNION ALL
SELECT b.id, 3, 'مواد ولوازم', 500000, 100000, 2 FROM budgets b WHERE b."accountCode" = 'PJ-2026' LIMIT 1
ON CONFLICT DO NOTHING;

-- Performance Reviews
INSERT INTO performance_reviews ("companyId", "employeeId", "reviewerId", period, "overallScore", comments, status, "reviewDate") VALUES
  (1, 1, 1, '2026-Q1', 4.5, 'أداء ممتاز في إدارة الفريق وتحقيق الأهداف', 'completed', '2026-03-30'),
  (1, 10, 1, '2026-Q1', 3.8, 'جيد مع فرص للتحسين في التقارير الدورية', 'completed', '2026-03-30'),
  (1, 11, 1, '2026-Q1', 4.2, 'التزام عالٍ وإنجاز مميز في المشاريع', 'completed', '2026-03-28')
ON CONFLICT DO NOTHING;

-- Employee Violations
INSERT INTO employee_violations ("companyId", "assignmentId", type, description, severity, deduction, period) VALUES
  (1, 2, 'late_arrival', 'تأخر 15 دقيقة عن وقت البداية', 'low', 50, '2026-03'),
  (1, 10, 'absence', 'غياب بدون إذن ليوم واحد', 'medium', 200, '2026-03')
ON CONFLICT DO NOTHING;

-- Salary Components
INSERT INTO salary_components ("companyId", name, type, "calculationType", value, "isTaxable", "isGosi", "isActive", "order") VALUES
  (1, 'الراتب الأساسي', 'earning', 'fixed', 5000, true, true, true, 1),
  (1, 'بدل سكن', 'earning', 'fixed', 1500, false, false, true, 2),
  (1, 'بدل نقل', 'earning', 'fixed', 800, false, false, true, 3),
  (1, 'بدل طعام', 'earning', 'fixed', 500, false, false, true, 4),
  (1, 'التأمينات الاجتماعية', 'deduction', 'percentage', 9.75, false, true, true, 5)
ON CONFLICT DO NOTHING;

-- Invoice Lines
INSERT INTO invoice_lines ("invoiceId", description, quantity, "unitPrice", "lineTotal") VALUES
  (2, 'خدمات استشارية', 10, 500, 5000),
  (2, 'دراسة جدوى', 1, 15000, 15000),
  (3, 'صيانة شبكات', 5, 2000, 10000),
  (4, 'تصميم داخلي', 3, 8000, 24000)
ON CONFLICT DO NOTHING;

-- Deduction Rules
INSERT INTO deduction_rules ("companyId", name, type, "calculationType", value, "graceMinutes", "isActive") VALUES
  (1, 'تأخر أقل من 15 دقيقة', 'late', 'fixed', 50, 5, true),
  (1, 'تأخر 15-30 دقيقة', 'late', 'fixed', 100, 15, true),
  (1, 'تأخر أكثر من 30 دقيقة', 'late', 'percentage', 0.5, 30, true),
  (1, 'غياب بدون عذر', 'absence', 'fixed', 300, 0, true)
ON CONFLICT DO NOTHING;

-- Property Buildings
INSERT INTO property_buildings ("companyId", name, address, city, type, "totalUnits", "occupiedUnits", status, "yearBuilt") VALUES
  (1, 'برج الدور التجاري', 'شارع الملك فهد', 'الرياض', 'commercial', 24, 18, 'active', 2020),
  (1, 'مجمع الدور السكني', 'حي النرجس', 'الرياض', 'residential', 16, 12, 'active', 2022),
  (1, 'مكاتب الدور الإدارية', 'شارع العليا', 'الرياض', 'office', 12, 9, 'active', 2019)
ON CONFLICT DO NOTHING;

-- Rental Contracts
INSERT INTO rental_contracts ("companyId", "unitId", "tenantName", "startDate", "endDate", "monthlyRent", status) VALUES
  (1, 3, 'شركة النماء للتقنية', '2026-01-01', '2026-12-31', 15000, 'active'),
  (1, 4, 'مؤسسة الريادة', '2025-06-01', '2026-05-31', 8000, 'active'),
  (1, 5, 'مكتب الخبراء الاستشاريين', '2026-03-01', '2027-02-28', 12000, 'active')
ON CONFLICT DO NOTHING;

-- Rent Payments
INSERT INTO rent_payments ("contractId", "dueDate", amount, "paidAmount", status) VALUES
  (1, '2026-01-05', 15000, 15000, 'paid'),
  (1, '2026-02-05', 15000, 15000, 'paid'),
  (1, '2026-03-05', 15000, 15000, 'paid'),
  (2, '2026-01-10', 8000, 8000, 'paid'),
  (2, '2026-02-10', 8000, 8000, 'paid')
ON CONFLICT DO NOTHING;

-- Legal Contracts
INSERT INTO legal_contracts ("companyId", title, "contractType", "partyName", "startDate", "endDate", value, status) VALUES
  (1, 'عقد صيانة المباني', 'maintenance', 'شركة الصيانة المتكاملة', '2026-01-01', '2026-12-31', 120000, 'active'),
  (1, 'عقد توريد مواد بناء', 'supply', 'مؤسسة التوريدات العامة', '2026-02-01', '2026-07-31', 350000, 'active'),
  (1, 'عقد خدمات تقنية', 'service', 'شركة حلول رقمية', '2025-06-01', '2026-05-31', 180000, 'active')
ON CONFLICT DO NOTHING;

-- Legal Sessions
INSERT INTO legal_sessions ("caseId", "sessionDate", location, notes) VALUES
  (2, '2026-04-15', 'المحكمة التجارية - الرياض', 'جلسة استماع أولى — تقديم الدعوى'),
  (2, '2026-05-20', 'المحكمة التجارية - الرياض', 'تقديم المستندات والأدلة')
ON CONFLICT DO NOTHING;

-- Document Folders
INSERT INTO document_folders ("companyId", name, "parentId") VALUES
  (1, 'العقود والاتفاقيات', NULL),
  (1, 'الموارد البشرية', NULL),
  (1, 'التقارير المالية', NULL),
  (1, 'وثائق المشاريع', NULL)
ON CONFLICT DO NOTHING;

-- Document Templates
INSERT INTO document_templates (name, description, content, category, "isActive", "companyId") VALUES
  ('عقد عمل', 'قالب عقد عمل للموظفين الجدد', 'بسم الله الرحمن الرحيم — عقد عمل بين {{company}} و {{employee}}...', 'hr', true, 1),
  ('خطاب تعريف', 'قالب خطاب تعريف بالراتب', 'إلى من يهمه الأمر — نشهد أن {{employee}} يعمل لدينا...', 'hr', true, 1),
  ('عرض سعر', 'قالب عرض أسعار للعملاء', 'عرض سعر رقم {{ref}} — العميل: {{client}}...', 'sales', true, 1),
  ('محضر اجتماع', 'قالب محضر اجتماع', 'محضر اجتماع بتاريخ {{date}} — الحضور: {{attendees}}...', 'general', true, 1)
ON CONFLICT DO NOTHING;

-- Request Types
INSERT INTO request_types (name, description, category, "isActive", "companyId") VALUES
  ('طلب إجازة', 'طلب إجازة سنوية أو مرضية', 'hr', true, 1),
  ('طلب سلفة', 'طلب سلفة على الراتب', 'finance', true, 1),
  ('طلب شراء', 'طلب شراء مواد أو معدات', 'procurement', true, 1),
  ('طلب صيانة', 'طلب صيانة مكتبية أو فنية', 'operations', true, 1),
  ('طلب خطاب رسمي', 'طلب إصدار خطاب تعريف أو شهادة', 'hr', true, 1)
ON CONFLICT DO NOTHING;

-- Workflows
INSERT INTO workflows ("companyId", name, description, steps) VALUES
  (1, 'موافقة الإجازات', 'سير عمل الموافقة على طلبات الإجازة', '["مدير مباشر","موارد بشرية"]'),
  (1, 'موافقة المشتريات', 'سير عمل الموافقة على طلبات الشراء', '["مدير القسم","المالية","المدير العام"]'),
  (1, 'موافقة السلف', 'سير عمل الموافقة على السلف المالية', '["مدير مباشر","المالية"]')
ON CONFLICT DO NOTHING;

-- Project Phases
INSERT INTO project_phases ("projectId", name, "orderIndex", "startDate", "endDate", status, progress) VALUES
  (2, 'التخطيط والتصميم', 1, '2026-01-01', '2026-02-28', 'completed', 100),
  (2, 'التنفيذ', 2, '2026-03-01', '2026-06-30', 'in_progress', 45),
  (2, 'الاختبار والتسليم', 3, '2026-07-01', '2026-08-31', 'pending', 0),
  (3, 'المرحلة الأولى', 1, '2026-01-15', '2026-04-15', 'in_progress', 60),
  (3, 'المرحلة الثانية', 2, '2026-04-16', '2026-07-31', 'pending', 0)
ON CONFLICT DO NOTHING;

-- Project Tasks
INSERT INTO project_tasks ("projectId", title, description, "assigneeId", status, priority, "dueDate") VALUES
  (2, 'تصميم واجهة المستخدم', 'تصميم UI/UX للنظام الجديد', 1, 'completed', 'high', '2026-02-15'),
  (2, 'تطوير الخادم الخلفي', 'بناء API والربط مع قاعدة البيانات', 10, 'in_progress', 'high', '2026-05-30'),
  (2, 'اختبارات الجودة', 'تنفيذ اختبارات شاملة', 11, 'pending', 'medium', '2026-07-15'),
  (3, 'دراسة الموقع', 'زيارة ميدانية ودراسة الموقع', 1, 'completed', 'high', '2026-02-01'),
  (3, 'إعداد المخططات', 'تجهيز المخططات الهندسية', 12, 'in_progress', 'high', '2026-04-01')
ON CONFLICT DO NOTHING;

-- Tasks (standalone)
INSERT INTO tasks ("companyId", title, description, "assignedTo", priority, status, "scheduledDate", type) VALUES
  (1, 'تحديث سياسة الإجازات', 'مراجعة وتحديث سياسة الإجازات للعام الجديد', 1, 'medium', 'pending', '2026-04-15', 'internal'),
  (1, 'صيانة السيرفرات', 'صيانة دورية للسيرفرات الرئيسية', 10, 'high', 'in_progress', '2026-04-10', 'internal'),
  (1, 'إعداد التقرير الربعي', 'تجهيز التقرير المالي للربع الأول', 1, 'high', 'pending', '2026-04-20', 'internal'),
  (1, 'تجديد عقود الإيجار', 'مراجعة وتجديد عقود الإيجار المنتهية', 11, 'medium', 'pending', '2026-05-01', 'internal')
ON CONFLICT DO NOTHING;

-- Ticket Replies (authorId, authorName, message)
INSERT INTO ticket_replies ("ticketId", "authorId", "authorName", message) VALUES
  (3, 1, 'المدير', 'شكراً لتواصلك، سنعمل على حل المشكلة في أقرب وقت'),
  (3, 1, 'المدير', 'تم حل المشكلة، يرجى التأكد من ناحيتك'),
  (4, 1, 'المدير', 'نحتاج معلومات إضافية لمعالجة طلبك'),
  (5, 1, 'المدير', 'تم استلام الطلب وجاري العمل عليه')
ON CONFLICT DO NOTHING;

-- Suppliers
INSERT INTO suppliers ("companyId", name, "contactPerson", phone, email, address) VALUES
  (1, 'شركة التوريدات السعودية', 'خالد المطيري', '0112345678', 'info@supply.sa', 'الرياض - حي العليا'),
  (1, 'مؤسسة الأمل للتقنية', 'نورة الشمري', '0119876543', 'info@amal-tech.sa', 'الرياض - حي الملقا'),
  (1, 'شركة النظافة المتكاملة', 'سعد الحربي', '0114567890', 'info@clean.sa', 'الرياض - حي السليمانية')
ON CONFLICT DO NOTHING;

-- Purchase Requests (requestedBy not requesterId, title not department)
INSERT INTO purchase_requests ("companyId", "requestedBy", title, priority, "totalAmount", status, "requiredDate") VALUES
  (1, 1, 'شراء 10 أجهزة حاسب محمول', 'high', 75000, 'pending', '2026-04-20'),
  (1, 1, 'أثاث مكتبي لقاعة الاجتماعات', 'medium', 25000, 'approved', '2026-05-01'),
  (1, 10, 'قطع غيار لنظام التكييف', 'low', 15000, 'pending', '2026-05-15')
ON CONFLICT DO NOTHING;

-- Purchase Request Items (requestId via subquery)
INSERT INTO purchase_request_items ("requestId", "productId", name, quantity, "unitPrice", "totalPrice")
SELECT pr.id, 2, 'حاسب محمول Dell Latitude', 10, 7500, 75000 FROM purchase_requests pr WHERE pr.title = 'شراء 10 أجهزة حاسب محمول' LIMIT 1
UNION ALL
SELECT pr.id, NULL, 'طاولة اجتماعات كبيرة', 1, 15000, 15000 FROM purchase_requests pr WHERE pr.title = 'أثاث مكتبي لقاعة الاجتماعات' LIMIT 1
UNION ALL
SELECT pr.id, NULL, 'كراسي مكتبية', 20, 500, 10000 FROM purchase_requests pr WHERE pr.title = 'أثاث مكتبي لقاعة الاجتماعات' LIMIT 1
UNION ALL
SELECT pr.id, NULL, 'فلتر تكييف مركزي', 5, 3000, 15000 FROM purchase_requests pr WHERE pr.title = 'قطع غيار لنظام التكييف' LIMIT 1
ON CONFLICT DO NOTHING;

-- Warehouse Categories
INSERT INTO warehouse_categories ("companyId", name) VALUES
  (1, 'إلكترونيات'),
  (1, 'أثاث مكتبي'),
  (1, 'مواد مكتبية'),
  (1, 'قطع غيار')
ON CONFLICT DO NOTHING;

-- Governance Audits
INSERT INTO governance_audits ("companyId", title, "auditorName", scope, "startDate", "endDate", status, findings) VALUES
  (1, 'تدقيق مالي ربع سنوي', 'مكتب المحاسبين المعتمدين', 'المالية', '2026-03-01', '2026-03-15', 'completed', 'لا توجد ملاحظات جوهرية'),
  (1, 'تدقيق الموارد البشرية', 'فريق التدقيق الداخلي', 'الموارد البشرية', '2026-04-01', '2026-04-15', 'in_progress', NULL)
ON CONFLICT DO NOTHING;

-- Governance Compliance
INSERT INTO governance_compliance (regulation, description, status, "dueDate", "responsiblePerson", "companyId") VALUES
  ('نظام العمل السعودي', 'الامتثال لنظام العمل والعمال', 'compliant', '2026-06-30', 'إدارة الموارد البشرية', 1),
  ('هيئة الزكاة والضريبة', 'الامتثال الضريبي - VAT', 'compliant', '2026-04-30', 'الإدارة المالية', 1),
  ('نظام حماية البيانات الشخصية', 'حماية البيانات والخصوصية', 'in_progress', '2026-09-30', 'إدارة تقنية المعلومات', 1)
ON CONFLICT DO NOTHING;

-- Training Enrollments
INSERT INTO training_enrollments ("programId", "employeeId", "employeeName", status) VALUES
  (2, 1, 'النظام المسؤول', 'enrolled'),
  (2, 10, 'أحمد الشمري', 'enrolled'),
  (2, 11, 'فاطمة الحربي', 'completed')
ON CONFLICT DO NOTHING;

-- Job Applications
INSERT INTO job_applications ("postingId", "applicantName", email, phone, "resumeUrl", status) VALUES
  (2, 'محمد الشهري', 'mshahri@gmail.com', '0501112233', '/uploads/cv_mshahri.pdf', 'screening'),
  (2, 'سارة الزهراني', 'sarah.z@gmail.com', '0559998877', '/uploads/cv_sarah.pdf', 'interview'),
  (2, 'عبدالله الدوسري', 'adosari@gmail.com', '0544433221', '/uploads/cv_adosari.pdf', 'submitted')
ON CONFLICT DO NOTHING;

-- Smart Alerts
INSERT INTO smart_alerts ("companyId", type, severity, title, description, "relatedType", "relatedId", "isRead") VALUES
  (1, 'finance', 'high', 'فاتورة متأخرة', 'فاتورة رقم INV-003 متأخرة 15 يوم عن تاريخ الاستحقاق', 'invoice', 4, false),
  (1, 'fleet', 'medium', 'صيانة مركبة قريبة', 'مركبة رقم ABC-1234 تحتاج صيانة خلال 500 كم', 'vehicle', 1, false),
  (1, 'hr', 'medium', 'انتهاء عقد موظف', 'عقد الموظف أحمد الشمري ينتهي خلال 30 يوم', 'employee', 10, false),
  (1, 'property', 'high', 'إيجار متأخر', 'لم يتم استلام إيجار الوحدة 5 لشهر مارس', 'unit', 5, false)
ON CONFLICT DO NOTHING;

-- Technicians
INSERT INTO technicians ("companyId", name, speciality, phone, status) VALUES
  (1, 'عبدالرحمن المالكي', 'تكييف وتبريد', '0501234567', 'available'),
  (1, 'ياسر الحمدان', 'كهرباء', '0559876543', 'available'),
  (1, 'فيصل العنزي', 'سباكة', '0541112233', 'busy')
ON CONFLICT DO NOTHING;

-- Expense Claims
INSERT INTO expense_claims ("companyId", "employeeId", title, amount, category, status, "expenseDate") VALUES
  (1, 1, 'مصاريف سفر - اجتماع جدة', 3500, 'travel', 'approved', '2026-03-20'),
  (1, 10, 'شراء لوازم مكتبية', 850, 'office_supplies', 'pending', '2026-04-01'),
  (1, 11, 'وجبات عمل مع عميل', 1200, 'meals', 'approved', '2026-03-15')
ON CONFLICT DO NOTHING;

-- Roles (isSystem boolean, permissions jsonb)
INSERT INTO roles (name, description, permissions, "isSystem") VALUES
  ('مدير عام', 'صلاحيات كاملة على النظام', '{"all": true}'::jsonb, false),
  ('مدير فرع', 'إدارة فرع محدد', '{"branch": true}'::jsonb, false),
  ('محاسب', 'الوصول للوحدات المالية', '{"finance": true}'::jsonb, false),
  ('موظف', 'صلاحيات أساسية فقط', '{"basic": true}'::jsonb, false)
ON CONFLICT DO NOTHING;

-- Fixed Assets
INSERT INTO fixed_assets ("companyId", name, category, "purchaseDate", "purchasePrice", "currentValue", location, status, "serialNumber") VALUES
  (1, 'خادم رئيسي Dell PowerEdge', 'تقنية', '2024-06-15', 45000, 35000, 'غرفة السيرفرات', 'active', 'SVR-2024-001'),
  (1, 'سيارة تويوتا كامري 2024', 'مركبات', '2024-01-10', 120000, 95000, 'موقف الشركة', 'active', 'CAR-2024-001'),
  (1, 'أثاث مكتبي - طابق 3', 'أثاث', '2023-03-20', 35000, 28000, 'الطابق الثالث', 'active', 'FRN-2023-001')
ON CONFLICT DO NOTHING;

-- Stock Transfers (fromBranchId/toBranchId, status: pending/in_transit/received/cancelled)
INSERT INTO stock_transfers ("companyId", ref, "fromBranchId", "toBranchId", "requestedBy", status, notes) VALUES
  (1, 'ST-001', 1, 1, 1, 'received', 'تحويل مواد للفرع الجنوبي')
ON CONFLICT DO NOTHING;

-- Stock Transfer Items (transferId via subquery)
INSERT INTO stock_transfer_items ("transferId", "productId", "requestedQty", "sentQty")
SELECT st.id, 2, 5, 5 FROM stock_transfers st WHERE st.ref = 'ST-001' LIMIT 1
UNION ALL
SELECT st.id, 3, 10, 10 FROM stock_transfers st WHERE st.ref = 'ST-001' LIMIT 1
ON CONFLICT DO NOTHING;

-- Purchase Orders (requestId via subquery)
INSERT INTO purchase_orders ("companyId", "supplierId", "requestId", status, "totalAmount", "expectedDelivery")
SELECT 1, 1, pr.id, 'delivered', 25000, '2026-03-15'::date FROM purchase_requests pr WHERE pr.title = 'أثاث مكتبي لقاعة الاجتماعات' LIMIT 1
UNION ALL
SELECT 1, 2, pr.id, 'ordered', 75000, '2026-04-10'::date FROM purchase_requests pr WHERE pr.title = 'شراء 10 أجهزة حاسب محمول' LIMIT 1
ON CONFLICT DO NOTHING;

-- Loan Accounts (requires assignmentId)
INSERT INTO loan_accounts ("companyId", "assignmentId", "employeeId", amount, "remainingAmount", "monthlyInstallment", status, "startDate") VALUES
  (1, 1, 1, 10000, 5000, 2500, 'active', '2026-01-01'),
  (1, 2, 10, 20000, 12000, 3000, 'active', '2025-10-01')
ON CONFLICT DO NOTHING;

-- KPI Snapshots
INSERT INTO kpi_snapshots ("companyId", "employeeId", "snapshotDate", "metricName", "metricValue", "metricTarget") VALUES
  (1, 1, '2026-03-31', 'revenue', 1500000, 2000000),
  (1, 10, '2026-03-31', 'satisfaction', 85, 90),
  (1, 11, '2026-03-31', 'completion', 72, 80),
  (1, 12, '2026-03-31', 'retention', 94, 95)
ON CONFLICT DO NOTHING;

-- Fleet GPS Tracking
INSERT INTO fleet_gps_tracking ("vehicleId", "driverId", latitude, longitude, speed, heading, "recordedAt") VALUES
  (1, 1, 24.7136, 46.6753, 60, 180, NOW() - INTERVAL '1 hour'),
  (1, 1, 24.7200, 46.6800, 45, 90, NOW() - INTERVAL '30 minutes'),
  (2, 2, 24.6889, 46.7225, 80, 270, NOW() - INTERVAL '2 hours'),
  (3, 1, 21.4225, 39.8262, 0, 0, NOW() - INTERVAL '15 minutes')
ON CONFLICT DO NOTHING;

-- Fleet Violations (status: unpaid/paid/disputed)
INSERT INTO fleet_violations ("companyId", "vehicleId", "driverId", "violationType", description, "violationDate", location, amount, status) VALUES
  (1, 1, 1, 'speeding', 'تجاوز السرعة المحددة 120 كم/س', '2026-03-15', 'طريق الملك فهد', 500, 'unpaid'),
  (1, 2, 2, 'parking', 'وقوف في مكان ممنوع', '2026-03-20', 'حي العليا', 300, 'paid'),
  (1, 3, 1, 'red_light', 'قطع إشارة مرورية', '2026-02-28', 'تقاطع التخصصي', 900, 'unpaid')
ON CONFLICT DO NOTHING;

-- Invoice Collection Stages
INSERT INTO invoice_collection_stages ("companyId", "invoiceId", stage, "stageName", notes, "performedBy") VALUES
  (1, 2, 1, 'تذكير أول', 'تم إرسال تذكير بريدي', 1),
  (1, 3, 1, 'تذكير أول', 'تم الاتصال هاتفياً', 1),
  (1, 4, 1, 'تذكير أول', 'تم إرسال رسالة SMS', 1),
  (1, 4, 2, 'تذكير ثاني', 'إنذار رسمي', 1)
ON CONFLICT DO NOTHING;

-- Ticket Escalations
INSERT INTO ticket_escalations ("ticketId", "fromLevel", "toLevel", reason, "escalatedBy") VALUES
  (3, 1, 2, 'لم يتم حل المشكلة خلال 48 ساعة', 1),
  (5, 1, 2, 'أولوية عالية - عميل VIP', 1)
ON CONFLICT DO NOTHING;

-- Attendance Deductions
INSERT INTO attendance_deductions ("companyId", "assignmentId", type, minutes, amount, period, status) VALUES
  (1, 1, 'late', 15, 50, '2026-03', 'applied'),
  (1, 2, 'late', 30, 100, '2026-03', 'applied'),
  (1, 10, 'absence', 480, 300, '2026-03', 'applied')
ON CONFLICT DO NOTHING;

-- Leave Balances
INSERT INTO leave_balances ("companyId", "employeeId", "leaveTypeId", year, entitled, used, pending, carried) VALUES
  (1, 1, 1, 2026, 30, 5, 2, 3),
  (1, 10, 1, 2026, 21, 3, 0, 0),
  (1, 11, 1, 2026, 21, 7, 1, 2),
  (1, 12, 1, 2026, 21, 0, 0, 0),
  (1, 1, 2, 2026, 10, 2, 0, 0),
  (1, 10, 2, 2026, 10, 0, 0, 0)
ON CONFLICT DO NOTHING;

-- Employee Documents (status: valid/expired/expiring_soon)
INSERT INTO employee_documents ("companyId", "employeeId", type, name, number, "issueDate", "expiryDate", status) VALUES
  (1, 1, 'national_id', 'بطاقة الهوية الوطنية', '1012345678', '2020-01-15', '2030-01-15', 'valid'),
  (1, 10, 'national_id', 'بطاقة الهوية الوطنية', '1098765432', '2021-06-20', '2031-06-20', 'valid'),
  (1, 10, 'driving_license', 'رخصة قيادة', 'DL-12345', '2024-03-01', '2034-03-01', 'valid'),
  (1, 11, 'passport', 'جواز سفر', 'A1234567', '2023-09-10', '2033-09-10', 'valid'),
  (1, 12, 'iqama', 'إقامة', 'IQ-9876', '2025-01-01', '2026-06-30', 'expiring_soon')
ON CONFLICT DO NOTHING;

-- Warehouse Stock Batches
INSERT INTO warehouse_stock_batches ("productId", "batchNumber", quantity, "unitCost", "receivedDate") VALUES
  (2, 'BATCH-2026-001', 50, 150, '2026-01-15'),
  (3, 'BATCH-2026-002', 100, 75, '2026-02-01'),
  (4, 'BATCH-2026-003', 200, 25, '2026-03-01')
ON CONFLICT DO NOTHING;

-- Late Rent Actions
INSERT INTO late_rent_actions ("contractId", "paymentId", phase, action, notes) VALUES
  (1, 1, 1, 'تذكير SMS', 'تم إرسال تذكير أول بالسداد'),
  (2, 4, 1, 'اتصال هاتفي', 'تم التواصل مع المستأجر')
ON CONFLICT DO NOTHING;

-- Quality Checks (checkedBy is integer FK to employees)
INSERT INTO quality_checks ("companyId", "productId", "checkType", result, "checkedBy", "quantityChecked", "quantityPassed", "quantityFailed") VALUES
  (1, 2, 'incoming', 'passed', 1, 100, 98, 2),
  (1, 3, 'outgoing', 'passed', 1, 50, 50, 0)
ON CONFLICT DO NOTHING;

-- GPS coordinates for existing attendance records (for field tracking map)
UPDATE attendance SET "checkInLat" = 24.7136, "checkInLon" = 46.6753 WHERE id = (SELECT MIN(id) FROM attendance);
UPDATE attendance SET "checkInLat" = 24.6889, "checkInLon" = 46.7225 WHERE id = (SELECT MIN(id) + 1 FROM attendance);
UPDATE attendance SET "checkInLat" = 24.7400, "checkInLon" = 46.6600 WHERE id = (SELECT MAX(id) FROM attendance);

-- Onboarding steps in settings (scope-based schema)
INSERT INTO settings (scope, "scopeId", key, value) VALUES
  ('company', 1, 'hr.onboarding_steps', '["تسليم أجهزة IT","توقيع عقد العمل","تعريف المدير المباشر","دورة التعريف بالشركة","فتح حساب بنكي","تسجيل التأمينات الاجتماعية","استلام بطاقة الموظف","تدريب أنظمة الشركة"]'::jsonb)
ON CONFLICT DO NOTHING;
