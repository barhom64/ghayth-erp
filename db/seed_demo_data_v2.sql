-- ============================================================================
-- DEMO DATA SEED v2 — تَعبئة شامِلة لِبَقية جَداول الإنشاء
-- آمِن لإعادة التَشغيل (WHERE NOT EXISTS أَو COUNT-gate)
-- ============================================================================
-- BEGIN;

-- =========================================================
-- 1) العَقارات: عُقود + ضَمانات + مُعايَنات
-- =========================================================
INSERT INTO property_contracts ("companyId", "unitId", "tenantId", "contractNumber", "startDate", "endDate", "monthlyRent", status)
SELECT 1,
  (ARRAY[1,2,1,2,1])[g],
  (ARRAY[1,2,3,4,5])[g],
  'CTR-2026-' || LPAD(g::text,4,'0'),
  CURRENT_DATE - (180 + g*30),
  CURRENT_DATE + (180 + g*30),
  (3500 + g*1500)::numeric(14,2),
  CASE WHEN g<=3 THEN 'active' ELSE 'expired' END
FROM generate_series(1,5) g
WHERE (SELECT COUNT(*) FROM property_contracts WHERE "companyId"=1) < 3;

INSERT INTO property_security_deposits ("companyId", "contractId", amount, "receivedDate", status, notes)
SELECT 1, pc.id, (pc."monthlyRent" * 2)::numeric, pc."startDate", 'held', 'تأمين شهرين'
FROM property_contracts pc WHERE pc."companyId"=1
  AND NOT EXISTS (SELECT 1 FROM property_security_deposits psd WHERE psd."contractId"=pc.id);

INSERT INTO property_inspections ("companyId", "unitId", type, "scheduledDate", "inspectionDate", "inspectorName", "conditionRating", status, notes)
SELECT 1,
  ((g % 2) + 1),
  (ARRAY['move_in','move_out','periodic','maintenance'])[1+((g-1) % 4)],
  CURRENT_DATE - (90 - g*10),
  CURRENT_DATE - (88 - g*10),
  (ARRAY['م. خالد العامري','م. سعد الحربي','م. فهد الزهراني'])[1+((g-1)%3)],
  (3 + (g % 3)),
  CASE WHEN g<=8 THEN 'completed' ELSE 'scheduled' END,
  'فَحص دَوري'
FROM generate_series(1,10) g
WHERE (SELECT COUNT(*) FROM property_inspections WHERE "companyId"=1) < 5;

-- =========================================================
-- 2) المالية: مذكرات + سُلَف + دَفعات + كَفالات + بَنك
-- =========================================================
INSERT INTO credit_memos ("companyId", "branchId", "invoiceId", "clientId", amount, "netAmount", "vatAmount", reason, "memoDate", "createdBy")
SELECT 1, 1, inv.id, inv."clientId",
  500::numeric, 434.78::numeric, 65.22::numeric,
  'مَردود مَبيعات — جَودة',
  CURRENT_DATE - (g*7),
  1
FROM (SELECT id,"clientId" FROM invoices WHERE "companyId"=1 ORDER BY id LIMIT 8) inv
CROSS JOIN generate_series(1,1) g
WHERE NOT EXISTS (SELECT 1 FROM credit_memos WHERE "invoiceId"=inv.id);

INSERT INTO debit_memos ("companyId", "branchId", "invoiceId", "clientId", amount, "netAmount", "vatAmount", reason, "memoDate", "createdBy")
SELECT 1, 1, inv.id, inv."clientId",
  300::numeric, 260.87::numeric, 39.13::numeric,
  'إضافة لِزيادة الكَمية',
  CURRENT_DATE - (g*5),
  1
FROM (SELECT id,"clientId" FROM invoices WHERE "companyId"=1 ORDER BY id LIMIT 5) inv
CROSS JOIN generate_series(1,1) g
WHERE NOT EXISTS (SELECT 1 FROM debit_memos WHERE "invoiceId"=inv.id);

INSERT INTO customer_advances ("companyId", "branchId", "clientId", ref, amount, "appliedAmount", method, "receivedDate")
SELECT 1, 1, c.id,
  'ADV-2026-' || LPAD(c.id::text,4,'0'),
  (2000 + (random()*8000)::int)::numeric,
  ((random()*1000)::int)::numeric,
  (ARRAY['bank_transfer','cash','cheque'])[1+(random()*2)::int],
  CURRENT_DATE - (random()*60)::int
FROM (SELECT id FROM clients WHERE "companyId"=1 ORDER BY id LIMIT 10) c
WHERE NOT EXISTS (SELECT 1 FROM customer_advances WHERE "clientId"=c.id);

INSERT INTO invoice_payments ("invoiceId", "companyId", "clientId", amount, method, "transactionRef", "paidAt")
SELECT inv.id, 1, inv."clientId",
  (500 + (random()*3000)::int)::numeric,
  (ARRAY['bank_transfer','cash','cheque','pos','online'])[1+(random()*4)::int],
  'TXN-' || LPAD(inv.id::text,8,'0'),
  NOW() - (random()*60 || ' days')::interval
FROM (SELECT id,"clientId" FROM invoices WHERE "companyId"=1 ORDER BY id) inv
WHERE NOT EXISTS (SELECT 1 FROM invoice_payments WHERE "invoiceId"=inv.id);

INSERT INTO bank_guarantees ("companyId", "branchId", ref, bank, beneficiary, amount, "issueDate", "expiryDate", "guaranteeType", status, "createdBy")
SELECT 1, 1,
  'BG-2026-' || LPAD(g::text,4,'0'),
  (ARRAY['البنك الأهلي السعودي','بنك الرياض','البنك السعودي الفرنسي','مصرف الراجحي','البنك العربي الوطني'])[1+((g-1)%5)],
  (ARRAY['وزارة الإسكان','أمانة الرياض','شركة سابك','الهيئة السعودية للملكية الفكرية','وزارة الموارد البشرية'])[1+((g-1)%5)],
  (50000 + g*150000)::numeric,
  CURRENT_DATE - (g*30),
  CURRENT_DATE + (180 + g*30),
  (ARRAY['performance','bid','advance_payment','retention'])[1+((g-1)%4)],
  'active',
  1
FROM generate_series(1,8) g
WHERE NOT EXISTS (SELECT 1 FROM bank_guarantees WHERE ref='BG-2026-'||LPAD(g::text,4,'0'));

INSERT INTO bank_statements ("companyId", "branchId", "accountCode", "statementDate", reference, description, amount, type, "matchStatus")
SELECT 1, 1, '1110',
  CURRENT_DATE - g,
  'STMT-' || LPAD(g::text,6,'0'),
  CASE WHEN g%2=0 THEN 'إيداع — تَحويل بَنكي مِن عَميل' ELSE 'سَحب — دَفعة لِمورد' END,
  (CASE WHEN g%2=0 THEN 1 ELSE -1 END * (1000 + (random()*15000)::int))::numeric,
  CASE WHEN g%2=0 THEN 'credit' ELSE 'debit' END,
  CASE WHEN g<=15 THEN 'unmatched' ELSE 'matched' END
FROM generate_series(1,25) g
WHERE NOT EXISTS (SELECT 1 FROM bank_statements WHERE reference='STMT-'||LPAD(g::text,6,'0'));

