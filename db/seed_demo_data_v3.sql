-- ============================================================
-- Ghayth ERP — Demo Seed v3 (74 إضافية، إجمالي ≈ 130 جَدول مَع v1+v2)
-- REPLIT LOCAL UNBLOCKED — NOT CANONICAL GITHUB MAIN
-- آمِن لإعادة التَشغيل (WHERE NOT EXISTS), بِدون BEGIN/COMMIT.
-- ============================================================

-- المُنتَجات (12)
INSERT INTO products ("companyId", name, description, sku, category, "unitPrice", unit, "itemType")
SELECT 1, v.name, v.descr, v.sku, v.cat, v.price, v.unit, v.tp
FROM (VALUES
  ('خِدمة عُمرة فِردية','باقَة عُمرة كامِلة 7 لَيالٍ','UMR-IND-7','عُمرة',2500,'فَرد','service'),
  ('باقَة عُمرة عائِلية','عُمرة 14 لَيلة للأُسرة','UMR-FAM-14','عُمرة',9800,'باقَة','service'),
  ('تَأشيرة عُمرة','إصدار تَأشيرة','VISA-UMR','عُمرة',650,'تَأشيرة','service'),
  ('نَقل جَوي','تَذكَرة طَيران ذَهاب وإياب','TRP-AIR','نَقل',1800,'تَذكَرة','service'),
  ('نَقل بَري','حافِلة مُكَيَّفة','TRP-BUS','نَقل',150,'مَقعَد','service'),
  ('سَكَن فُندُقي','لَيلة فُندُق 4 نُجوم','HTL-4S','سَكَن',420,'لَيلة','service'),
  ('وَجبات مُتَكامِلة','إفطار + غَداء + عَشاء','MEAL-FB','إعاشَة',95,'يَوم','service'),
  ('قَهوة عَرَبية ١ كيلو','قَهوة سَعودية فاخِرة','PRD-COF-1K','مَواد غِذائية',180,'كيلو','product'),
  ('تَمر سُكَّري ٥ كيلو','تَمر سُكَّري قَصيم','PRD-DAT-5K','مَواد غِذائية',225,'صُندوق','product'),
  ('زَيت زَيتون ٣ لِتر','زَيت بِكر مُمتاز','PRD-OIL-3L','مَواد غِذائية',95,'عُلبة','product'),
  ('عَباءة نِسائية','عَباءة سَعودية حَريرية','PRD-AB-001','مَلابِس',320,'قِطعة','product'),
  ('سَجادة صَلاة','سَجادة فاخِرة','PRD-RUG-01','أَدَوات دينية',75,'قِطعة','product')
) v(name,descr,sku,cat,price,unit,tp)
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku=v.sku);

-- product_valuation_settings (طُرُق fifo/lifo/average)
INSERT INTO product_valuation_settings ("productId", method, "avgUnitCost")
SELECT p.id, (ARRAY['fifo','lifo','average'])[1+((p.id-1)%3)], (p.id*100+50)::numeric
FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_valuation_settings WHERE "productId"=p.id);

-- product_abc_classification
INSERT INTO product_abc_classification ("companyId","productId",period,category,"paretoShare","paretoValue")
SELECT 1, p.id, '2026-Q2', (ARRAY['A','B','C'])[1+((p.id-1)%3)], (random()*100)::numeric, (p.id*1000)::numeric
FROM products p WHERE p."companyId"=1
AND NOT EXISTS (SELECT 1 FROM product_abc_classification WHERE "productId"=p.id AND period='2026-Q2');

-- leave_balances
INSERT INTO leave_balances ("companyId","employeeId","leaveTypeId",year,entitled,used,pending,carried)
SELECT 1, 1, g, 2026, 30, (random()*10)::int, (random()*3)::int, (random()*5)::int
FROM generate_series(1,5) g
WHERE NOT EXISTS (SELECT 1 FROM leave_balances WHERE "employeeId"=1 AND "leaveTypeId"=g AND year=2026);

-- performance_reviews
INSERT INTO performance_reviews ("companyId","employeeId","reviewerId",period,"reviewDate","overallScore",status,scores,strengths,improvements,goals,comments)
SELECT 1, 1, 1, 'Q'||g||'-2026', CURRENT_DATE-(g*30), (75+g*3)::numeric, 'completed',
  jsonb_build_object('quality',80+g,'productivity',75+g,'teamwork',85,'punctuality',90),
  'الالتِزام بالمَواعيد، جَودة عالية','تَحسين مَهارات التَواصُل','اجتياز شَهادة PMP','أَداء مُتمَيِّز'
FROM generate_series(1,4) g
WHERE NOT EXISTS (SELECT 1 FROM performance_reviews WHERE "employeeId"=1 AND period='Q'||g||'-2026');

-- peer_evaluations + evaluation_participants + evaluation_summaries + system_evaluations
INSERT INTO peer_evaluations ("cycleId","companyId","evaluatorId","employeeId","evaluatorRole","overallScore",scores,comments)
SELECT c.id, 1, 1, 1, (ARRAY['peer','manager','self'])[1+(c.id-1)%3], (70+c.id*5)::numeric,
  jsonb_build_object('teamwork',80,'leadership',75,'communication',85),'تَقييم زَميل'
FROM (SELECT id FROM evaluation_cycles WHERE "companyId"=1) c
WHERE NOT EXISTS (SELECT 1 FROM peer_evaluations WHERE "cycleId"=c.id AND "evaluatorId"=1);

INSERT INTO evaluation_participants ("cycleId","companyId","evaluatorId","evaluatorRole","hasSubmitted")
SELECT c.id, 1, 1, 'peer', false
FROM (SELECT id FROM evaluation_cycles WHERE "companyId"=1) c
WHERE NOT EXISTS (SELECT 1 FROM evaluation_participants WHERE "cycleId"=c.id AND "evaluatorId"=1);

INSERT INTO evaluation_summaries ("cycleId","companyId","employeeId","systemScore","peerScore","managerScore","upwardAvgScore","upwardReviewCount","finalScore","completedAt")
SELECT c.id, 1, 1, 82, 78, 85, 80, 3, 82.5, NOW()
FROM (SELECT id FROM evaluation_cycles WHERE "companyId"=1) c
WHERE NOT EXISTS (SELECT 1 FROM evaluation_summaries WHERE "cycleId"=c.id AND "employeeId"=1);

INSERT INTO system_evaluations ("cycleId","companyId","employeeId","attendanceScore","taskCompletionScore","onTimeScore","clientSatScore","docQualityScore","overallScore",metrics)
SELECT c.id, 1, 1, 85+(c.id%10), 80+(c.id%15), 90, 88+(c.id%5), 82, 85.5, '{"hoursWorked":160,"tasksClosed":24}'::jsonb
FROM (SELECT id FROM evaluation_cycles WHERE "companyId"=1) c
WHERE NOT EXISTS (SELECT 1 FROM system_evaluations WHERE "cycleId"=c.id AND "employeeId"=1);

-- anonymous_upward_reviews (overallScore + token)
INSERT INTO anonymous_upward_reviews ("cycleId","companyId","managerId","overallScore",scores,comments,"submissionToken")
SELECT c.id, 1, 1, (70+g*3)::numeric, jsonb_build_object('leadership',80+g,'fairness',75+g,'support',82,'communication',78), 'تَقييم بِناء #'||g, gen_random_uuid()::text
FROM (SELECT id FROM evaluation_cycles WHERE "companyId"=1) c
CROSS JOIN generate_series(1,3) g
WHERE NOT EXISTS (SELECT 1 FROM anonymous_upward_reviews WHERE "cycleId"=c.id AND comments='تَقييم بِناء #'||g);

-- training_participants
INSERT INTO training_participants ("trainingId","employeeId",status,score,hours,"completedAt")
SELECT t.id, 1, 'completed', (70+t.id*4)::numeric, 16, NOW()-(t.id||' days')::interval
FROM (SELECT id FROM trainings WHERE "companyId"=1 LIMIT 5) t
WHERE NOT EXISTS (SELECT 1 FROM training_participants WHERE "trainingId"=t.id AND "employeeId"=1);

-- approval_requests
INSERT INTO approval_requests ("companyId","branchId","refType","refId","requiredRole","assignedTo",status,"expiresAt")
SELECT 1, 1, t.refType, t.refId, 'manager', 1, t.status, NOW()+(7||' days')::interval
FROM (VALUES
  ('invoice',1,'pending'),('invoice',5,'approved'),('po',2,'pending'),
  ('po',13,'approved'),('leave_request',1,'pending'),('hr_overtime',1,'approved'),
  ('hr_exit',1,'pending'),('project',1,'approved')
) t(refType,refId,status)
WHERE NOT EXISTS (SELECT 1 FROM approval_requests WHERE "refType"=t.refType AND "refId"=t.refId);

-- delegations
INSERT INTO delegations ("delegatorId","delegateId","companyId",scope,reason,status,"startDate","endDate")
SELECT 1, 2, 1, 'موافقات', 'إجازة سَنوية', 'active', CURRENT_DATE, CURRENT_DATE+15
WHERE NOT EXISTS (SELECT 1 FROM delegations WHERE "delegatorId"=1 AND "delegateId"=2);
INSERT INTO delegations ("delegatorId","delegateId","companyId",scope,reason,status,"startDate","endDate")
SELECT 1, 3, 1, 'مَشتَريات', 'سَفَر عَمَل', 'completed', CURRENT_DATE-30, CURRENT_DATE-5
WHERE NOT EXISTS (SELECT 1 FROM delegations WHERE "delegatorId"=1 AND "delegateId"=3);

-- document_versions + document_entity_links + document_ocr_extractions
INSERT INTO document_versions ("documentId","versionNumber","fileName","fileSize","mimeType","storageKey","uploadedBy",notes)
SELECT d.id, g, 'doc-'||d.id||'-v'||g||'.pdf', 50000*g, 'application/pdf', 'docs/'||d.id||'/v'||g||'.pdf', 1, 'إصدار رَقم '||g
FROM (SELECT id FROM company_documents WHERE "companyId"=1 LIMIT 5) d
CROSS JOIN generate_series(1,3) g
WHERE NOT EXISTS (SELECT 1 FROM document_versions WHERE "documentId"=d.id AND "versionNumber"=g);

INSERT INTO document_entity_links ("documentId","entityType","entityId")
SELECT d.id, t.et, t.eid
FROM (SELECT id FROM company_documents WHERE "companyId"=1 LIMIT 4) d
CROSS JOIN (VALUES ('invoice',1),('project',1),('employee',1),('client',1)) t(et,eid)
WHERE NOT EXISTS (SELECT 1 FROM document_entity_links WHERE "documentId"=d.id AND "entityType"=t.et AND "entityId"=t.eid);

INSERT INTO document_ocr_extractions ("companyId","documentId","docType",fields,confidence,status,notes)
SELECT 1, d.id, v.t, v.f::jsonb, v.c::numeric, 'extracted', 'OCR تِلقائي'
FROM (SELECT id FROM company_documents WHERE "companyId"=1 LIMIT 6) d
CROSS JOIN LATERAL (VALUES
  ('iqama','{"name":"أحمَد العَتيبي","iqamaNo":"2078901234","expiry":"2027-05-12"}',0.95),
  ('invoice','{"vendor":"شَركة المَوارِد","amount":"15600.00","vat":"2340.00"}',0.92),
  ('passport','{"name":"FAISAL ALMUTAIRI","number":"V12345678","issued":"2022-01-15"}',0.97)
) v(t,f,c)
WHERE NOT EXISTS (SELECT 1 FROM document_ocr_extractions WHERE "documentId"=d.id AND "docType"=v.t);

-- onboarding_tasks + loan_accounts + employee_of_month + employee_salary_components + employee_shift_assignments
INSERT INTO onboarding_tasks ("companyId","employeeId","assignmentId",title,description,"assignedTo",status,"dueDate")
SELECT 1, 1, 2, v.t, v.d, 1, v.s, CURRENT_DATE+v.dd
FROM (VALUES
  ('اعداد بَريد الشَركة','إنشاء حِساب outlook','completed',-3),
  ('تَوقيع العَقد','تَوقيع عَقد العَمَل','completed',-5),
  ('تَسليم الزِي','الزِي الرَسمي والشارَة','completed',-2),
  ('تَدريب توجيهي','يَوم تَعريفي','in_progress',2),
  ('فَتح حِساب بَنكي','حَولة الرَواتِب','pending',7),
  ('فَحص طِبي','الكَشف الطِبي السَنوي','pending',10)
) v(t,d,s,dd)
WHERE NOT EXISTS (SELECT 1 FROM onboarding_tasks WHERE "employeeId"=1 AND title=v.t);

INSERT INTO loan_accounts ("companyId","assignmentId","employeeId",amount,"remainingAmount","monthlyInstallment",status,"startDate",notes)
SELECT 1, 2, 1, (10000+g*5000)::numeric, (8000+g*4000)::numeric, (500+g*250)::numeric,
  (ARRAY['active','completed','active'])[1+(g-1)%3], CURRENT_DATE-(g*30), 'سُلفة شَهر '||g
FROM generate_series(1,5) g
WHERE NOT EXISTS (SELECT 1 FROM loan_accounts WHERE "employeeId"=1 AND amount=(10000+g*5000)::numeric);

INSERT INTO employee_of_month ("employeeId",month,year,reason,"companyId","branchId","createdBy")
SELECT 1, g, 2026, 'إنجاز مُتمَيِّز في شَهر '||g, 1, 1, 1
FROM generate_series(1,5) g
WHERE NOT EXISTS (SELECT 1 FROM employee_of_month WHERE "employeeId"=1 AND month=g AND year=2026);

INSERT INTO employee_salary_components ("employeeId","assignmentId","companyId","componentId","customValue")
SELECT 1, 2, 1, sc.id, (500+sc.id*100)::numeric
FROM (SELECT id FROM salary_components LIMIT 6) sc
WHERE NOT EXISTS (SELECT 1 FROM employee_salary_components WHERE "employeeId"=1 AND "componentId"=sc.id);

INSERT INTO employee_shift_assignments ("assignmentId","shiftId","startDate","endDate")
SELECT 2, g, CURRENT_DATE-60+(g*15), CURRENT_DATE+60+(g*15)
FROM generate_series(1,3) g
WHERE NOT EXISTS (SELECT 1 FROM employee_shift_assignments WHERE "assignmentId"=2 AND "shiftId"=g);

-- hr_exit_clearance + discipline_memos
INSERT INTO hr_exit_clearance ("exitRequestId","companyId",department,"departmentLabel",status,notes)
SELECT er.id, 1, v.d, v.dl, v.s, v.n
FROM (SELECT id FROM hr_exit_requests WHERE "companyId"=1) er
CROSS JOIN (VALUES
  ('it','تِقنية المَعلومات','completed','إعادة الأَجهِزة'),
  ('finance','المالية','completed','تَسوية المُستَحَقّات'),
  ('hr','المَوارِد البَشَرية','pending','جاري تَسليم المَلَف'),
  ('admin','الشُؤون الإدارية','completed','إعادة البَطاقة'),
  ('manager','المُدير المُباشِر','in_progress','تَقييم نِهائي')
) v(d,dl,s,n)
WHERE NOT EXISTS (SELECT 1 FROM hr_exit_clearance WHERE "exitRequestId"=er.id AND department=v.d);