-- ميزانية: خُطوط البِنود
INSERT INTO budget_lines ("budgetId", "accountId", category, amount, "spentAmount", month, notes)
SELECT b.id,
  (SELECT id FROM chart_of_accounts WHERE "companyId"=1 LIMIT 1 OFFSET ((g-1) % 20)),
  (ARRAY['الرواتب','الإيجارات','المرافق','التسويق','الصيانة','المواصلات','الاتصالات','المكتبية','الضيافة','التدريب'])[1+((g-1)%10)],
  (5000 + g*2500)::numeric,
  ((g*1500))::numeric,
  ((g % 12) + 1),
  'بَند تَخطيطي شَهري'
FROM (SELECT id FROM budgets WHERE "companyId"=1 ORDER BY id LIMIT 3) b
CROSS JOIN generate_series(1,8) g
WHERE NOT EXISTS (SELECT 1 FROM budget_lines WHERE "budgetId"=b.id AND month=((g%12)+1));

INSERT INTO fx_rates ("companyId", "rateDate", "fromCurrency", "toCurrency", rate, type, "effectiveDate", source)
SELECT 1, CURRENT_DATE - g, v.fc, 'SAR', v.r::numeric, 'spot', CURRENT_DATE - g, 'sama'
FROM generate_series(0,14) g,
LATERAL (VALUES ('USD',3.7500),('EUR',4.0300),('GBP',4.7100),('AED',1.0210),('KWD',12.2300)) v(fc,r)
WHERE NOT EXISTS (SELECT 1 FROM fx_rates WHERE "fromCurrency"=v.fc AND "rateDate"=CURRENT_DATE-g);

-- إهلاك الأصول الثابتة
INSERT INTO depreciation_entries ("assetId", "companyId", period, "depreciationAmount", "bookValueAfter", status)
SELECT fa.id, 1,
  TO_CHAR(CURRENT_DATE - (g||' months')::interval,'YYYY-MM'),
  (fa."purchaseCost" / GREATEST(fa."usefulLifeYears",1) / 12)::numeric,
  GREATEST(fa."currentBookValue" - (fa."purchaseCost" / GREATEST(fa."usefulLifeYears",1) / 12 * g),0)::numeric,
  'posted'
FROM (SELECT id,"purchaseCost","currentBookValue","usefulLifeYears" FROM fixed_assets WHERE "companyId"=1 LIMIT 8) fa
CROSS JOIN generate_series(1,3) g
WHERE NOT EXISTS (SELECT 1 FROM depreciation_entries WHERE "assetId"=fa.id AND period=TO_CHAR(CURRENT_DATE - (g||' months')::interval,'YYYY-MM'));

-- =========================================================
-- 3) المركبات: صِيانة + رِحلات + تَأمين + مُخالَفات + تَنبيهات
-- =========================================================
INSERT INTO fleet_maintenance ("companyId", "vehicleId", type, description, cost, "mileageAtService", "serviceDate", "nextServiceDate", "performedBy", status)
SELECT 1, v.id,
  (ARRAY['oil_change','tire_rotation','brake_service','general_inspection','battery'])[1+((g-1)%5)],
  (ARRAY['تَغيير زَيت ومُرشِّحات','تَدوير الإطارات','صِيانة الفَرامِل','فَحص شامِل دَوري','استبدال البَطارية'])[1+((g-1)%5)],
  (200 + (g*150))::numeric,
  (20000 + g*1000),
  CURRENT_DATE - (g*15),
  CURRENT_DATE + (90 - g*2),
  'مَركَز الصِيانة المُعتَمَد',
  'completed'
FROM (SELECT id FROM fleet_vehicles WHERE "companyId"=1 LIMIT 6) v
CROSS JOIN generate_series(1,3) g
WHERE (SELECT COUNT(*) FROM fleet_maintenance WHERE "companyId"=1) < 5;

INSERT INTO fleet_trips ("companyId", "vehicleId", "driverId", "clientId", "fromLocation", "toLocation", distance, "startTime", "endTime", status, cost)
SELECT 1, v.id, 1,
  ((g % 10) + 1),
  (ARRAY['الرياض - المكتب','جدة - الفرع','الدمام - المستودع','مكة - الفندق','المدينة - المشروع'])[1+((g-1)%5)],
  (ARRAY['المطار','مَوقِع العَميل','المستودع الرَئيسي','الميناء','المُلتَقى التِجاري'])[1+((g-1)%5)],
  (50 + g*30)::numeric,
  NOW() - ((g*3) || ' days')::interval,
  NOW() - ((g*3) || ' days')::interval + interval '4 hours',
  CASE WHEN g<=15 THEN 'completed' WHEN g<=18 THEN 'in_progress' ELSE 'scheduled' END,
  (150 + g*40)::numeric
FROM (SELECT id FROM fleet_vehicles WHERE "companyId"=1 LIMIT 6) v
CROSS JOIN generate_series(1,4) g
WHERE (SELECT COUNT(*) FROM fleet_trips WHERE "companyId"=1) < 5;

INSERT INTO fleet_insurance ("companyId", "vehicleId", "policyNumber", provider, type, "startDate", "endDate", premium, "coverageAmount", status)
SELECT 1, v.id,
  'INS-' || LPAD(v.id::text,6,'0'),
  (ARRAY['التعاونية','ميدغلف','تأمين الإنماء','بوبا','الراجحي تكافل'])[1+((v.id-1)%5)],
  'comprehensive',
  CURRENT_DATE - 100,
  CURRENT_DATE + 265,
  (3500 + v.id*500)::numeric,
  (150000 + v.id*30000)::numeric,
  'active'
FROM (SELECT id FROM fleet_vehicles WHERE "companyId"=1) v
WHERE NOT EXISTS (SELECT 1 FROM fleet_insurance WHERE "vehicleId"=v.id);

INSERT INTO fleet_traffic_violations ("companyId", "vehicleId", "driverId", "violationType", "violationDate", "fineAmount", status, location, "violationNumber")
SELECT 1, v.id, 1,
  (ARRAY['تجاوز السرعة','إشارة حمراء','وقوف خاطئ','عدم ربط حزام','مكالمة هاتفية'])[1+((g-1)%5)],
  CURRENT_DATE - (g*8),
  (150 + g*50)::numeric,
  CASE WHEN g<=5 THEN 'paid' ELSE 'pending' END,
  (ARRAY['طريق الملك فهد','طريق الأمير محمد بن عبدالعزيز','شارع التحلية','طريق العروبة'])[1+((g-1)%4)],
  'TV-' || LPAD(g::text,8,'0')
FROM (SELECT id FROM fleet_vehicles WHERE "companyId"=1 LIMIT 4) v
CROSS JOIN generate_series(1,2) g
WHERE (SELECT COUNT(*) FROM fleet_traffic_violations WHERE "companyId"=1) < 3;

INSERT INTO fleet_alerts ("companyId", type, severity, title, message, "relatedType", "relatedId", "daysLeft", status)
SELECT 1,
  v.type, v.sev, v.title, v.msg,
  'vehicle', ((g % 8) + 1), v.days, 'active'
FROM generate_series(1,12) g,
LATERAL (SELECT
  (ARRAY['insurance_expiry','registration_expiry','maintenance_due','inspection_due'])[1+((g-1)%4)] AS type,
  (ARRAY['warning','critical','info'])[1+((g-1)%3)] AS sev,
  (ARRAY['تَنبيه: قُرب انتِهاء التَأمين','تَنبيه: انتِهاء الاستِمارة','تَنبيه: مَوعِد الصِيانة','تَنبيه: مَوعِد الفَحص الدَوري'])[1+((g-1)%4)] AS title,
  (ARRAY['التَأمين يَنتَهي خِلال 30 يوم','الاستِمارة تَنتَهي قَريبًا','وَقت الصِيانة الدَورية','يَجِب الفَحص قَبل ' || (30+g) || ' يوم'])[1+((g-1)%4)] AS msg,
  (10 + g*5) AS days
) v
WHERE (SELECT COUNT(*) FROM fleet_alerts WHERE "companyId"=1) < 3;