INSERT INTO discipline_memos ("companyId","violationId","memoNumber",status,"penaltyLabel","baseDeductionAmount","totalDeductionAmount",notes,"issuedBy")
SELECT 1, hv.id, 'MEM-2026-'||LPAD(hv.id::text,4,'0'), 'active',
  (ARRAY['تَحذير شَفَوي','إنذار كِتابي','إنذار نِهائي','خَصم يَوم'])[1+((hv.id-1)%4)],
  (100+hv.id*50)::numeric, (100+hv.id*75)::numeric, 'مُذَكِّرة تَأديبية', 1
FROM (SELECT id FROM hr_violations WHERE "companyId"=1) hv
WHERE NOT EXISTS (SELECT 1 FROM discipline_memos WHERE "violationId"=hv.id);

-- saudization_snapshots
INSERT INTO saudization_snapshots ("companyId",period,"totalEmployees","saudiEmployees","nonSaudiEmployees","saudizationPercent",category,sector)
SELECT 1, '2026-'||LPAD(g::text,2,'0'), 150+g*5, 45+g*2, 105+g*3, ((45+g*2)*100.0/(150+g*5))::numeric, 'green', 'services'
FROM generate_series(1,6) g
WHERE NOT EXISTS (SELECT 1 FROM saudization_snapshots WHERE "companyId"=1 AND period='2026-'||LPAD(g::text,2,'0'));

-- employee_commission_plans + tiers + calculations
INSERT INTO employee_commission_plans ("companyId","employeeId","assignmentId","planName","baseSalary","commissionType","percentageRate","fixedAmount",status,"createdBy")
SELECT 1, 1, 2, v.n, 8000, v.ct, v.pr, v.fa, 'active', 1
FROM (VALUES
  ('عُمولة المَبيعات الأَساسية','percentage',5,NULL),
  ('عُمولة العُمرة الموسمية','tier',3,500),
  ('مُكافأة الإنجاز الرُبعي','fixed',NULL,2000),
  ('عُمولة العُملاء الجُدُد','percentage',8,NULL)
) v(n,ct,pr,fa)
WHERE NOT EXISTS (SELECT 1 FROM employee_commission_plans WHERE "planName"=v.n AND "employeeId"=1);

INSERT INTO employee_commission_tiers ("planId","fromCount","toCount","bonusPerUnit","tierOrder","companyId","branchId","createdBy")
SELECT p.id, t.fc, t.tc, t.bpu, t.ord, 1, 1, 1
FROM (SELECT id FROM employee_commission_plans WHERE "companyId"=1) p
CROSS JOIN (VALUES (0,10,50,1),(10,30,80,2),(30,100,120,3),(100,NULL,150,4)) t(fc,tc,bpu,ord)
WHERE NOT EXISTS (SELECT 1 FROM employee_commission_tiers WHERE "planId"=p.id AND "tierOrder"=t.ord);

INSERT INTO employee_commission_calculations ("companyId","branchId","planId","employeeId",month,year,"totalMutamers","avgProfitPerVisa","salesPercent","conditionMet","commissionAmount","finalAmount",status,"createdBy")
SELECT 1, 1, p.id, p."employeeId", m, 2026, (25+m*5)::numeric, (250+m*10)::numeric, (60+m)::numeric, true, (1250+m*200)::numeric, (1250+m*200)::numeric, 'calculated', 1
FROM (SELECT id,"employeeId" FROM employee_commission_plans WHERE "companyId"=1 LIMIT 2) p
CROSS JOIN generate_series(1,4) m
WHERE NOT EXISTS (SELECT 1 FROM employee_commission_calculations WHERE "planId"=p.id AND month=m AND year=2026);

-- workflows + workflow_steps + workflow_requests
INSERT INTO workflows (name, description, steps, "companyId")
SELECT v.n, v.d, v.s::jsonb, 1
FROM (VALUES
  ('سَير اعتِماد الفَواتير','اعتِماد فَواتير المُشتَريات','["manager","finance","cfo"]'),
  ('سَير اعتِماد العَطلات','اعتِماد طَلَبات الإجازات','["manager","hr"]'),
  ('سَير اعتِماد المَشاريع','اعتِماد المَشاريع الجَديدة','["pm","cfo","ceo"]'),
  ('سَير صَرف السُلَف','اعتِماد السُلَف للمُوظَّفين','["manager","hr","finance"]')
) v(n,d,s)
WHERE NOT EXISTS (SELECT 1 FROM workflows WHERE name=v.n);

INSERT INTO workflow_steps ("definitionId","stepOrder","stepName","requiredRole","slaHours")
SELECT wd.id, v.o, v.sn, v.rr, v.sla
FROM (SELECT id FROM workflow_definitions WHERE "companyId"=1 LIMIT 4) wd
CROSS JOIN (VALUES
  (1,'مُراجَعة المُدير','manager',24),
  (2,'مُراجَعة المالية','finance',48),
  (3,'الاعتِماد النِهائي','cfo',24)
) v(o,sn,rr,sla)
WHERE NOT EXISTS (SELECT 1 FROM workflow_steps WHERE "definitionId"=wd.id AND "stepOrder"=v.o);

INSERT INTO workflow_requests ("companyId","requestType",title,description,status,amount,"submittedBy","entityType","workflowType","requestedBy")
SELECT 1, v.rt, v.t, v.d, v.s, v.a, 1, v.et, v.wt, 1
FROM (VALUES
  ('expense','طَلَب صَرف نَقدية','مَصاريف اجتِماع العُملاء','pending',5000,'expense','approval'),
  ('purchase','شِراء أَجهِزة كومبيوتر','5 لاب توب جَديدة','approved',45000,'po','approval'),
  ('travel','طَلَب سَفَر عَمَل','رِحلة دُبَي للتَدريب','pending',12000,'travel','approval'),
  ('budget','تَجاوُز مُوازَنة','مَشروع طارئ','rejected',80000,'budget','approval'),
  ('contract','تَوقيع عَقد إيجار','مَكتَب فَرعي جَديد','pending',180000,'contract','approval'),
  ('hr','تَرقية مُوظَّف','تَرقية أَحمَد إلى مَدير','approved',NULL,'employee','approval')
) v(rt,t,d,s,a,et,wt)
WHERE NOT EXISTS (SELECT 1 FROM workflow_requests WHERE title=v.t);

-- technicians + public_announcements + scheduled_reports + smart_recommendations
INSERT INTO technicians ("companyId","employeeId",name,phone,speciality,status,rating,latitude,longitude)
SELECT 1, NULL, v.n, v.p, v.sp, v.st, v.r, v.lat, v.lng
FROM (VALUES
  ('سَعيد العَتيبي','0501234567','كَهرَباء','available',4.8,24.7136,46.6753),
  ('خالِد الزَهراني','0507654321','سَباكة','busy',4.5,24.7700,46.7400),
  ('فَيصَل القَحطاني','0512345678','تَكييف','available',4.9,24.6500,46.7100),
  ('عَبدالله الحَربي','0523456789','نَجارَة','available',4.2,24.7200,46.6900),
  ('ماجِد الشَهري','0534567890','بِناء','available',4.7,24.7000,46.6500)
) v(n,p,sp,st,r,lat,lng)
WHERE NOT EXISTS (SELECT 1 FROM technicians WHERE name=v.n);

INSERT INTO public_announcements (title, body, category, "companyId", "expiresAt", "createdBy")
SELECT v.t, v.b, v.c, 1, NOW()+(v.dd||' days')::interval, 1
FROM (VALUES
  ('إجازة اليَوم الوَطَني','الشَركة مُغلَقة 23-25 سِبتَمبر','holiday',60),
  ('تَحديث نِظام ERP','صِيانة لَيلة الجُمعة','it',7),
  ('فَعالية الإفطار الجَماعي','الخَميس القادِم بَعد المَغرِب','event',10),
  ('سياسة جَديدة للعَمَل عَن بُعد','تَطبيق نِظام هَجين','policy',365),
  ('تَكريم المُوظَّف المُثالي','الحَفل الشَهري الإثنين','event',7)
) v(t,b,c,dd)
WHERE NOT EXISTS (SELECT 1 FROM public_announcements WHERE title=v.t);