-- =========================================================
-- 4) المُشتَريات: أَوامِر شِراء + استِلام
-- =========================================================
INSERT INTO purchase_orders ("companyId", "branchId", ref, "supplierId", status, "totalAmount", "expectedDelivery", "createdBy", currency)
SELECT 1, 1,
  'PO-2026-' || LPAD(g::text,5,'0'),
  s.id,
  (ARRAY['pending','approved','delivered','approved','pending'])[1+((g-1)%5)],
  (5000 + g*1500)::numeric,
  CURRENT_DATE + (g*7),
  1, 'SAR'
FROM (SELECT id FROM suppliers WHERE "companyId"=1 LIMIT 8) s
CROSS JOIN generate_series(1,2) g
WHERE NOT EXISTS (SELECT 1 FROM purchase_orders WHERE ref='PO-2026-' || LPAD((g + s.id*10)::text,5,'0'))
LIMIT 12;

INSERT INTO purchase_order_items ("orderId", "itemName", quantity)
SELECT po.id, v.name, v.qty::numeric
FROM (SELECT id FROM purchase_orders WHERE "companyId"=1 LIMIT 10) po
CROSS JOIN (VALUES
  ('أَوراق طِباعة A4', 50),
  ('أَقلام جاف', 100),
  ('حِبر طابِعة', 10),
  ('مَلَفات مَحفوظات', 25)
) v(name,qty)
WHERE NOT EXISTS (SELECT 1 FROM purchase_order_items WHERE "orderId"=po.id AND "itemName"=v.name);

INSERT INTO goods_receipts ("companyId", "branchId", "poId", ref, "receivedAt", "receivedBy", notes)
SELECT 1, 1, po.id,
  'GR-2026-' || LPAD(po.id::text,5,'0'),
  NOW() - (random()*30 || ' days')::interval,
  1,
  'استِلام كامِل لِأمر الشِراء'
FROM (SELECT id FROM purchase_orders WHERE "companyId"=1 AND status IN ('delivered','approved') LIMIT 5) po
WHERE NOT EXISTS (SELECT 1 FROM goods_receipts WHERE "poId"=po.id);

-- =========================================================
-- 5) المَشاريع: مَراحِل + مَهام + مَعالِم + تَكاليف + مَخاطِر
-- =========================================================
INSERT INTO project_phases ("projectId", name, "orderIndex", "startDate", "endDate", status, progress)
SELECT p.id,
  v.name, v.ord,
  CURRENT_DATE - (60 - v.ord*15),
  CURRENT_DATE + (v.ord*15),
  CASE WHEN v.ord<=2 THEN 'completed' WHEN v.ord=3 THEN 'in_progress' ELSE 'pending' END,
  CASE WHEN v.ord<=2 THEN 100 WHEN v.ord=3 THEN 60 ELSE 0 END
FROM (SELECT id FROM projects WHERE "companyId"=1 ORDER BY id LIMIT 5) p
CROSS JOIN (VALUES ('التَخطيط',1),('التَصميم',2),('التَنفيذ',3),('الاختِبار',4),('التَسليم',5)) v(name,ord)
WHERE NOT EXISTS (SELECT 1 FROM project_phases WHERE "projectId"=p.id AND name=v.name);

INSERT INTO project_milestones ("companyId", "projectId", name, title, description, "dueDate", "targetDate", status)
SELECT 1, p.id,
  v.name, v.name, v.dsc,
  CURRENT_DATE + (v.ord*20),
  CURRENT_DATE + (v.ord*20),
  CASE WHEN v.ord<=2 THEN 'completed' ELSE 'pending' END
FROM (SELECT id FROM projects WHERE "companyId"=1 ORDER BY id LIMIT 5) p
CROSS JOIN (VALUES
  ('اعتِماد الخُطة',1,'الحُصول على مُوافَقة الإدارة على الخُطة'),
  ('بَدء التَصميم',2,'بِداية أَعمال التَصميم الهَندَسي'),
  ('انتِهاء البُنية',3,'إكمال البُنية التَحتية لِلمَشروع'),
  ('التَسليم النِهائي',4,'تَسليم المَشروع لِلعَميل')
) v(name,ord,dsc)
WHERE NOT EXISTS (SELECT 1 FROM project_milestones WHERE "projectId"=p.id AND name=v.name);

INSERT INTO project_costs ("companyId", "projectId", category, description, amount, "costDate", "invoiceRef", "createdBy")
SELECT 1, p.id,
  (ARRAY['مواد','عمالة','معدات','نقل','إدارية'])[1+((g-1)%5)],
  'تَكلُفة ' || (ARRAY['مواد','عمالة','معدات','نقل','إدارية'])[1+((g-1)%5)],
  (3000 + g*1500)::numeric,
  CURRENT_DATE - (g*5),
  'INV-' || p.id || '-' || g,
  1
FROM (SELECT id FROM projects WHERE "companyId"=1 LIMIT 5) p
CROSS JOIN generate_series(1,4) g
WHERE NOT EXISTS (SELECT 1 FROM project_costs WHERE "projectId"=p.id AND category=(ARRAY['مواد','عمالة','معدات','نقل','إدارية'])[1+((g-1)%5)] AND "invoiceRef"='INV-' || p.id || '-' || g);

INSERT INTO project_risks ("companyId", "projectId", title, description, probability, impact, "riskLevel", "riskScore", "mitigationPlan", status)
SELECT 1, p.id,
  v.title, v.title, v.prob, v.imp, v.level, v.prob*v.imp,
  v.plan, 'open'
FROM (SELECT id FROM projects WHERE "companyId"=1 LIMIT 5) p
CROSS JOIN (VALUES
  ('تأخر التَوريد',4,4,'high','تَنويع المورّدين'),
  ('تَجاوُز المُوازَنة',3,5,'critical','مُراقَبة شَهرية صارِمة'),
  ('نَقص الكَوادِر',3,3,'medium','تَوسيع الفَريق'),
  ('تَغَيُّر اللَوائح',2,4,'medium','مُتابَعة قانونية')
) v(title,prob,imp,level,plan)
WHERE NOT EXISTS (SELECT 1 FROM project_risks WHERE "projectId"=p.id AND title=v.title);

INSERT INTO project_tasks ("projectId", title, description, "assigneeId", priority, status, "startDate", "dueDate", "estimatedHours", progress)
SELECT p.id,
  v.title, v.dsc, 1, v.pri, v.status,
  CURRENT_DATE - (v.ord*5), CURRENT_DATE + (v.ord*5),
  (v.ord*8)::numeric, v.prog
FROM (SELECT id FROM projects WHERE "companyId"=1 LIMIT 5) p
CROSS JOIN (VALUES
  ('جَمع المُتَطَلَّبات','مُقابَلة العَميل','high','done',1,100),
  ('إعداد التَصميم الأَوّلي','مُسَوَّدات أَوّلية','high','in_progress',2,60),
  ('تَطوير الواجِهات','بِناء الـ UI','medium','todo',3,0),
  ('اختِبار الجَودة','QA','medium','todo',4,0)
) v(title,dsc,pri,status,ord,prog)
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE "projectId"=p.id AND title=v.title);