INSERT INTO scheduled_reports ("companyId","reportType",title,frequency,recipients,params,"createdBy","nextRun")
SELECT 1, v.rt, v.t, v.f, v.r::jsonb, v.p::jsonb, 1, NOW()+(v.dd||' hours')::interval
FROM (VALUES
  ('financial','تَقرير الأَرباح الشَهري','monthly','["ceo@ghayth.com","cfo@ghayth.com"]','{"period":"month"}',24),
  ('hr','حُضور وانصِراف','weekly','["hr@ghayth.com"]','{"groupBy":"branch"}',168),
  ('sales','تَقرير المَبيعات','daily','["sales@ghayth.com"]','{"top":10}',24),
  ('inventory','تَنبيهات المَخزون','daily','["wh@ghayth.com"]','{"threshold":10}',12),
  ('fleet','استِهلاك الوَقود','weekly','["fleet@ghayth.com"]','{"period":"week"}',72)
) v(rt,t,f,r,p,dd)
WHERE NOT EXISTS (SELECT 1 FROM scheduled_reports WHERE title=v.t);

INSERT INTO smart_recommendations ("companyId","userId",type,title,description,priority,"actionUrl")
SELECT 1, 1, v.t, v.tit, v.d, v.p, v.url
FROM (VALUES
  ('financial','مُراجَعة فَواتير مُتأَخِّرة','12 فاتورة فاتَ موعدها','high','/finance/invoices?status=overdue'),
  ('hr','رِخَص قارَبَت الانتِهاء','5 إقامات في الشَهر القادِم','high','/hr/iqama-expiring'),
  ('inventory','مُنتَجات نَفِدَت','3 مُنتَجات مُنتَهية','high','/warehouse/low-stock'),
  ('fleet','مَوعِد صِيانة دَورية','7 مَركَبات بِحاجة','medium','/fleet/maintenance'),
  ('compliance','تَحديث مُستَنَدات','رُخصة بَلَدية تَنتَهي','medium','/documents'),
  ('crm','عُملاء غَير نَشِطين','15 عَميل بِدون شِراء 60 يوم','low','/crm/inactive')
) v(t,tit,d,p,url)
WHERE NOT EXISTS (SELECT 1 FROM smart_recommendations WHERE title=v.tit);

-- business_rules + proactive_rules + alert_mute_rules + alert_fatigue_settings
INSERT INTO business_rules ("companyId",name,description,"triggerEvent","conditionField","conditionOperator","conditionValue","actionType","actionTarget",module,priority,"createdBy")
SELECT 1, v.n, v.d, v.te, v.cf, v.co, v.cv, v.at, v.tg, v.m, v.p, 1
FROM (VALUES
  ('تَنبيه فَواتير مُتَأَخِّرة','إرسال تَنبيه عِند تَجاوُز 30 يوم','invoice.overdue','daysOverdue','>=','30','notify','finance@ghayth.com','finance',10),
  ('وَقف عَميل مُتَعَثِّر','إيقاف عَميل تَخَطّى الحَد','client.credit','outstandingAmount','>','100000','suspend','client','crm',20),
  ('مُوافَقة آلية للمَصاريف الصَغيرة','اعتِماد تِلقائي < 500','expense.submit','amount','<','500','approve','expense','finance',5),
  ('تَنبيه نَفاد المَخزون','عِند < 10 وَحَدات','inventory.low','quantity','<','10','notify','wh@ghayth.com','warehouse',15)
) v(n,d,te,cf,co,cv,at,tg,m,p)
WHERE NOT EXISTS (SELECT 1 FROM business_rules WHERE name=v.n);

INSERT INTO proactive_rules (name,"nameAr",description,"descriptionAr",module,"triggerType","companyId")
SELECT v.n, v.na, v.d, v.da, v.m, v.tt, 1
FROM (VALUES
  ('iqama_expiry_60d','تَنبيه انتِهاء الإقامة ٦٠ يوم','Alert 60 days before iqama expiry','يُرسِل تَنبيه قَبل انتِهاء الإقامة بِـ60 يوم','hr','cron'),
  ('invoice_overdue_30d','فَواتير مُتأَخِّرة ٣٠ يوم','Overdue invoices 30 days','فَواتير لم تُسَدَّد بَعد 30 يوم','finance','cron'),
  ('vehicle_inspection_due','فَحص دَوري للسَيارات','Vehicle inspection due','مَركَبات تَحتاج فَحص دَوري','fleet','cron'),
  ('contract_renewal','تَجديد عُقود','Contract renewals','عُقود قارَبت الانتِهاء','crm','cron')
) v(n,na,d,da,m,tt)
WHERE NOT EXISTS (SELECT 1 FROM proactive_rules WHERE name=v.n);

INSERT INTO alert_mute_rules ("companyId","assignmentId","alertType","muteUntil",reason)
SELECT 1, 2, v.at, NOW()+(v.d||' days')::interval, v.r
FROM (VALUES
  ('low_stock',7,'مُراجَعة شَهرية'),('overdue_invoice',14,'إجازة'),
  ('maintenance_due',30,'تَأجيل لِشَهر'),('iqama_expiry',60,'تَجديد قَيد المُعالَجة')
) v(at,d,r)
WHERE NOT EXISTS (SELECT 1 FROM alert_mute_rules WHERE "assignmentId"=2 AND "alertType"=v.at);

INSERT INTO alert_fatigue_settings ("companyId","assignmentId","alertType","muteUntil",reason)
SELECT 1, 2, v.at, NOW()+(v.d||' days')::interval, v.r
FROM (VALUES
  ('daily_summary',7,'كَثرة الإشعارات اليَومية'),
  ('low_priority',30,'تَجاهُل تَنبيهات أَقل أَهَمّية'),
  ('weekend',2,'صَمت في عُطلة نِهاية الأُسبوع')
) v(at,d,r)
WHERE NOT EXISTS (SELECT 1 FROM alert_fatigue_settings WHERE "assignmentId"=2 AND "alertType"=v.at);

-- data_retention_policies + permissions + custom_roles + rbac_user_grants
INSERT INTO data_retention_policies ("companyId","dataType","retentionDays","legalBasis",description,"isDefault")
SELECT 1, v.dt, v.rd, v.lb, v.d, v.isd
FROM (VALUES
  ('audit_logs',2555,'PDPL Art. 18','الاحتِفاظ بِسَجِلات التَدقيق 7 سَنوات',true),
  ('financial_records',3650,'ZATCA','سَجِلات مالية 10 سَنوات',true),
  ('hr_records',1825,'Labor Law','سَجِلات المُوظَّفين 5 سَنوات',true),
  ('customer_data',1095,'PDPL','بَيانات العُملاء 3 سَنوات',true),
  ('marketing_data',365,'PDPL','بَيانات التَسويق سَنة واحِدة',false),
  ('session_data',90,'Security','جَلَسات المُستَخدِمين 90 يوم',true)
) v(dt,rd,lb,d,isd)
WHERE NOT EXISTS (SELECT 1 FROM data_retention_policies WHERE "dataType"=v.dt);

INSERT INTO permissions ("userId",permission,type,"companyId","grantedBy")
SELECT u.id, v.p, 'grant', 1, 1
FROM (SELECT id FROM users WHERE id IN (1,2,3) LIMIT 3) u
CROSS JOIN (VALUES ('finance.view'),('hr.view'),('reports.export'),('approvals.act')) v(p)
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE "userId"=u.id AND permission=v.p);