-- =========================================================
-- 6) القانوني: قَضايا + جَلَسات + مُراسَلات + أَحكام
-- =========================================================
INSERT INTO legal_cases ("companyId", "caseNumber", title, "caseType", court, "filingDate", "opposingParty", "lawyerName", status, priority, "financialRisk", "riskLevel", description)
SELECT 1,
  'CASE-2026-' || LPAD(g::text,4,'0'),
  v.title, v.type, v.court,
  CURRENT_DATE - (g*30),
  v.opp, v.lawyer,
  v.status, v.pri, v.risk::numeric, v.rlevel,
  'تَفاصيل القَضية مَوضوعة في المُرفَقات'
FROM generate_series(1,6) g,
LATERAL (SELECT
  (ARRAY['نِزاع عَقد إيجار','مُطالَبة مالية','نِزاع تَجاري','شَكوى عُمّالية','مُخالَفة بَلَدية','نِزاع مُلكية'])[g] AS title,
  (ARRAY['عَقاري','تِجاري','تِجاري','عُمّالي','بَلَدي','مَدَني'])[g] AS type,
  (ARRAY['المَحكَمة العامة بِالرياض','المَحكَمة التِجارية','المَحكَمة التِجارية','المَحكَمة العُمّالية','المَحكَمة الإدارية','مَحكَمة الاستئناف'])[g] AS court,
  (ARRAY['شركة المَواد المُتَّحِدة','عَميل سابِق','مَكتب الإنشاءات','موَظَّف سابِق','أَمانة الرياض','جار العَقار'])[g] AS opp,
  (ARRAY['أ. مَشاري الفَهد','أ. سَعد العَتيبي','أ. مُحَمَّد القَحطاني','أ. عَبدالله الحَربي'])[1+((g-1)%4)] AS lawyer,
  (ARRAY['open','open','closed','open','open','pending'])[g] AS status,
  (ARRAY['high','medium','low','high','medium','low'])[g] AS pri,
  (ARRAY[150000,80000,250000,45000,30000,500000])[g] AS risk,
  (ARRAY['high','medium','low','high','medium','low'])[g] AS rlevel
) v
WHERE NOT EXISTS (SELECT 1 FROM legal_cases WHERE "caseNumber"='CASE-2026-' || LPAD(g::text,4,'0'));

INSERT INTO legal_sessions ("caseId", "sessionDate", location, judge, result, "nextSessionDate", notes)
SELECT lc.id,
  NOW() - (g*15 || ' days')::interval,
  (ARRAY['المَحكَمة العامة بِالرياض - قاعة 3','المَحكَمة التِجارية - قاعة 7','المَحكَمة العُمّالية - قاعة 1'])[1+((g-1)%3)],
  (ARRAY['القاضي د. سُلَيمان العَتيبي','القاضي د. خالد الزَهراني','القاضي د. فَهد القَحطاني'])[1+((g-1)%3)],
  (ARRAY['تأجيل لِتَقديم بَيِّنات','الاستِماع لِلشُهود','حَجز لِلحُكم','إحالة لِخَبير'])[1+((g-1)%4)],
  NOW() + (30 || ' days')::interval,
  'مُلاحَظات الجَلسة في المَلَف'
FROM (SELECT id FROM legal_cases WHERE "companyId"=1 LIMIT 6) lc
CROSS JOIN generate_series(1,2) g
WHERE NOT EXISTS (SELECT 1 FROM legal_sessions WHERE "caseId"=lc.id);

INSERT INTO legal_correspondence ("companyId", "caseId", direction, subject, parties, "documentRef", "correspondenceDate", "createdBy")
SELECT 1, lc.id,
  (ARRAY['incoming','outgoing'])[1+((g-1)%2)],
  (ARRAY['مُذَكِّرة دِفاع','رَد على دَعوى','طَلَب تَأجيل جَلسة','إرسال مُستَنَدات'])[1+((g-1)%4)],
  'الشَركة - الطَرَف المُقابِل',
  'DOC-' || lc.id || '-' || g,
  CURRENT_DATE - (g*10),
  1
FROM (SELECT id FROM legal_cases WHERE "companyId"=1) lc
CROSS JOIN generate_series(1,2) g
WHERE NOT EXISTS (SELECT 1 FROM legal_correspondence WHERE "caseId"=lc.id AND "documentRef"='DOC-' || lc.id || '-' || g);

INSERT INTO legal_judgments ("companyId", "caseId", "judgmentDate", "judgmentType", verdict, amount, "paidAmount", "dueDate", "createdBy")
SELECT 1, lc.id,
  CURRENT_DATE - 15,
  'partial',
  'حُكم جُزئي لِصالح الشَركة بِسَداد المَبلَغ خِلال 60 يوم',
  (15000 + lc.id*5000)::numeric,
  0,
  CURRENT_DATE + 45,
  1
FROM (SELECT id FROM legal_cases WHERE "companyId"=1 AND status IN ('closed','open') LIMIT 3) lc
WHERE NOT EXISTS (SELECT 1 FROM legal_judgments WHERE "caseId"=lc.id);

-- =========================================================
-- 7) الموارد البَشَرية: مَهام إضافية + مُخالَفات + خُروج + رَواتب
-- =========================================================
INSERT INTO job_titles (name, "nameEn", category, "companyId", "isActive")
SELECT v.name, v.en, v.cat, 1, true
FROM (VALUES
  ('مُدير عام','General Manager','executive'),
  ('مُدير مالي','Finance Manager','finance'),
  ('مُدير موارد بَشَرية','HR Manager','hr'),
  ('مُحاسِب','Accountant','finance'),
  ('مُهَندِس مَدَني','Civil Engineer','engineering'),
  ('مُهَندِس كَهرَباء','Electrical Engineer','engineering'),
  ('مُشرِف مَوقِع','Site Supervisor','operations'),
  ('سائِق','Driver','operations'),
  ('سِكرتير','Secretary','administrative'),
  ('مُمَثِّل مَبيعات','Sales Representative','sales'),
  ('مُستَشار قانوني','Legal Advisor','legal'),
  ('فَنّي صِيانة','Maintenance Technician','operations')
) v(name,en,cat)
WHERE NOT EXISTS (SELECT 1 FROM job_titles WHERE name=v.name);

INSERT INTO hr_overtime_requests ("companyId", "branchId", "assignmentId", "employeeId", "requestNumber", "overtimeDate", "startTime", "endTime", hours, "hourlyRate", multiplier, "totalAmount", reason, status)
SELECT 1, 1, 1, 1,
  'OT-2026-' || LPAD(g::text,5,'0'),
  CURRENT_DATE - (g*4),
  '17:00'::time,
  ('17:00'::time + (g||' hours')::interval)::time,
  (1+g)::numeric,
  50::numeric, 1.5,
  ((1+g)*50*1.5)::numeric,
  'مَهمة طارِئة - إغلاق شَهري',
  (ARRAY['approved','approved','pending','approved','approved'])[1+((g-1)%5)]
FROM generate_series(1,8) g
WHERE NOT EXISTS (SELECT 1 FROM hr_overtime_requests WHERE "requestNumber"='OT-2026-' || LPAD(g::text,5,'0'));

INSERT INTO hr_violations ("companyId", "employeeId", "assignmentId", "violationType", description, "incidentDate", status, severity, deduction, "createdBy")
SELECT 1, 1, 1,
  v.type, v.dsc, CURRENT_DATE - (g*7), v.status, v.sev, v.ded::numeric, 1