INSERT INTO custom_roles ("companyId","roleKey",label,level,modules,"createdBy")
SELECT 1, v.rk, v.l, v.lv, v.m::jsonb, 1
FROM (VALUES
  ('regional_manager','مُدير إقليمي',50,'["hr","finance","fleet","crm"]'),
  ('senior_accountant','مُحاسِب أَول',40,'["finance","reports"]'),
  ('warehouse_lead','مَسؤول مُستَودَع',30,'["warehouse","inventory"]'),
  ('hr_specialist','أخصائي مَوارِد بَشَرية',35,'["hr","payroll"]')
) v(rk,l,lv,m)
WHERE NOT EXISTS (SELECT 1 FROM custom_roles WHERE "roleKey"=v.rk);

INSERT INTO rbac_user_grants ("userId","companyId",feature_key,action,scope,type,reason,"grantedBy")
SELECT u.id, 1, v.fk, v.a, 'company', 'grant', v.r, 1
FROM (SELECT id FROM users WHERE id IN (1,2,3,8,9) LIMIT 5) u
CROSS JOIN (VALUES
  ('finance.reports','read','مُحاسِب إقليمي'),
  ('hr.payroll','read','مَسؤول رَواتِب'),
  ('approvals.act','write','مُدير'),
  ('exports.excel','execute','تَصدير شَهري')
) v(fk,a,r)
WHERE NOT EXISTS (SELECT 1 FROM rbac_user_grants WHERE "userId"=u.id AND feature_key=v.fk);

-- journal_entry_templates + lines + recurring_journals + accounting_allocation_rules + intercompany_transactions
INSERT INTO journal_entry_templates ("companyId",name,"operationType",description,"branchId","activityType")
SELECT 1, v.n, v.ot, v.d, 1, v.at
FROM (VALUES
  ('قَيد بَيع عُمرة','umrah_sale','تَسجيل بَيع باقَة عُمرة','umrah'),
  ('قَيد رَواتِب شَهرية','payroll','صَرف رَواتِب الشَهر','hr'),
  ('قَيد إيجار شَهري','rent','اعتِراف إيرادات الإيجار','property'),
  ('قَيد إهلاك أُصول','depreciation','إهلاك شَهري','asset'),
  ('قَيد فاتورة مُورِّد','supplier_invoice','اعتِماد فاتورة شِراء','procurement')
) v(n,ot,d,at)
WHERE NOT EXISTS (SELECT 1 FROM journal_entry_templates WHERE name=v.n);

INSERT INTO journal_entry_template_lines ("templateId","accountId","accountCode","lineType",description,"sortOrder")
SELECT t.id, v.aid, v.code, v.lt, v.d, v.so
FROM (SELECT id FROM journal_entry_templates WHERE "companyId"=1) t
CROSS JOIN (VALUES (94,'1101','debit','حِساب البَنك',1),(146,'2101','credit','حِساب المورد',2)) v(aid,code,lt,d,so)
WHERE NOT EXISTS (SELECT 1 FROM journal_entry_template_lines WHERE "templateId"=t.id AND "sortOrder"=v.so);

INSERT INTO recurring_journals ("companyId","branchId",name,description,frequency,"startDate","nextRunDate","templateLines","templateRef","templateDescription","createdBy")
SELECT 1, 1, v.n, v.d, v.f, CURRENT_DATE-30, CURRENT_DATE+v.dd, v.tl::jsonb, v.tr, v.td, 1
FROM (VALUES
  ('قَيد إيجار شَهري','رَكور تِلقائي للإيجار','monthly',5,'[{"acc":94,"debit":15000},{"acc":146,"credit":15000}]','RJ-RENT-001','إيجار شَهري'),
  ('قَيد رَواتِب','صَرف رَواتِب الشَهر','monthly',1,'[{"acc":94,"debit":250000},{"acc":146,"credit":250000}]','RJ-PAY-001','رَواتِب شَهرية'),
  ('قَيد إهلاك','إهلاك شَهري للأُصول','monthly',1,'[{"acc":94,"debit":8000},{"acc":146,"credit":8000}]','RJ-DEP-001','إهلاك أُصول'),
  ('قَيد كَهرَباء','فاتورة كَهرَباء','monthly',10,'[{"acc":94,"debit":3500},{"acc":146,"credit":3500}]','RJ-ELC-001','كَهرَباء'),
  ('قَيد اشتِراك إنتِرنِت','اشتِراك إنتِرنِت','monthly',15,'[{"acc":94,"debit":1200},{"acc":146,"credit":1200}]','RJ-NET-001','إنتِرنِت')
) v(n,d,f,dd,tl,tr,td)
WHERE NOT EXISTS (SELECT 1 FROM recurring_journals WHERE name=v.n);

INSERT INTO accounting_allocation_rules ("companyId",name,"documentType","activityType","debitAccountId","creditAccountId","revenueAccountId","expenseAccountId",priority,"isActive")
SELECT 1, v.n, v.dt, v.at, 94, 146, 147, 149, v.p, true
FROM (VALUES
  ('قاعِدة فَواتير عُمرة','sales_invoice','umrah',10),
  ('قاعِدة مُشتَريات','purchase','procurement',20),
  ('قاعِدة رَواتِب','payroll','hr',30),
  ('قاعِدة إيجار عَقاري','rental','property',40),
  ('قاعِدة وَقود','expense','fleet',50)
) v(n,dt,at,p)
WHERE NOT EXISTS (SELECT 1 FROM accounting_allocation_rules WHERE name=v.n);

INSERT INTO intercompany_transactions (ref,"fromCompanyId","toCompanyId",amount,description,"transactionDate",status,"createdBy")
SELECT 'ICT-2026-'||LPAD(g::text,4,'0'), 1, ((g%3)+2)::int, (50000+g*10000)::numeric,
  'تَحويل بَيني '||g||' بَين الشَركات', CURRENT_DATE-(g*5), 'posted', 1
FROM generate_series(1,8) g
WHERE NOT EXISTS (SELECT 1 FROM intercompany_transactions WHERE ref='ICT-2026-'||LPAD(g::text,4,'0'));

-- fleet_preventive_plans + fleet_gps_tracking
INSERT INTO fleet_preventive_plans ("companyId","vehicleId","serviceType","intervalKm","intervalDays","lastServiceDate","lastServiceMileage","nextServiceDate","nextServiceMileage","estimatedCost",notes,status)
SELECT 1, v.id, st.t, st.km, st.d, CURRENT_DATE-30, 50000, CURRENT_DATE+st.d-30, 50000+st.km, st.c, 'صِيانة دَورية لِـ'||st.t, 'active'
FROM (SELECT id FROM fleet_vehicles WHERE "companyId"=1) v
CROSS JOIN (VALUES ('oil_change',5000,90,250),('tire_rotation',10000,180,150),('brake_check',20000,365,500)) st(t,km,d,c)
WHERE NOT EXISTS (SELECT 1 FROM fleet_preventive_plans WHERE "vehicleId"=v.id AND "serviceType"=st.t);

INSERT INTO fleet_gps_tracking ("vehicleId","driverId",latitude,longitude,speed,heading,"companyId","recordedAt")
SELECT v.id, 1, 24.7136+(random()*0.5-0.25), 46.6753+(random()*0.5-0.25), (random()*80)::numeric, (random()*360)::int, 1, NOW()-(g||' minutes')::interval
FROM (SELECT id FROM fleet_vehicles WHERE "companyId"=1) v
CROSS JOIN generate_series(1,5) g
WHERE NOT EXISTS (SELECT 1 FROM fleet_gps_tracking WHERE "vehicleId"=v.id AND speed=(random()*80)::numeric);

-- goods_receipt_items + project_resources + project_task_dependencies
INSERT INTO goods_receipt_items ("grnId","poItemId","itemName","receivedQty","unitPrice","lineTotal",notes)
SELECT gr.id, poi.id, 'صِنف '||poi.id, (10+poi.id*5)::numeric, (100+poi.id*50)::numeric, ((10+poi.id*5)*(100+poi.id*50))::numeric, 'استِلام كامِل'
FROM (SELECT id FROM goods_receipts WHERE "companyId"=1) gr
CROSS JOIN (SELECT id FROM purchase_order_items LIMIT 4) poi
WHERE NOT EXISTS (SELECT 1 FROM goods_receipt_items WHERE "grnId"=gr.id AND "poItemId"=poi.id);

INSERT INTO project_resources ("companyId","projectId","employeeId",role,"hoursAllocated","hoursSpent","startDate","endDate","allocatedHours","budgetAllocated")
SELECT 1, p.id, 1, (ARRAY['PM','Developer','Designer','QA'])[1+((p.id-1)%4)], 160, (80+p.id*5)::numeric, CURRENT_DATE-60, CURRENT_DATE+60, 160, (16000+p.id*500)::numeric
FROM (SELECT id FROM projects WHERE "companyId"=1 LIMIT 6) p
WHERE NOT EXISTS (SELECT 1 FROM project_resources WHERE "projectId"=p.id AND "employeeId"=1);

INSERT INTO project_task_dependencies ("taskId","dependsOnId")
SELECT t1.id, t2.id
FROM (SELECT id FROM project_tasks LIMIT 5) t1
CROSS JOIN (SELECT id FROM project_tasks ORDER BY id DESC LIMIT 2) t2
WHERE t1.id <> t2.id AND NOT EXISTS (SELECT 1 FROM project_task_dependencies WHERE "taskId"=t1.id AND "dependsOnId"=t2.id);

-- invoice_collection_stages + late_rent_actions
INSERT INTO invoice_collection_stages ("companyId","invoiceId",stage,"stageName",notes,"performedBy")
SELECT 1, i.id, g, (ARRAY['تَذكير وُدّي','مُكالَمة هاتِفية','إنذار قانوني','تَحويل لِلتَحصيل'])[g], 'مَرحَلة '||g, 1
FROM (SELECT id FROM invoices WHERE "companyId"=1 LIMIT 3) i
CROSS JOIN generate_series(1,3) g
WHERE NOT EXISTS (SELECT 1 FROM invoice_collection_stages WHERE "invoiceId"=i.id AND stage=g);

INSERT INTO late_rent_actions ("contractId",phase,action,notes)
SELECT 1, g, (ARRAY['sms','email','warning','legal'])[g], 'إجراء مَرحَلة '||g
FROM generate_series(1,4) g
WHERE NOT EXISTS (SELECT 1 FROM late_rent_actions WHERE "contractId"=1 AND phase=g);

-- governance_capa + policy_compliance_actions
INSERT INTO governance_capa ("companyId",finding,"rootCause","correctiveAction","preventiveAction","responsiblePerson","dueDate",status)
SELECT 1, v.f, v.rc, v.ca, v.pa, v.rp, CURRENT_DATE+v.dd, v.st
FROM (VALUES
  ('قُصور في تَوثيق الفَواتير','عَدَم وُجود سياسة','إنشاء دَليل تَوثيق','تَدريب الفَريق المالي','أَحمَد المُدير المالي',30,'open'),
  ('تَأخُّر في صَرف الرَواتِب','إشكال تَقني','تَحديث النِظام','صِيانة دَورية','سامي مُدير IT',15,'in_progress'),
  ('ضَعف في الرَقابة الداخِلية','نَقص كَوادِر','تَوظيف مُراجِع','بَرنامَج تَدقيق دَوري','خالِد مُدير المُراجَعة',60,'open'),
  ('عَدَم الالتِزام بالسَلامة','نَقص تَدريب','تَدريب OSHA','تَفتيش شَهري','يوسُف مَسؤول السَلامة',45,'in_progress'),
  ('ضَعف أَمن المَعلومات','كَلِمات مُرور ضَعيفة','تَطبيق 2FA','تَدريب أَمن سيبراني','عُمَر CISO',30,'open')
) v(f,rc,ca,pa,rp,dd,st)
WHERE NOT EXISTS (SELECT 1 FROM governance_capa WHERE finding=v.f);

INSERT INTO policy_compliance_actions ("companyId",title,regulation,description,owner,"dueDate",status,"createdBy")
SELECT 1, v.t, v.r, v.d, v.o, CURRENT_DATE+v.dd, v.s, 1
FROM (VALUES
  ('تَحديث سياسة الخُصوصية','PDPL','مُواءَمة مَع نِظام حِماية البَيانات','المُستَشار القانوني',30,'in_progress'),
  ('شَهادة ZATCA E-Invoicing','ZATCA','تَجديد شَهادة الفَوتَرة','المُحاسِب الرَئيسي',45,'open'),
  ('تَدريب الامتِثال السَنوي','SAGIA','تَدريب جَميع المُوظَّفين','HR Manager',60,'open'),
  ('مُراجَعة سياسات السَعوَدة','HRSD','نِسبة السَعوَدة 30%','HR Director',90,'in_progress'),
  ('تَحديث رُخصة البَلَدية','MOMRA','تَجديد سَنوي','الإداري',180,'open')
) v(t,r,d,o,dd,s)
WHERE NOT EXISTS (SELECT 1 FROM policy_compliance_actions WHERE title=v.t);

-- pricing_rules + conditions + actions
INSERT INTO pricing_rules ("companyId","branchId",name,description,priority,"validFrom","validTo",status,"logicOp","createdBy")
SELECT 1, 1, v.n, v.d, v.p, CURRENT_DATE-30, CURRENT_DATE+180, 'active', 'AND', 1
FROM (VALUES
  ('خَصم العُمَلاء VIP','خَصم 10% للعُمَلاء المُمَيَّزين',10),
  ('عَرض موسِم العُمرة','خَصم 15% لِحُجوزات رَمضان',20),
  ('شِراء بالجُملة','خَصم 5% أَكثَر مِن 10 وَحَدات',30),
  ('عَرض الفَيصَل','مَواد غِذائية بِسِعر مُخَفَّض',40)
) v(n,d,p)
WHERE NOT EXISTS (SELECT 1 FROM pricing_rules WHERE name=v.n);

INSERT INTO pricing_conditions ("ruleId",field,operator,value)
SELECT r.id, v.f, v.o, v.va
FROM (SELECT id FROM pricing_rules WHERE "companyId"=1) r
CROSS JOIN (VALUES ('client.tier','=','vip'),('order.qty','>=','10')) v(f,o,va)
WHERE NOT EXISTS (SELECT 1 FROM pricing_conditions WHERE "ruleId"=r.id AND field=v.f);

INSERT INTO pricing_actions ("ruleId","actionType",value,formula)
SELECT r.id, 'discount_percent', 10, NULL
FROM (SELECT id FROM pricing_rules WHERE "companyId"=1) r
WHERE NOT EXISTS (SELECT 1 FROM pricing_actions WHERE "ruleId"=r.id);

-- system_stops + print_template_assignments + print_jobs
INSERT INTO system_stops ("companyId",scope,reason,active,"activatedBy")
SELECT 1, v.s, v.r, false, 1
FROM (VALUES
  ('finance','صِيانة شَهرية مُجَدوَلة'),
  ('payroll','تَأجيل بِسَبَب مُراجَعة'),
  ('all','تَحديث نِظام كَبير')
) v(s,r)
WHERE NOT EXISTS (SELECT 1 FROM system_stops WHERE scope=v.s AND reason=v.r);

INSERT INTO print_template_assignments ("companyId","branchId","entityType","templateId","isDefault","createdBy")
SELECT 1, 1, v.et, v.tid, true, 1
FROM (VALUES ('invoice',1),('po',2),('receipt',3),('quote',4)) v(et,tid)
WHERE NOT EXISTS (SELECT 1 FROM print_template_assignments WHERE "entityType"=v.et);