FROM generate_series(1,5) g,
LATERAL (SELECT
  (ARRAY['تأخر متكرر','غياب بدون عذر','مخالفة لائحة','إساءة استخدام معدات','تقصير في العمل'])[g] AS type,
  (ARRAY['تأخر 30 دَقيقة لِأكثَر مِن مَرة','غياب يوم كامل دون إشعار','عَدَم الالتِزام بِالزِي الرَسمي','استِخدام سَيارة الشَركة في غَير العَمَل','عَدَم تَسليم تَقرير'])[g] AS dsc,
  (ARRAY['confirmed','confirmed','pending','confirmed','pending'])[g] AS status,
  (ARRAY['minor','major','minor','major','minor'])[g] AS sev,
  (ARRAY[100,500,150,800,200])[g] AS ded
) v
WHERE (SELECT COUNT(*) FROM hr_violations WHERE "companyId"=1) < 3;

INSERT INTO hr_exit_requests ("companyId", "branchId", "assignmentId", "employeeId", "exitNumber", "exitType", "requestDate", "lastWorkingDay", "exitReason", status, "gratuityAmount", "leaveBalance")
SELECT 1, 1, 1, 1,
  'EXIT-2026-001',
  'resignation',
  CURRENT_DATE - 30,
  CURRENT_DATE + 30,
  'فُرصة عَمَل أُخرى',
  'pending', 25000::numeric, 12::numeric
WHERE NOT EXISTS (SELECT 1 FROM hr_exit_requests WHERE "exitNumber"='EXIT-2026-001');

INSERT INTO salary_history ("employeeId", "assignmentId", "companyId", "oldSalary", "newSalary", "effectiveDate", "changedBy")
SELECT 1, 1, 1,
  (8000 - g*500)::numeric,
  (8000 - g*500 + 500)::numeric,
  CURRENT_DATE - (g*365),
  1
FROM generate_series(1,4) g
WHERE NOT EXISTS (SELECT 1 FROM salary_history WHERE "effectiveDate"=CURRENT_DATE - (g*365));

INSERT INTO employee_documents ("companyId", "employeeId", type, name, number, "issueDate", "expiryDate", status, "uploadedBy")
SELECT 1, 1, v.type, v.name, v.num,
  CURRENT_DATE - 365,
  CURRENT_DATE + v.exp,
  CASE WHEN v.exp<30 THEN 'expiring_soon' ELSE 'valid' END, 1
FROM (VALUES
  ('iqama','هَوية مُقيم','2123456789',730),
  ('passport','جَواز سَفَر','A12345678',1825),
  ('driver_license','رُخصة قِيادة','DL987654',365),
  ('health_certificate','شَهادة صِحية','HC456789',180),
  ('insurance_card','بِطاقة تَأمين','INS-2026-1',15),
  ('contract','عَقد عَمَل','CON-2024-1',730),
  ('cv','السيرة الذاتية','CV-2024',9999)
) v(type,name,num,exp)
WHERE NOT EXISTS (SELECT 1 FROM employee_documents WHERE "employeeId"=1 AND type=v.type);

INSERT INTO employee_kpi_snapshots ("companyId", "employeeId", "snapshotDate", "kpiName", "kpiValue")
SELECT 1, 1,
  CURRENT_DATE - (g*30),
  v.name,
  v.val::numeric
FROM generate_series(0,5) g,
LATERAL (VALUES
  ('attendance_rate', 95.5),
  ('task_completion', 88.3),
  ('customer_satisfaction', 4.6),
  ('quality_score', 92.0)
) v(name,val)
WHERE NOT EXISTS (SELECT 1 FROM employee_kpi_snapshots WHERE "employeeId"=1 AND "kpiName"=v.name AND "snapshotDate"=CURRENT_DATE - (g*30));

INSERT INTO evaluation_cycles ("companyId", "employeeId", "initiatorId", period, "startDate", "endDate", status, notes)
SELECT 1, 1, 1,
  TO_CHAR(CURRENT_DATE - (g||' months')::interval, 'YYYY-Q'),
  CURRENT_DATE - ((g*90)::int),
  CURRENT_DATE - ((g*90-90)::int),
  CASE WHEN g=1 THEN 'open' ELSE 'closed' END,
  'تَقييم رُبع سَنَوي'
FROM generate_series(1,3) g
WHERE NOT EXISTS (SELECT 1 FROM evaluation_cycles WHERE period=TO_CHAR(CURRENT_DATE - (g||' months')::interval, 'YYYY-Q'));

-- =========================================================
-- 8) التَدريب
-- =========================================================
INSERT INTO trainings ("companyId", title, type, description, "startDate", "endDate", location, trainer, cost, status)
SELECT 1, v.title, v.type, v.dsc,
  CURRENT_DATE + v.start, CURRENT_DATE + v.endd,
  v.loc, v.trainer, v.cost::numeric, v.status
FROM (VALUES
  ('دَورة Excel المُتَقَدِّمة','technical','إتقان الدوال والجداول المحورية',-30,-28,'مَركَز التَدريب - الرياض','أ. أحمد المالكي',1500,'completed'),
  ('السَلامة المِهَنية','safety','تَدريب إجباري لِجَميع الموَظَّفين',-15,-14,'مَوقِع الشَركة','شركة السَلامة الذَهبية',800,'completed'),
  ('مَهارات التَواصُل','soft','تَطوير مَهارات العَرض والإقناع',10,11,'فُندُق ماريوت','د. سَعد القَحطاني',2200,'planned'),
  ('إدارة المَشاريع PMP','certification','إعداد لِشَهادة PMP',30,35,'أونلاين','PMI Saudi Chapter',5000,'planned'),
  ('الأَمن السيبراني','technical','حِماية البَيانات والشَبَكات',-60,-57,'مَركَز سيسكو','مَركَز الخِبرة',3500,'completed')
) v(title,type,dsc,start,endd,loc,trainer,cost,status)
WHERE NOT EXISTS (SELECT 1 FROM trainings WHERE title=v.title AND "companyId"=1);

INSERT INTO training_enrollments ("programId", "employeeId", "employeeName", status, score, "completedAt")
SELECT t.id, 1, 'مُدير النِظام',
  CASE WHEN t.status='completed' THEN 'completed' ELSE 'enrolled' END,
  CASE WHEN t.status='completed' THEN (75 + (random()*25)::int)::numeric ELSE NULL END,
  CASE WHEN t.status='completed' THEN NOW() - interval '20 days' ELSE NULL END
FROM trainings t WHERE t."companyId"=1
  AND NOT EXISTS (SELECT 1 FROM training_enrollments WHERE "programId"=t.id AND "employeeId"=1);

-- =========================================================
-- 9) الدَعم: رُدود + تَقييمات + SLA
-- =========================================================
INSERT INTO ticket_replies ("ticketId", "authorId", "authorName", message, "isInternal")
SELECT t.id, 1, 'مُدير النِظام',
  CASE WHEN g=1 THEN 'شُكرًا لِتَواصُلِكُم، نَعمَل على المُشكِلة حاليًا.'
       ELSE 'تَم حَل المُشكِلة، يُرجى التَأكيد.' END,
  false
FROM (SELECT id FROM support_tickets WHERE "companyId"=1 ORDER BY id LIMIT 15) t
CROSS JOIN generate_series(1,2) g
WHERE NOT EXISTS (SELECT 1 FROM ticket_replies WHERE "ticketId"=t.id);

INSERT INTO ticket_csat_ratings ("ticketId", "companyId", "assigneeId", score, comment)
SELECT t.id, 1, 1,
  (3 + (random()*2)::int),
  (ARRAY['خِدمة مُمتازة وسَريعة','تَم الحَل بِشَكل احتِرافي','يَحتاج تَحسين السُرعة','شُكرًا لِلفَريق','مُرضٍ جِدًا'])[1+(random()*4)::int]
FROM (SELECT id FROM support_tickets WHERE "companyId"=1 LIMIT 10) t
WHERE NOT EXISTS (SELECT 1 FROM ticket_csat_ratings WHERE "ticketId"=t.id);

INSERT INTO sla_definitions ("companyId", "requestType", "warningHours", "deadlineHours", "escalationHours", "escalateTo", "isActive")
SELECT 1, v.req, v.warn, v.dead, v.esc, v.dst, true
FROM (VALUES
  ('leave_request',12,24,48,'hr'),
  ('expense_claim',24,72,120,'finance'),
  ('overtime_request',8,24,48,'hr'),
  ('exit_request',48,168,240,'hr'),
  ('purchase_request',24,72,168,'finance'),
  ('support_ticket',2,8,24,'manager'),
  ('document_approval',12,48,96,'manager')
) v(req,warn,dead,esc,dst)
WHERE NOT EXISTS (SELECT 1 FROM sla_definitions WHERE "companyId"=1 AND "requestType"=v.req);

-- =========================================================
-- 10) CRM: أَنشِطة + جِهات اتِّصال
-- =========================================================
INSERT INTO crm_activities ("opportunityId", type, description, "scheduledAt", "completedAt", "createdBy")
SELECT op.id,
  v.type, v.dsc, NOW() + (g||' days')::interval,
  CASE WHEN g<=0 THEN NOW() ELSE NULL END, 1
FROM (SELECT id FROM crm_opportunities WHERE "companyId"=1 ORDER BY id LIMIT 15) op
CROSS JOIN generate_series(-2,2) g
LEFT JOIN LATERAL (SELECT
  (ARRAY['call','meeting','email','follow_up','demo'])[1+((g+3)%5)] AS type,
  (ARRAY['مُكالَمة مَتابَعة','اجتِماع تَقديمي','إرسال عَرض سِعر','مُتابَعة دَورية','عَرض تَوضيحي'])[1+((g+3)%5)] AS dsc
) v ON true
WHERE NOT EXISTS (SELECT 1 FROM crm_activities WHERE "opportunityId"=op.id);

-- =========================================================
-- 11) المُستَودَع: لُوط مَخزون + خُطَط جَرد
-- =========================================================
INSERT INTO warehouse_stock_lots ("companyId", "productId", "warehouseId", "lotNumber", quantity, "originalQuantity", "unitCost", "receivedDate", "expiryDate")
SELECT 1, p.id, 1,
  'LOT-' || LPAD(p.id::text,4,'0') || '-' || g,
  (50 + g*20)::numeric,
  (100 + g*20)::numeric,
  p."costPrice",
  CURRENT_DATE - (g*15),
  CURRENT_DATE + (180 + g*30)
FROM (SELECT id,"costPrice" FROM warehouse_products WHERE "companyId"=1 LIMIT 10) p
CROSS JOIN generate_series(1,2) g
WHERE EXISTS (SELECT 1 FROM warehouses WHERE id=1)
  AND NOT EXISTS (SELECT 1 FROM warehouse_stock_lots WHERE "lotNumber"='LOT-' || LPAD(p.id::text,4,'0') || '-' || g);

INSERT INTO warehouse_cycle_count_plans ("companyId", "warehouseId", period, "planType", "scheduledCount", "createdBy", notes)
SELECT 1, 1, TO_CHAR(CURRENT_DATE,'YYYY-MM'), 'abc', 50, 1, 'جَرد دَوري شَهري ABC'
WHERE EXISTS (SELECT 1 FROM warehouses WHERE id=1)
  AND NOT EXISTS (SELECT 1 FROM warehouse_cycle_count_plans WHERE "companyId"=1 AND period=TO_CHAR(CURRENT_DATE,'YYYY-MM'));

-- =========================================================
-- 12) المُستَنَدات والإدارة
-- =========================================================
INSERT INTO document_folders (name, "parentId", color, "companyId", description, "isActive")
SELECT v.name, NULL, v.color, 1, v.dsc, true
FROM (VALUES
  ('عُقود العُملاء','#3B82F6','عُقود البَيع والخِدمة'),
  ('عُقود المورّدين','#10B981','عُقود الشِراء والتَوريد'),
  ('مُستَنَدات الموَظَّفين','#F59E0B','عُقود ومُستَنَدات الموَظَّفين'),
  ('مُستَنَدات قانونية','#EF4444','المُستَنَدات القانونية'),
  ('فَواتير وإيصالات','#8B5CF6','الفَواتير المالية'),
  ('تَقارير دَورية','#06B6D4','التَقارير الشَهرية والسَنَوية')
) v(name,color,dsc)
WHERE NOT EXISTS (SELECT 1 FROM document_folders WHERE name=v.name AND "companyId"=1);

INSERT INTO document_templates (name, description, content, category, "companyId", format, type, "isActive", "htmlContent", "entityType", "presetKey")
SELECT v.name, v.dsc, v.content, v.cat, 1, 'html', v.type, true, v.html, v.entity, v.preset
FROM (VALUES
  ('قالِب فاتورة ضَريبية','فاتورة ضَريبية مُوَحَّدة','<h1>فاتورة</h1>','invoice','letter','<div>{{logo}}<h1>فاتورة ضَريبية</h1>{{items}}{{total}}</div>','invoice','tax_invoice'),
  ('قالِب عَرض سِعر','عَرض سِعر رَسمي','<h1>عَرض سِعر</h1>','quotation','letter','<div>عَرض سِعر #{{number}}</div>','quotation','quotation'),
  ('قالِب خِطاب رَسمي','خِطاب صادِر','<p>السلام عَلَيكُم</p>','letter','letter','<div>{{header}}<p>{{body}}</p>{{footer}}</div>','letter','formal_letter'),
  ('قالِب شَهادة خِبرة','شَهادة خِبرة لِلموَظَّفين','<h2>شَهادة خِبرة</h2>','hr','certificate','<div><h2>شَهادة خِبرة</h2>{{employeeName}}</div>','employee','experience_letter'),
  ('قالِب عَقد عَمَل','عَقد عَمَل قياسي','<h2>عَقد عَمَل</h2>','hr','contract','<div>عَقد بَين {{company}} و{{employee}}</div>','employee','employment_contract')
) v(name,dsc,content,cat,type,html,entity,preset)
WHERE NOT EXISTS (SELECT 1 FROM document_templates WHERE name=v.name AND "companyId"=1);