INSERT INTO print_jobs ("companyId","branchId","userId","entityType","entityId",format,"paperSize","copyNumber",status,"createdAt")
SELECT 1, 1, 1, 'invoice', g::text, 'pdf', 'A4', 1, 'completed', NOW()-(g||' hours')::interval
FROM generate_series(1,8) g
WHERE NOT EXISTS (SELECT 1 FROM print_jobs WHERE "entityType"='invoice' AND "entityId"=g::text AND "copyNumber"=1);

-- lot_expiry_alerts + warehouse_cycle_counts + lines + serials
INSERT INTO lot_expiry_alerts ("companyId","lotId","thresholdDays","expiryDate")
SELECT 1, l.id, 30, CURRENT_DATE+(l.id*5)
FROM (SELECT id FROM warehouse_stock_lots WHERE "companyId"=1 LIMIT 6) l
WHERE NOT EXISTS (SELECT 1 FROM lot_expiry_alerts WHERE "lotId"=l.id);

INSERT INTO warehouse_cycle_counts ("companyId","warehouseId","scheduledDate",status,"countedBy",notes)
SELECT 1, w.id, CURRENT_DATE-(g*7), (ARRAY['pending','in_progress','approved'])[1+((g-1)%3)], 1, 'جَرد دَوري #'||g
FROM (SELECT id FROM warehouses WHERE "companyId"=1) w
CROSS JOIN generate_series(1,3) g
WHERE NOT EXISTS (SELECT 1 FROM warehouse_cycle_counts WHERE "warehouseId"=w.id AND "scheduledDate"=CURRENT_DATE-(g*7));

INSERT INTO warehouse_cycle_count_lines ("cycleCountId","productId","systemQuantity","countedQuantity",reason)
SELECT cc.id, wp.id, 100, (95+(wp.id*2)%10)::numeric, 'فَرق طَبيعي'
FROM (SELECT id FROM warehouse_cycle_counts WHERE "companyId"=1 LIMIT 3) cc
CROSS JOIN (SELECT id FROM warehouse_products WHERE "companyId"=1 LIMIT 4) wp
WHERE NOT EXISTS (SELECT 1 FROM warehouse_cycle_count_lines WHERE "cycleCountId"=cc.id AND "productId"=wp.id);

INSERT INTO warehouse_stock_serials ("companyId","branchId","productId","warehouseId","serialNumber",status)
SELECT 1, 1, wp.id, 1, 'SN-2026-'||LPAD((wp.id*10+g)::text,6,'0'), (ARRAY['in_stock','sold','reserved'])[1+((g-1)%3)]
FROM (SELECT id FROM warehouse_products WHERE "companyId"=1 LIMIT 5) wp
CROSS JOIN generate_series(1,3) g
WHERE NOT EXISTS (SELECT 1 FROM warehouse_stock_serials WHERE "serialNumber"='SN-2026-'||LPAD((wp.id*10+g)::text,6,'0'));

-- notification_webhooks + notification_fallback_chains
INSERT INTO notification_webhooks ("companyId",name,url,secret,events,headers,"createdBy")
SELECT 1, v.n, v.u, 'secret_'||v.n, v.e::jsonb, '{"X-Source":"ghayth-erp"}'::jsonb, 1
FROM (VALUES
  ('Slack Notifications','https://hooks.slack.com/services/T01/B01/xyz','["invoice.created","approval.required"]'),
  ('MS Teams','https://outlook.office.com/webhook/teams/...','["alert.critical","report.ready"]'),
  ('Custom CRM Webhook','https://crm.example.com/wh','["client.created","opportunity.won"]'),
  ('SMS Gateway','https://sms.gateway.sa/wh','["payment.received","leave.approved"]')
) v(n,u,e)
WHERE NOT EXISTS (SELECT 1 FROM notification_webhooks WHERE name=v.n);

INSERT INTO notification_fallback_chains ("companyId",name,description,steps,"createdBy")
SELECT 1, v.n, v.d, v.s::jsonb, 1
FROM (VALUES
  ('سِلسِلة الإشعارات العادية','بَريد ثُم SMS ثُم WhatsApp','[{"channel":"email","delayMin":0},{"channel":"sms","delayMin":15},{"channel":"whatsapp","delayMin":60}]'),
  ('سِلسِلة العاجِلة','SMS فَوري ثُم اتِّصال','[{"channel":"sms","delayMin":0},{"channel":"pbx_call","delayMin":5}]'),
  ('سِلسِلة الإدارية','بَريد ثُم تَنبيه نِظام','[{"channel":"email","delayMin":0},{"channel":"in_app","delayMin":30}]')
) v(n,d,s)
WHERE NOT EXISTS (SELECT 1 FROM notification_fallback_chains WHERE name=v.n);

-- applicant_accounts + client_portal_accounts
INSERT INTO applicant_accounts (name,email,phone,"passwordHash","nationalId",gender,"dateOfBirth",city,education,"experienceYears",skills)
SELECT v.n, v.e, v.p, '$2b$10$dummyHash', v.nid, v.g, v.dob::date, v.c, v.ed, v.ey, v.s::jsonb
FROM (VALUES
  ('أحمَد العَتيبي','ahmed@apply.com','0501110001','1098765432','M','1995-03-15','الرياض','بَكالوريوس حاسِب',5,'["React","Node","SQL"]'),
  ('سارة القَحطاني','sara@apply.com','0501110002','1098765433','F','1998-07-20','جدة','ماجِستير إدارة',3,'["Marketing","CRM","Excel"]'),
  ('خالِد الزَهراني','khalid@apply.com','0501110003','1098765434','M','1992-11-05','الدمام','بَكالوريوس مُحاسَبة',8,'["SAP","IFRS","Audit"]'),
  ('نورة الشَمري','nora@apply.com','0501110004','1098765435','F','2000-02-28','الخُبر','بَكالوريوس HR',2,'["Recruiting","Training"]'),
  ('فَيصَل المُطَيري','faisal@apply.com','0501110005','1098765436','M','1990-09-12','الرياض','دكتوراه IT',12,'["Architecture","Cloud","Security"]'),
  ('مُنيرة الحَربي','muneera@apply.com','0501110006','1098765437','F','1996-05-30','مَكَّة','بَكالوريوس عُمرة',4,'["Tourism","Arabic","English"]'),
  ('عَبدالله الغامِدي','abdullah@apply.com','0501110007','1098765438','M','1988-12-18','المَدينة','دبلوم سَواقة',15,'["Driving","Routes","Safety"]'),
  ('هَنَد العُمَري','hanad@apply.com','0501110008','1098765439','F','2001-08-22','الطائف','ثانوية',1,'["Customer Service"]')
) v(n,e,p,nid,g,dob,c,ed,ey,s)
WHERE NOT EXISTS (SELECT 1 FROM applicant_accounts WHERE email=v.e);

INSERT INTO client_portal_accounts ("clientId","companyId",email,"passwordHash","isActive","mustChangePassword","tokenVersion")
SELECT c.id, 1, 'portal'||c.id||'@client.com', '$2b$10$dummyHash', true, false, 1
FROM (SELECT id FROM clients WHERE "companyId"=1 LIMIT 8) c
WHERE NOT EXISTS (SELECT 1 FROM client_portal_accounts WHERE "clientId"=c.id);

-- data_access_requests (PDPL)
INSERT INTO data_access_requests ("companyId","requestType","requesterId","requesterName","requesterEmail",status,notes,"dueDate")
SELECT 1, v.rt, NULL, v.rn, v.re, v.s, v.n, CURRENT_DATE+30
FROM (VALUES
  ('access','أحمَد العَتيبي','ahmed@req.com','pending','طَلَب الاطِّلاع على بَيانات شَخصية'),
  ('deletion','سارة القَحطاني','sara@req.com','in_progress','طَلَب حَذف بَيانات قَديمة'),
  ('correction','خالِد الزَهراني','khalid@req.com','completed','تَصحيح رَقم الجَوّال'),
  ('portability','نورة الشَمري','nora@req.com','pending','تَصدير البَيانات بِصيغة JSON'),
  ('objection','فَيصَل المُطَيري','faisal@req.com','rejected','اعتِراض على مُعالَجة')
) v(rt,rn,re,s,n)
WHERE NOT EXISTS (SELECT 1 FROM data_access_requests WHERE "requesterEmail"=v.re);