INSERT INTO company_documents ("companyId", "documentType", "documentNumber", "issueDate", "expiryDate", "issuingAuthority", "reminderDays", status, notes)
SELECT 1, v.type, v.num, CURRENT_DATE - 365, CURRENT_DATE + v.exp, v.auth, 30, v.status, v.notes
FROM (VALUES
  ('commercial_registration','1010123456',730,'وزارة التِجارة','active','السِجِل التِجاري الرَئيسي'),
  ('vat_certificate','300012345600003',9999,'هَيئة الزَكاة','active','شَهادة تَسجيل ضَريبة القيمة المُضافة'),
  ('zakat_certificate','2024-001',180,'هَيئة الزَكاة','active','شَهادة الزَكاة السَنَوية'),
  ('chamber_of_commerce','RYD-78945',365,'الغُرفة التِجارية بِالرياض','active','عُضوية الغُرفة'),
  ('saudization_certificate','NTQ-2024',90,'وزارة الموارد البَشَرية','active','شَهادة السَعوَدة'),
  ('gosi_certificate','GOSI-2024',180,'التَأمينات الاجتِماعية','active','شَهادة GOSI'),
  ('municipality_license','MUN-9876',45,'أَمانة الرياض','expiring_soon','رُخصة بَلَدية'),
  ('civil_defense','CD-5421',730,'الدِفاع المَدَني','active','رُخصة الدِفاع المَدَني')
) v(type,num,exp,auth,status,notes)
WHERE NOT EXISTS (SELECT 1 FROM company_documents WHERE "companyId"=1 AND "documentType"=v.type);

INSERT INTO official_letters ("companyId", "branchId", "employeeId", type, subject, content, status, ref, "outgoingRef", "recipientName", "recipientOrg")
SELECT 1, 1, 1, v.type, v.subject, v.content, v.status, v.ref, v.out, v.rname, v.rorg
FROM (VALUES
  ('experience_letter','شَهادة خِبرة','يَشهَد أَن السَيد ... عَمِل لَدَينا...','approved','LTR-2026-001','OUT-001','أ. سَعد العُتَيبي','شركة المُستَقبَل'),
  ('salary_letter','إفادة راتب','نُفيدُكُم أَن السَيد ... يَتقاضى راتِب ...','approved','LTR-2026-002','OUT-002','بنك الراجحي','بنك الراجحي'),
  ('introduction_letter','خِطاب تَعريف','نُعَرِّفُ بِالموَظَّف ... لِغَرَض ...','sent','LTR-2026-003','OUT-003','السِفارة الأمريكية','القُنصُلية الأمريكية'),
  ('warning_letter','إنذار','يُنبَّه السَيد ... بِخُصوص ...','draft','LTR-2026-004',NULL,NULL,NULL),
  ('thank_you_letter','شُكر وتَقدير','نَتَوَجَّه بِالشُكر الجَزيل ...','sent','LTR-2026-005','OUT-005','المورّد المُتَمَيِّز','شركة الإمداد')
) v(type,subject,content,status,ref,out,rname,rorg)
WHERE NOT EXISTS (SELECT 1 FROM official_letters WHERE ref=v.ref AND "companyId"=1);

-- =========================================================
-- 13) قاعِدة المَعرِفة + إشعارات + قَنَوات
-- =========================================================
INSERT INTO kb_articles ("companyId", title, content, category, status, views, "createdBy")
SELECT 1, v.title, v.content, v.cat, 'published', (10 + (random()*200)::int), 1
FROM (VALUES
  ('كَيفية تَسجيل فاتورة','اتبَع الخُطوات: 1) المالية > الفَواتير 2) إنشاء جَديد 3) ...','المالية'),
  ('إنشاء طَلَب إجازة','اذهَب إلى HR > إجازات > طَلَب جَديد...','الموارد البَشَرية'),
  ('استرجاع كَلِمة المُرور','اضغَط على نَسيت كَلِمة المُرور في صَفحة الدُخول...','عام'),
  ('تَصدير التَقارير','مِن صَفحة التَقارير، اختَر الفَترة ثُمَّ Export...','التَقارير'),
  ('إضافة موَظَّف جَديد','HR > الموَظَّفين > إضافة، أَكمِل البَيانات...','الموارد البَشَرية'),
  ('إعداد المُوازَنة','المالية > المُوازَنات > جَديد، حَدِّد البُنود...','المالية'),
  ('إدارة المُستَودَع','المُستَودَع > المُنتَجات لِإضافة وإدارة الأصناف...','المُستَودَع'),
  ('تَتَبُّع المَركَبات','الأُسطول > المَركَبات لِعَرض حالة كُل سَيارة...','الأُسطول')
) v(title,content,cat)
WHERE NOT EXISTS (SELECT 1 FROM kb_articles WHERE title=v.title AND "companyId"=1);

INSERT INTO sms_queue ("companyId", "recipientPhone", message, status)
SELECT 1, '+96655' || LPAD((1000000+g*1000)::text,7,'0'),
  (ARRAY['تَذكير بِمَوعِد اجتِماع غَدًا الساعة 10','رَسالة OTP: ' || (100000+g),'تَم تَأكيد طَلَبِكُم رَقم ' || g,'فاتورة جَديدة بِقيمة ' || (500+g*100) || ' ر.س'])[1+((g-1)%4)],
  (ARRAY['sent','sent','pending','sent','failed'])[1+((g-1)%5)]
FROM generate_series(1,10) g
WHERE (SELECT COUNT(*) FROM sms_queue WHERE "companyId"=1) < 3;

INSERT INTO whatsapp_queue ("companyId", phone, "recipientName", message, status)
SELECT 1, '+96655' || LPAD((2000000+g*1000)::text,7,'0'),
  (ARRAY['عَميل كَريم','المُورد','الموَظَّف','الشَريك'])[1+((g-1)%4)],
  'مَرحَبًا، ' || (ARRAY['نَتَطَلَّع لاجتِماعِنا','تَم إرسال الفاتورة','شُكرًا لِتَواصُلِكُم','نُذَكِّرُكُم بِمَوعِد التَسليم'])[1+((g-1)%4)],
  (ARRAY['delivered','sent','queued','delivered'])[1+((g-1)%4)]
FROM generate_series(1,12) g
WHERE (SELECT COUNT(*) FROM whatsapp_queue WHERE "companyId"=1) < 3;

INSERT INTO notification_preferences ("userId", "companyId", channel, category, enabled)
SELECT u.id, 1, ch, cat, true
FROM (SELECT id FROM users LIMIT 3) u
CROSS JOIN (VALUES ('in_app'),('email'),('sms'),('whatsapp')) c(ch)
CROSS JOIN (VALUES ('general'),('finance'),('hr'),('support'),('approvals')) g(cat)
WHERE NOT EXISTS (SELECT 1 FROM notification_preferences np WHERE np."userId"=u.id AND np.channel=c.ch AND np.category=g.cat);

-- =========================================================
-- 14) سَيْر العَمَل
-- =========================================================
INSERT INTO workflow_definitions ("companyId", "requestType", "requestTypeLabel", "isActive", "defaultSlaHours", description)
SELECT 1, v.req, v.label, true, v.sla, v.dsc
FROM (VALUES
  ('leave_request','طَلَب إجازة',48,'سَير العَمَل لِطَلَبات الإجازة'),
  ('expense_claim','مُطالَبة مَصاريف',72,'اعتِماد مُطالَبات الموَظَّفين'),
  ('purchase_request','طَلَب شِراء',168,'اعتِماد طَلَبات الشِراء'),
  ('overtime_request','طَلَب عَمَل إضافي',24,'اعتِماد العَمَل الإضافي'),
  ('exit_request','طَلَب خُروج/استِقالة',240,'إجراءات الاستِقالة'),
  ('budget_request','طَلَب مُوازَنة',168,'اعتِماد المُوازَنات')
) v(req,label,sla,dsc)
WHERE NOT EXISTS (SELECT 1 FROM workflow_definitions WHERE "requestType"=v.req AND "companyId"=1);