-- gov_integration_links + import_batches + store_orders + store_order_items + pbx_calls + supplier_payment_allocations
INSERT INTO gov_integration_links ("integrationId","companyId","entityType","entityId","externalRef","syncStatus",enabled,notes)
SELECT g, 1, t.et, t.eid, t.ref, 'synced', true, 'مَربوط مَع جِهة حُكومية'
FROM generate_series(1,3) g
CROSS JOIN (VALUES ('employee',1,'IQAMA-2078901234'),('vehicle',1,'PLATE-ABC1234'),('client',1,'CR-1010123456')) t(et,eid,ref)
WHERE NOT EXISTS (SELECT 1 FROM gov_integration_links WHERE "integrationId"=g AND "entityId"=t.eid AND "entityType"=t.et);

INSERT INTO import_batches ("companyId","branchId","entityKey","fileName","fileSize","uploadedBy","totalRows","newCount","updatedCount","skippedCount","errorCount",status)
SELECT 1, 1, v.ek, v.fn, 50000+g*1000, 1, 100+g*10, 80+g*5, 15+g*2, 3, 2, v.s
FROM generate_series(1,6) g
CROSS JOIN LATERAL (VALUES
  ('employees','employees-2026-q1.xlsx','completed'),
  ('clients','clients-import.csv','completed'),
  ('invoices','invoices-march.xlsx','partial'),
  ('products','catalog-update.csv','completed'),
  ('chart_of_accounts','coa-2026.xlsx','completed'),
  ('umrah_pilgrims','mutamers-batch-1.xlsx','failed')
) v(ek,fn,s)
WHERE NOT EXISTS (SELECT 1 FROM import_batches WHERE "fileName"=v.fn||g);

INSERT INTO store_orders ("orderNumber","customerName","customerPhone",status,"totalAmount",items,notes,"companyId","branchId")
SELECT 'ORD-2026-'||LPAD(g::text,5,'0'), v.cn, v.cp, v.s, v.amt::numeric, '[]'::jsonb, 'طَلَب أونلاين', 1, 1
FROM generate_series(1,8) g
CROSS JOIN LATERAL (VALUES
  ('أحمَد العَلي','0501230001','pending',850),
  ('سارة الخالد','0501230002','paid',1250),
  ('فَيصَل العُمَري','0501230003','shipped',3400),
  ('نورة المُحَمَّد','0501230004','delivered',590),
  ('مُحَمَّد السُلطان','0501230005','paid',2150),
  ('هند الحَربي','0501230006','pending',780),
  ('خالِد الزَهراني','0501230007','delivered',1670),
  ('مُنيرة العُتَيبي','0501230008','cancelled',420)
) v(cn,cp,s,amt)
WHERE NOT EXISTS (SELECT 1 FROM store_orders WHERE "orderNumber"='ORD-2026-'||LPAD(g::text,5,'0'));

INSERT INTO store_order_items ("orderId","productId","productName",quantity,"unitPrice",total)
SELECT o.id, p.id, p.name, (1+(p.id%3))::numeric, p."unitPrice", ((1+(p.id%3))*p."unitPrice")::numeric
FROM (SELECT id FROM store_orders LIMIT 5) o
CROSS JOIN (SELECT id,name,"unitPrice" FROM products LIMIT 3) p
WHERE NOT EXISTS (SELECT 1 FROM store_order_items WHERE "orderId"=o.id AND "productId"=p.id);

INSERT INTO pbx_calls ("companyId","callId","callerNumber","calledNumber",direction,duration,status,"answeredBy")
SELECT 1, 'CALL-'||LPAD(g::text,8,'0'),
  '+9665012'||LPAD(g::text,5,'0'), '+966114567890',
  (ARRAY['inbound','outbound'])[1+(g%2)],
  60+g*30,
  (ARRAY['answered','missed','voicemail'])[1+(g%3)],
  CASE WHEN g%2=0 THEN 1 ELSE NULL END
FROM generate_series(1,20) g
WHERE NOT EXISTS (SELECT 1 FROM pbx_calls WHERE "callId"='CALL-'||LPAD(g::text,8,'0'));

-- ============================================================
-- v3.1 hotfix: /finance/expenses تَقرأ مِن journal_entries WHERE ref LIKE 'EXP%'
-- ============================================================
WITH rows_to_insert(g, dsc, st, cc, pm, paid, et, ot, apprv) AS (VALUES
  (1::int,'مَصاريف ضيافة اجتِماع','posted','إدارة','cash',true,'general','expense','approved'),
  (2,'فاتورة كَهرَباء يَناير','posted','عامّ','bank_transfer',true,'utilities','expense','approved'),
  (3,'فاتورة إنتِرنِت ومُكالَمات','posted','تِقنية','bank_transfer',true,'utilities','expense','approved'),
  (4,'وَقود سَيارات','posted','أُسطول','cash',true,'fuel','expense','approved'),
  (5,'صِيانة مَركَبات','draft','أُسطول','bank_transfer',false,'maintenance','maintenance','draft'),
  (6,'قِرطاسية ومَكتَبية','posted','إدارة','cash',true,'general','expense','approved'),
  (7,'إعلانات وتَسويق','posted','تَسويق','bank_transfer',true,'marketing','expense','approved'),
  (8,'إيجار مَكتَب','posted','إدارة','bank_transfer',true,'rent','rent','approved'),
  (9,'سُلفة مُوظَّف – أحمَد','draft','مَوارِد بَشَرية','bank_transfer',false,'general','advance','pending_review'),
  (10,'تَأمين طِبي للمُوظَّفين','posted','مَوارِد بَشَرية','bank_transfer',true,'insurance','insurance','approved'),
  (11,'أتعاب قانونية','posted','قانوني','bank_transfer',true,'legal_fee','legal_fee','approved'),
  (12,'فاتورة مُورِّد عام','posted','مُشتَريات','bank_transfer',true,'general','vendor_invoice','approved'),
  (13,'تَجديد إقامة عامِل','posted','مَوارِد بَشَرية','bank_transfer',true,'general','iqama_renewal','approved'),
  (14,'تَجديد استِمارة','draft','أُسطول','cash',false,'general','vehicle_registration','pending_review'),
  (15,'فَحص دَوري سَيارة','posted','أُسطول','cash',true,'general','vehicle_inspection','approved')
),
new_je AS (
  INSERT INTO journal_entries ("companyId","branchId",ref,description,"createdBy",date,type,status,"costCenter","paymentMethod","isPaid","expenseType","operationType","approvalStatus")
  SELECT 1, 1, 'EXP-2026-'||LPAD(r.g::text,5,'0'), r.dsc, 1, CURRENT_DATE-(r.g*2), 'expense', r.st, r.cc, r.pm, r.paid, r.et, r.ot, r.apprv
  FROM rows_to_insert r
  WHERE NOT EXISTS (SELECT 1 FROM journal_entries WHERE ref='EXP-2026-'||LPAD(r.g::text,5,'0'))
  RETURNING id
),
ins_d AS (
  INSERT INTO journal_lines ("journalId","accountCode",debit,credit,description)
  SELECT id, '5101', ((id*150)%5000+500)::numeric, 0, 'مَدين: مَصروف' FROM new_je RETURNING 1
)
INSERT INTO journal_lines ("journalId","accountCode",debit,credit,description)
SELECT id, '1101', 0, ((id*150)%5000+500)::numeric, 'دائِن: نَقد' FROM new_je;