-- =========================================================
-- 15) RBAC: مَنح المُستَخدِم + أَدوار
-- =========================================================
INSERT INTO roles (name, description, "companyId", "isSystem")
SELECT v.name, v.dsc, 1, false
FROM (VALUES
  ('مُحاسِب أَول','صَلاحيات مُحاسَبة كامِلة'),
  ('مُشرِف عَمَليات','إشراف عام'),
  ('مُمَثِّل مَبيعات','إدارة العُملاء والفَواتير'),
  ('مُدَقِّق داخِلي','قِراءة فَقَط على كُل النِظام')
) v(name,dsc)
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name=v.name AND "companyId"=1);

INSERT INTO role_permissions (role, permission, "companyId")
SELECT v.role, v.perm, 1
FROM (VALUES
  ('owner','*'),
  ('general_manager','approve_all'),
  ('finance_manager','finance.*'),
  ('hr_manager','hr.*'),
  ('branch_manager','branch.*')
) v(role,perm)
WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role=v.role AND permission=v.perm AND "companyId"=1);

-- COMMIT;

-- ============================================================================
-- التَحَقُّق النِهائي
-- ============================================================================
SELECT 'property_contracts' tbl, COUNT(*) n FROM property_contracts WHERE "companyId"=1
UNION ALL SELECT 'property_security_deposits', COUNT(*) FROM property_security_deposits WHERE "companyId"=1
UNION ALL SELECT 'property_inspections', COUNT(*) FROM property_inspections WHERE "companyId"=1
UNION ALL SELECT 'credit_memos', COUNT(*) FROM credit_memos WHERE "companyId"=1
UNION ALL SELECT 'debit_memos', COUNT(*) FROM debit_memos WHERE "companyId"=1
UNION ALL SELECT 'customer_advances', COUNT(*) FROM customer_advances WHERE "companyId"=1
UNION ALL SELECT 'invoice_payments', COUNT(*) FROM invoice_payments WHERE "companyId"=1
UNION ALL SELECT 'bank_guarantees', COUNT(*) FROM bank_guarantees WHERE "companyId"=1
UNION ALL SELECT 'bank_statements', COUNT(*) FROM bank_statements WHERE "companyId"=1
UNION ALL SELECT 'budget_lines', COUNT(*) FROM budget_lines
UNION ALL SELECT 'fx_rates', COUNT(*) FROM fx_rates WHERE "companyId"=1
UNION ALL SELECT 'depreciation_entries', COUNT(*) FROM depreciation_entries WHERE "companyId"=1
UNION ALL SELECT 'fleet_maintenance', COUNT(*) FROM fleet_maintenance WHERE "companyId"=1
UNION ALL SELECT 'fleet_trips', COUNT(*) FROM fleet_trips WHERE "companyId"=1
UNION ALL SELECT 'fleet_insurance', COUNT(*) FROM fleet_insurance WHERE "companyId"=1
UNION ALL SELECT 'fleet_traffic_violations', COUNT(*) FROM fleet_traffic_violations WHERE "companyId"=1
UNION ALL SELECT 'fleet_alerts', COUNT(*) FROM fleet_alerts WHERE "companyId"=1
UNION ALL SELECT 'purchase_orders', COUNT(*) FROM purchase_orders WHERE "companyId"=1
UNION ALL SELECT 'purchase_order_items', COUNT(*) FROM purchase_order_items
UNION ALL SELECT 'goods_receipts', COUNT(*) FROM goods_receipts WHERE "companyId"=1
UNION ALL SELECT 'project_phases', COUNT(*) FROM project_phases
UNION ALL SELECT 'project_milestones', COUNT(*) FROM project_milestones WHERE "companyId"=1
UNION ALL SELECT 'project_costs', COUNT(*) FROM project_costs WHERE "companyId"=1
UNION ALL SELECT 'project_risks', COUNT(*) FROM project_risks WHERE "companyId"=1
UNION ALL SELECT 'project_tasks', COUNT(*) FROM project_tasks
UNION ALL SELECT 'legal_cases', COUNT(*) FROM legal_cases WHERE "companyId"=1
UNION ALL SELECT 'legal_sessions', COUNT(*) FROM legal_sessions
UNION ALL SELECT 'legal_correspondence', COUNT(*) FROM legal_correspondence WHERE "companyId"=1
UNION ALL SELECT 'legal_judgments', COUNT(*) FROM legal_judgments WHERE "companyId"=1
UNION ALL SELECT 'job_titles', COUNT(*) FROM job_titles WHERE "companyId"=1
UNION ALL SELECT 'hr_overtime_requests', COUNT(*) FROM hr_overtime_requests WHERE "companyId"=1
UNION ALL SELECT 'hr_violations', COUNT(*) FROM hr_violations WHERE "companyId"=1
UNION ALL SELECT 'hr_exit_requests', COUNT(*) FROM hr_exit_requests WHERE "companyId"=1
UNION ALL SELECT 'salary_history', COUNT(*) FROM salary_history WHERE "companyId"=1
UNION ALL SELECT 'employee_documents', COUNT(*) FROM employee_documents WHERE "companyId"=1
UNION ALL SELECT 'employee_kpi_snapshots', COUNT(*) FROM employee_kpi_snapshots WHERE "companyId"=1
UNION ALL SELECT 'evaluation_cycles', COUNT(*) FROM evaluation_cycles WHERE "companyId"=1
UNION ALL SELECT 'trainings', COUNT(*) FROM trainings WHERE "companyId"=1
UNION ALL SELECT 'training_enrollments', COUNT(*) FROM training_enrollments
UNION ALL SELECT 'ticket_replies', COUNT(*) FROM ticket_replies
UNION ALL SELECT 'ticket_csat_ratings', COUNT(*) FROM ticket_csat_ratings WHERE "companyId"=1
UNION ALL SELECT 'sla_definitions', COUNT(*) FROM sla_definitions WHERE "companyId"=1
UNION ALL SELECT 'crm_activities', COUNT(*) FROM crm_activities
UNION ALL SELECT 'warehouse_stock_lots', COUNT(*) FROM warehouse_stock_lots WHERE "companyId"=1
UNION ALL SELECT 'warehouse_cycle_count_plans', COUNT(*) FROM warehouse_cycle_count_plans WHERE "companyId"=1
UNION ALL SELECT 'document_folders', COUNT(*) FROM document_folders WHERE "companyId"=1
UNION ALL SELECT 'document_templates', COUNT(*) FROM document_templates WHERE "companyId"=1
UNION ALL SELECT 'company_documents', COUNT(*) FROM company_documents WHERE "companyId"=1
UNION ALL SELECT 'official_letters', COUNT(*) FROM official_letters WHERE "companyId"=1
UNION ALL SELECT 'kb_articles', COUNT(*) FROM kb_articles WHERE "companyId"=1
UNION ALL SELECT 'sms_queue', COUNT(*) FROM sms_queue WHERE "companyId"=1
UNION ALL SELECT 'whatsapp_queue', COUNT(*) FROM whatsapp_queue WHERE "companyId"=1
UNION ALL SELECT 'notification_preferences', COUNT(*) FROM notification_preferences
UNION ALL SELECT 'workflow_definitions', COUNT(*) FROM workflow_definitions WHERE "companyId"=1
UNION ALL SELECT 'roles', COUNT(*) FROM roles WHERE "companyId"=1
UNION ALL SELECT 'role_permissions', COUNT(*) FROM role_permissions WHERE "companyId"=1
ORDER BY 1;
