-- ===========================================================================
-- Migration 253: Comprehensive bilingual notification templates
-- ---------------------------------------------------------------------------
-- Closes the template-library gap: previously only 13 in_app + 2 email rows
-- seeded, with zero SMS / WhatsApp / English coverage. This seeds the full
-- 4-channel × 2-language matrix for ~50 operational events spanning HR,
-- finance, support, operations, fleet, CRM, and admin domains.
--
-- Per-event row count: 4 channels (in_app, email, sms, whatsapp) × 2
-- languages (ar, en) = 8 rows. Seed touches every company in `companies`,
-- skipping any (company, templateKey, channel, language) already present.
--
-- @rollback: pure seed of notification_templates with WHERE NOT EXISTS — to
-- undo, delete the seeded rows by templateKey set:
--   DELETE FROM notification_templates WHERE "templateKey" IN
--     ('leave.request.created', 'leave.request.approved', ...) AND
--     "isDefault" = true;
-- The migration is idempotent (re-running is a no-op), so a partial state
-- can be repaired by re-running it.
-- ===========================================================================

INSERT INTO notification_templates
  ("companyId", "templateKey", channel, language, "titleTemplate", "bodyTemplate", variables, "isActive", "isDefault")
SELECT c.id, t."templateKey", t.channel, t.language, t."titleTemplate", t."bodyTemplate", t.variables::jsonb, true, true
FROM companies c
CROSS JOIN (VALUES
  -- =====================================================================
  -- HR — LEAVE
  -- =====================================================================
  ('leave.request.created', 'in_app', 'ar', 'طلب إجازة جديد', 'تم تقديم طلب إجازة من {{employeeName}} — {{leaveType}} من {{startDate}} إلى {{endDate}}', '["employeeName","leaveType","startDate","endDate"]'),
  ('leave.request.created', 'in_app', 'en', 'New leave request', 'A leave request was submitted by {{employeeName}} — {{leaveType}} from {{startDate}} to {{endDate}}', '["employeeName","leaveType","startDate","endDate"]'),
  ('leave.request.created', 'email', 'ar', 'طلب إجازة جديد (New leave request)', '<p>تم تقديم طلب إجازة من <strong>{{employeeName}}</strong></p><p>النوع: {{leaveType}} — من {{startDate}} إلى {{endDate}}</p><p>يرجى مراجعة الطلب في النظام.</p>', '["employeeName","leaveType","startDate","endDate"]'),
  ('leave.request.created', 'email', 'en', 'New leave request', '<p>A leave request was submitted by <strong>{{employeeName}}</strong></p><p>Type: {{leaveType}} — from {{startDate}} to {{endDate}}</p><p>Please review the request in the system.</p>', '["employeeName","leaveType","startDate","endDate"]'),
  ('leave.request.created', 'sms', 'ar', NULL, 'طلب إجازة جديد من {{employeeName}} ({{leaveType}}) من {{startDate}} إلى {{endDate}}', '["employeeName","leaveType","startDate","endDate"]'),
  ('leave.request.created', 'sms', 'en', NULL, 'New leave request from {{employeeName}} ({{leaveType}}) {{startDate}} to {{endDate}}', '["employeeName","leaveType","startDate","endDate"]'),
  ('leave.request.created', 'whatsapp', 'ar', NULL, '*طلب إجازة جديد*\nالموظف: {{employeeName}}\nالنوع: {{leaveType}}\nمن: {{startDate}}\nإلى: {{endDate}}', '["employeeName","leaveType","startDate","endDate"]'),
  ('leave.request.created', 'whatsapp', 'en', NULL, '*New leave request*\nEmployee: {{employeeName}}\nType: {{leaveType}}\nFrom: {{startDate}}\nTo: {{endDate}}', '["employeeName","leaveType","startDate","endDate"]'),

  ('leave.request.approved', 'in_app', 'ar', 'تمت الموافقة على إجازتك', 'تمت الموافقة على طلب إجازتك {{leaveType}} من {{startDate}} إلى {{endDate}}', '["leaveType","startDate","endDate"]'),
  ('leave.request.approved', 'in_app', 'en', 'Your leave was approved', 'Your {{leaveType}} leave from {{startDate}} to {{endDate}} has been approved', '["leaveType","startDate","endDate"]'),
  ('leave.request.approved', 'email', 'ar', 'تمت الموافقة على طلب إجازتك (Leave approved)', '<p>تمت الموافقة على طلب إجازتك <strong>{{leaveType}}</strong> من {{startDate}} إلى {{endDate}}.</p>', '["leaveType","startDate","endDate"]'),
  ('leave.request.approved', 'email', 'en', 'Your leave has been approved', '<p>Your <strong>{{leaveType}}</strong> leave from {{startDate}} to {{endDate}} has been approved.</p>', '["leaveType","startDate","endDate"]'),
  ('leave.request.approved', 'sms', 'ar', NULL, 'تمت الموافقة على إجازتك {{leaveType}} من {{startDate}} إلى {{endDate}}', '["leaveType","startDate","endDate"]'),
  ('leave.request.approved', 'sms', 'en', NULL, 'Your {{leaveType}} leave {{startDate}}–{{endDate}} approved', '["leaveType","startDate","endDate"]'),
  ('leave.request.approved', 'whatsapp', 'ar', NULL, '✅ *تمت الموافقة على إجازتك*\nالنوع: {{leaveType}}\nمن: {{startDate}}\nإلى: {{endDate}}', '["leaveType","startDate","endDate"]'),
  ('leave.request.approved', 'whatsapp', 'en', NULL, '✅ *Leave approved*\nType: {{leaveType}}\nFrom: {{startDate}}\nTo: {{endDate}}', '["leaveType","startDate","endDate"]'),

  ('leave.request.rejected', 'in_app', 'ar', 'تم رفض طلب إجازتك', 'تم رفض طلب إجازتك {{leaveType}}. السبب: {{reason}}', '["leaveType","reason"]'),
  ('leave.request.rejected', 'in_app', 'en', 'Your leave was rejected', 'Your {{leaveType}} leave was rejected. Reason: {{reason}}', '["leaveType","reason"]'),
  ('leave.request.rejected', 'email', 'ar', 'تم رفض طلب إجازتك (Leave rejected)', '<p>نأسف لإبلاغك بأن طلب إجازتك <strong>{{leaveType}}</strong> قد تم رفضه.</p><p>السبب: {{reason}}</p>', '["leaveType","reason"]'),
  ('leave.request.rejected', 'email', 'en', 'Your leave was rejected', '<p>We regret to inform you that your <strong>{{leaveType}}</strong> leave has been rejected.</p><p>Reason: {{reason}}</p>', '["leaveType","reason"]'),
  ('leave.request.rejected', 'sms', 'ar', NULL, 'تم رفض إجازتك {{leaveType}}. السبب: {{reason}}', '["leaveType","reason"]'),
  ('leave.request.rejected', 'sms', 'en', NULL, 'Your {{leaveType}} leave rejected. Reason: {{reason}}', '["leaveType","reason"]'),
  ('leave.request.rejected', 'whatsapp', 'ar', NULL, '❌ *تم رفض طلب إجازتك*\nالنوع: {{leaveType}}\nالسبب: {{reason}}', '["leaveType","reason"]'),
  ('leave.request.rejected', 'whatsapp', 'en', NULL, '❌ *Leave rejected*\nType: {{leaveType}}\nReason: {{reason}}', '["leaveType","reason"]'),

  -- =====================================================================
  -- HR — PAYROLL
  -- =====================================================================
  ('payroll.ready', 'in_app', 'ar', 'كشف الراتب جاهز', 'كشف راتب شهر {{month}} جاهز للمراجعة — المبلغ: {{amount}} ريال', '["month","amount"]'),
  ('payroll.ready', 'in_app', 'en', 'Payslip ready', 'Your payslip for {{month}} is ready — amount: SAR {{amount}}', '["month","amount"]'),
  ('payroll.ready', 'email', 'ar', 'كشف راتبك جاهز (Payslip ready)', '<p>كشف راتب شهر <strong>{{month}}</strong> جاهز للمراجعة.</p><p>المبلغ: <strong>{{amount}} ريال</strong></p>', '["month","amount"]'),
  ('payroll.ready', 'email', 'en', 'Your payslip is ready', '<p>Your payslip for <strong>{{month}}</strong> is ready.</p><p>Amount: <strong>SAR {{amount}}</strong></p>', '["month","amount"]'),
  ('payroll.ready', 'sms', 'ar', NULL, 'كشف راتب {{month}} جاهز — {{amount}} ريال', '["month","amount"]'),
  ('payroll.ready', 'sms', 'en', NULL, 'Payslip for {{month}} ready — SAR {{amount}}', '["month","amount"]'),
  ('payroll.ready', 'whatsapp', 'ar', NULL, '💰 *كشف راتبك جاهز*\nالشهر: {{month}}\nالمبلغ: {{amount}} ريال', '["month","amount"]'),
  ('payroll.ready', 'whatsapp', 'en', NULL, '💰 *Payslip ready*\nMonth: {{month}}\nAmount: SAR {{amount}}', '["month","amount"]'),

  ('payroll.paid', 'in_app', 'ar', 'تم صرف راتبك', 'تم صرف راتب شهر {{month}} ({{amount}} ريال) إلى حسابك البنكي', '["month","amount"]'),
  ('payroll.paid', 'in_app', 'en', 'Salary paid', 'Your {{month}} salary (SAR {{amount}}) has been transferred to your bank account', '["month","amount"]'),
  ('payroll.paid', 'email', 'ar', 'تم صرف راتبك (Salary paid)', '<p>تم تحويل راتب شهر <strong>{{month}}</strong> ({{amount}} ريال) إلى حسابك البنكي.</p>', '["month","amount"]'),
  ('payroll.paid', 'email', 'en', 'Your salary has been paid', '<p>Your <strong>{{month}}</strong> salary (SAR {{amount}}) has been transferred to your bank account.</p>', '["month","amount"]'),
  ('payroll.paid', 'sms', 'ar', NULL, 'تم صرف راتب {{month}} ({{amount}} ر.س) لحسابك', '["month","amount"]'),
  ('payroll.paid', 'sms', 'en', NULL, '{{month}} salary SAR {{amount}} sent to your account', '["month","amount"]'),
  ('payroll.paid', 'whatsapp', 'ar', NULL, '✅ *تم صرف الراتب*\nالشهر: {{month}}\nالمبلغ: {{amount}} ريال', '["month","amount"]'),
  ('payroll.paid', 'whatsapp', 'en', NULL, '✅ *Salary paid*\nMonth: {{month}}\nAmount: SAR {{amount}}', '["month","amount"]'),

  -- =====================================================================
  -- HR — ATTENDANCE
  -- =====================================================================
  ('attendance.late', 'in_app', 'ar', 'تنبيه تأخير', 'تم تسجيل تأخير {{minutes}} دقيقة للموظف {{employeeName}}', '["minutes","employeeName"]'),
  ('attendance.late', 'in_app', 'en', 'Late attendance alert', '{{employeeName}} arrived {{minutes}} minutes late', '["minutes","employeeName"]'),
  ('attendance.late', 'email', 'ar', 'تنبيه تأخير (Late attendance)', '<p>تم تسجيل تأخير قدره <strong>{{minutes}} دقيقة</strong> للموظف <strong>{{employeeName}}</strong>.</p>', '["minutes","employeeName"]'),
  ('attendance.late', 'email', 'en', 'Late attendance alert', '<p>Employee <strong>{{employeeName}}</strong> arrived <strong>{{minutes}} minutes</strong> late.</p>', '["minutes","employeeName"]'),
  ('attendance.late', 'sms', 'ar', NULL, 'تأخير {{minutes}} دقيقة — {{employeeName}}', '["minutes","employeeName"]'),
  ('attendance.late', 'sms', 'en', NULL, 'Late {{minutes}} min — {{employeeName}}', '["minutes","employeeName"]'),
  ('attendance.late', 'whatsapp', 'ar', NULL, '⏰ *تنبيه تأخير*\nالموظف: {{employeeName}}\nالتأخير: {{minutes}} دقيقة', '["minutes","employeeName"]'),
  ('attendance.late', 'whatsapp', 'en', NULL, '⏰ *Late attendance*\nEmployee: {{employeeName}}\nLateness: {{minutes}} min', '["minutes","employeeName"]'),

  ('attendance.absent', 'in_app', 'ar', 'غياب بدون إذن', 'تم تسجيل غياب بدون إذن للموظف {{employeeName}} بتاريخ {{date}}', '["employeeName","date"]'),
  ('attendance.absent', 'in_app', 'en', 'Unexcused absence', '{{employeeName}} was marked absent without leave on {{date}}', '["employeeName","date"]'),
  ('attendance.absent', 'email', 'ar', 'غياب بدون إذن (Unexcused absence)', '<p>تم تسجيل غياب بدون إذن للموظف <strong>{{employeeName}}</strong> بتاريخ {{date}}.</p>', '["employeeName","date"]'),
  ('attendance.absent', 'email', 'en', 'Unexcused absence', '<p>Employee <strong>{{employeeName}}</strong> was marked absent without leave on {{date}}.</p>', '["employeeName","date"]'),
  ('attendance.absent', 'sms', 'ar', NULL, 'غياب بدون إذن — {{employeeName}} ({{date}})', '["employeeName","date"]'),
  ('attendance.absent', 'sms', 'en', NULL, 'Absent — {{employeeName}} ({{date}})', '["employeeName","date"]'),
  ('attendance.absent', 'whatsapp', 'ar', NULL, '⚠️ *غياب بدون إذن*\nالموظف: {{employeeName}}\nالتاريخ: {{date}}', '["employeeName","date"]'),
  ('attendance.absent', 'whatsapp', 'en', NULL, '⚠️ *Unexcused absence*\nEmployee: {{employeeName}}\nDate: {{date}}', '["employeeName","date"]'),

  -- =====================================================================
  -- HR — OFFICIAL LETTERS
  -- =====================================================================
  ('letter.issued', 'in_app', 'ar', 'خطاب رسمي جاهز', 'الخطاب الرسمي #{{letterNumber}} ({{letterType}}) جاهز للاستلام', '["letterNumber","letterType"]'),
  ('letter.issued', 'in_app', 'en', 'Official letter issued', 'Official letter #{{letterNumber}} ({{letterType}}) is ready', '["letterNumber","letterType"]'),
  ('letter.issued', 'email', 'ar', 'خطاب رسمي جاهز (Official letter)', '<p>الخطاب الرسمي رقم <strong>#{{letterNumber}}</strong> ({{letterType}}) جاهز للاستلام.</p>', '["letterNumber","letterType"]'),
  ('letter.issued', 'email', 'en', 'Official letter issued', '<p>Official letter <strong>#{{letterNumber}}</strong> ({{letterType}}) is ready for collection.</p>', '["letterNumber","letterType"]'),
  ('letter.issued', 'sms', 'ar', NULL, 'الخطاب #{{letterNumber}} ({{letterType}}) جاهز', '["letterNumber","letterType"]'),
  ('letter.issued', 'sms', 'en', NULL, 'Letter #{{letterNumber}} ({{letterType}}) ready', '["letterNumber","letterType"]'),
  ('letter.issued', 'whatsapp', 'ar', NULL, '📄 *خطاب رسمي جاهز*\nالرقم: #{{letterNumber}}\nالنوع: {{letterType}}', '["letterNumber","letterType"]'),
  ('letter.issued', 'whatsapp', 'en', NULL, '📄 *Letter ready*\nNumber: #{{letterNumber}}\nType: {{letterType}}', '["letterNumber","letterType"]'),

  -- =====================================================================
  -- HR — CONTRACT / DOCUMENT EXPIRY
  -- =====================================================================
  ('contract.expiring', 'in_app', 'ar', 'عقد يقترب من الانتهاء', 'العقد #{{contractNumber}} ينتهي في {{expiryDate}}', '["contractNumber","expiryDate"]'),
  ('contract.expiring', 'in_app', 'en', 'Contract expiring', 'Contract #{{contractNumber}} expires on {{expiryDate}}', '["contractNumber","expiryDate"]'),
  ('contract.expiring', 'email', 'ar', 'عقد يقترب من الانتهاء (Contract expiring)', '<p>العقد رقم <strong>#{{contractNumber}}</strong> ينتهي بتاريخ <strong>{{expiryDate}}</strong>. يرجى اتخاذ الإجراء المناسب.</p>', '["contractNumber","expiryDate"]'),
  ('contract.expiring', 'email', 'en', 'Contract expiring soon', '<p>Contract <strong>#{{contractNumber}}</strong> expires on <strong>{{expiryDate}}</strong>. Please take action.</p>', '["contractNumber","expiryDate"]'),
  ('contract.expiring', 'sms', 'ar', NULL, 'العقد #{{contractNumber}} ينتهي {{expiryDate}}', '["contractNumber","expiryDate"]'),
  ('contract.expiring', 'sms', 'en', NULL, 'Contract #{{contractNumber}} expires {{expiryDate}}', '["contractNumber","expiryDate"]'),
  ('contract.expiring', 'whatsapp', 'ar', NULL, '⚠️ *عقد قريب الانتهاء*\nالرقم: #{{contractNumber}}\nتاريخ الانتهاء: {{expiryDate}}', '["contractNumber","expiryDate"]'),
  ('contract.expiring', 'whatsapp', 'en', NULL, '⚠️ *Contract expiring*\nNumber: #{{contractNumber}}\nExpires: {{expiryDate}}', '["contractNumber","expiryDate"]'),

  ('document.expiring', 'in_app', 'ar', 'وثيقة قاربت على الانتهاء', 'الوثيقة {{documentType}} ({{documentNumber}}) تنتهي في {{expiryDate}}', '["documentType","documentNumber","expiryDate"]'),
  ('document.expiring', 'in_app', 'en', 'Document expiring', '{{documentType}} ({{documentNumber}}) expires on {{expiryDate}}', '["documentType","documentNumber","expiryDate"]'),
  ('document.expiring', 'email', 'ar', 'وثيقة قاربت على الانتهاء (Document expiring)', '<p>الوثيقة <strong>{{documentType}}</strong> رقم <strong>{{documentNumber}}</strong> تنتهي بتاريخ {{expiryDate}}. يرجى التجديد قبل انتهاء الصلاحية.</p>', '["documentType","documentNumber","expiryDate"]'),
  ('document.expiring', 'email', 'en', 'Document expiring soon', '<p>Document <strong>{{documentType}}</strong> #{{documentNumber}} expires on {{expiryDate}}. Please renew before expiry.</p>', '["documentType","documentNumber","expiryDate"]'),
  ('document.expiring', 'sms', 'ar', NULL, '{{documentType}} ينتهي {{expiryDate}}', '["documentType","expiryDate"]'),
  ('document.expiring', 'sms', 'en', NULL, '{{documentType}} expires {{expiryDate}}', '["documentType","expiryDate"]'),
  ('document.expiring', 'whatsapp', 'ar', NULL, '📋 *وثيقة تنتهي قريباً*\nالنوع: {{documentType}}\nالرقم: {{documentNumber}}\nتاريخ الانتهاء: {{expiryDate}}', '["documentType","documentNumber","expiryDate"]'),
  ('document.expiring', 'whatsapp', 'en', NULL, '📋 *Document expiring*\nType: {{documentType}}\nNumber: {{documentNumber}}\nExpires: {{expiryDate}}', '["documentType","documentNumber","expiryDate"]'),

  -- =====================================================================
  -- HR — OVERTIME / EXIT / LOAN / DISCIPLINE
  -- =====================================================================
  ('overtime.request.created', 'in_app', 'ar', 'طلب وقت إضافي', 'تم تقديم طلب وقت إضافي من {{employeeName}} ({{hours}} ساعة) بتاريخ {{date}}', '["employeeName","hours","date"]'),
  ('overtime.request.created', 'in_app', 'en', 'Overtime request', '{{employeeName}} requested overtime ({{hours}} hours) for {{date}}', '["employeeName","hours","date"]'),
  ('overtime.request.created', 'email', 'ar', 'طلب وقت إضافي (Overtime request)', '<p>طلب وقت إضافي من <strong>{{employeeName}}</strong> ({{hours}} ساعة) بتاريخ {{date}}.</p>', '["employeeName","hours","date"]'),
  ('overtime.request.created', 'email', 'en', 'Overtime request', '<p>{{employeeName}} requested <strong>{{hours}} hours</strong> overtime for {{date}}.</p>', '["employeeName","hours","date"]'),
  ('overtime.request.created', 'sms', 'ar', NULL, 'وقت إضافي: {{employeeName}} {{hours}}س ({{date}})', '["employeeName","hours","date"]'),
  ('overtime.request.created', 'sms', 'en', NULL, 'Overtime: {{employeeName}} {{hours}}h ({{date}})', '["employeeName","hours","date"]'),
  ('overtime.request.created', 'whatsapp', 'ar', NULL, '⏱️ *طلب وقت إضافي*\nالموظف: {{employeeName}}\nالساعات: {{hours}}\nالتاريخ: {{date}}', '["employeeName","hours","date"]'),
  ('overtime.request.created', 'whatsapp', 'en', NULL, '⏱️ *Overtime request*\nEmployee: {{employeeName}}\nHours: {{hours}}\nDate: {{date}}', '["employeeName","hours","date"]'),

  ('loan.request.created', 'in_app', 'ar', 'طلب قرض جديد', 'تم تقديم طلب قرض من {{employeeName}} بمبلغ {{amount}} ريال', '["employeeName","amount"]'),
  ('loan.request.created', 'in_app', 'en', 'Loan request', '{{employeeName}} requested a loan of SAR {{amount}}', '["employeeName","amount"]'),
  ('loan.request.created', 'email', 'ar', 'طلب قرض جديد (Loan request)', '<p>طلب قرض جديد من <strong>{{employeeName}}</strong> بمبلغ <strong>{{amount}} ريال</strong>.</p>', '["employeeName","amount"]'),
  ('loan.request.created', 'email', 'en', 'New loan request', '<p>Loan request from <strong>{{employeeName}}</strong> for <strong>SAR {{amount}}</strong>.</p>', '["employeeName","amount"]'),
  ('loan.request.created', 'sms', 'ar', NULL, 'طلب قرض: {{employeeName}} ({{amount}} ر.س)', '["employeeName","amount"]'),
  ('loan.request.created', 'sms', 'en', NULL, 'Loan request: {{employeeName}} (SAR {{amount}})', '["employeeName","amount"]'),
  ('loan.request.created', 'whatsapp', 'ar', NULL, '💵 *طلب قرض جديد*\nالموظف: {{employeeName}}\nالمبلغ: {{amount}} ريال', '["employeeName","amount"]'),
  ('loan.request.created', 'whatsapp', 'en', NULL, '💵 *Loan request*\nEmployee: {{employeeName}}\nAmount: SAR {{amount}}', '["employeeName","amount"]'),

  ('exit.request.created', 'in_app', 'ar', 'طلب إخلاء طرف', 'تم تقديم طلب إخلاء طرف من {{employeeName}} — تاريخ آخر يوم: {{lastDay}}', '["employeeName","lastDay"]'),
  ('exit.request.created', 'in_app', 'en', 'Exit request', '{{employeeName}} submitted an exit request — last day: {{lastDay}}', '["employeeName","lastDay"]'),
  ('exit.request.created', 'email', 'ar', 'طلب إخلاء طرف (Exit request)', '<p>طلب إخلاء طرف من <strong>{{employeeName}}</strong>. تاريخ آخر يوم عمل: <strong>{{lastDay}}</strong>.</p>', '["employeeName","lastDay"]'),
  ('exit.request.created', 'email', 'en', 'Exit request submitted', '<p>Exit request from <strong>{{employeeName}}</strong>. Last working day: <strong>{{lastDay}}</strong>.</p>', '["employeeName","lastDay"]'),
  ('exit.request.created', 'sms', 'ar', NULL, 'إخلاء طرف: {{employeeName}} ({{lastDay}})', '["employeeName","lastDay"]'),
  ('exit.request.created', 'sms', 'en', NULL, 'Exit request: {{employeeName}} ({{lastDay}})', '["employeeName","lastDay"]'),
  ('exit.request.created', 'whatsapp', 'ar', NULL, '🚪 *طلب إخلاء طرف*\nالموظف: {{employeeName}}\nآخر يوم: {{lastDay}}', '["employeeName","lastDay"]'),
  ('exit.request.created', 'whatsapp', 'en', NULL, '🚪 *Exit request*\nEmployee: {{employeeName}}\nLast day: {{lastDay}}', '["employeeName","lastDay"]'),

  ('discipline.memo.issued', 'in_app', 'ar', 'مذكرة تأديبية', 'صدرت مذكرة تأديبية ({{severity}}) للموظف {{employeeName}} — السبب: {{reason}}', '["severity","employeeName","reason"]'),
  ('discipline.memo.issued', 'in_app', 'en', 'Disciplinary memo', 'Disciplinary memo ({{severity}}) issued to {{employeeName}} — reason: {{reason}}', '["severity","employeeName","reason"]'),
  ('discipline.memo.issued', 'email', 'ar', 'مذكرة تأديبية (Disciplinary memo)', '<p>صدرت مذكرة تأديبية ({{severity}}) للموظف <strong>{{employeeName}}</strong>.</p><p>السبب: {{reason}}</p>', '["severity","employeeName","reason"]'),
  ('discipline.memo.issued', 'email', 'en', 'Disciplinary memo issued', '<p>A disciplinary memo ({{severity}}) was issued to <strong>{{employeeName}}</strong>.</p><p>Reason: {{reason}}</p>', '["severity","employeeName","reason"]'),
  ('discipline.memo.issued', 'sms', 'ar', NULL, 'مذكرة تأديبية: {{employeeName}} ({{severity}})', '["employeeName","severity"]'),
  ('discipline.memo.issued', 'sms', 'en', NULL, 'Disciplinary memo: {{employeeName}} ({{severity}})', '["employeeName","severity"]'),
  ('discipline.memo.issued', 'whatsapp', 'ar', NULL, '⚠️ *مذكرة تأديبية*\nالموظف: {{employeeName}}\nالدرجة: {{severity}}\nالسبب: {{reason}}', '["severity","employeeName","reason"]'),
  ('discipline.memo.issued', 'whatsapp', 'en', NULL, '⚠️ *Disciplinary memo*\nEmployee: {{employeeName}}\nSeverity: {{severity}}\nReason: {{reason}}', '["severity","employeeName","reason"]'),

  -- =====================================================================
  -- FINANCE — INVOICE
  -- =====================================================================
  ('invoice.created', 'in_app', 'ar', 'فاتورة جديدة', 'تم إنشاء فاتورة #{{invoiceRef}} للعميل {{customerName}} بقيمة {{amount}} ريال', '["invoiceRef","customerName","amount"]'),
  ('invoice.created', 'in_app', 'en', 'New invoice', 'Invoice #{{invoiceRef}} created for {{customerName}} — SAR {{amount}}', '["invoiceRef","customerName","amount"]'),
  ('invoice.created', 'email', 'ar', 'فاتورة جديدة (New invoice)', '<p>تم إصدار فاتورة جديدة <strong>#{{invoiceRef}}</strong> باسم <strong>{{customerName}}</strong> بقيمة <strong>{{amount}} ريال</strong>.</p>', '["invoiceRef","customerName","amount"]'),
  ('invoice.created', 'email', 'en', 'New invoice issued', '<p>A new invoice <strong>#{{invoiceRef}}</strong> was issued to <strong>{{customerName}}</strong> for <strong>SAR {{amount}}</strong>.</p>', '["invoiceRef","customerName","amount"]'),
  ('invoice.created', 'sms', 'ar', NULL, 'فاتورة #{{invoiceRef}} — {{customerName}} ({{amount}} ر.س)', '["invoiceRef","customerName","amount"]'),
  ('invoice.created', 'sms', 'en', NULL, 'Invoice #{{invoiceRef}} — {{customerName}} (SAR {{amount}})', '["invoiceRef","customerName","amount"]'),
  ('invoice.created', 'whatsapp', 'ar', NULL, '🧾 *فاتورة جديدة*\nالرقم: #{{invoiceRef}}\nالعميل: {{customerName}}\nالمبلغ: {{amount}} ريال', '["invoiceRef","customerName","amount"]'),
  ('invoice.created', 'whatsapp', 'en', NULL, '🧾 *New invoice*\nNumber: #{{invoiceRef}}\nCustomer: {{customerName}}\nAmount: SAR {{amount}}', '["invoiceRef","customerName","amount"]'),

  ('invoice.paid', 'in_app', 'ar', 'تم سداد الفاتورة', 'تم سداد الفاتورة #{{invoiceRef}} بقيمة {{amount}} ريال', '["invoiceRef","amount"]'),
  ('invoice.paid', 'in_app', 'en', 'Invoice paid', 'Invoice #{{invoiceRef}} paid — SAR {{amount}}', '["invoiceRef","amount"]'),
  ('invoice.paid', 'email', 'ar', 'تم سداد الفاتورة (Invoice paid)', '<p>تم سداد الفاتورة <strong>#{{invoiceRef}}</strong> بقيمة <strong>{{amount}} ريال</strong>. شكراً لتعاملكم.</p>', '["invoiceRef","amount"]'),
  ('invoice.paid', 'email', 'en', 'Invoice paid', '<p>Invoice <strong>#{{invoiceRef}}</strong> has been paid (SAR {{amount}}). Thank you.</p>', '["invoiceRef","amount"]'),
  ('invoice.paid', 'sms', 'ar', NULL, 'تم سداد الفاتورة #{{invoiceRef}} ({{amount}} ر.س)', '["invoiceRef","amount"]'),
  ('invoice.paid', 'sms', 'en', NULL, 'Invoice #{{invoiceRef}} paid (SAR {{amount}})', '["invoiceRef","amount"]'),
  ('invoice.paid', 'whatsapp', 'ar', NULL, '✅ *تم سداد الفاتورة*\nالرقم: #{{invoiceRef}}\nالمبلغ: {{amount}} ريال', '["invoiceRef","amount"]'),
  ('invoice.paid', 'whatsapp', 'en', NULL, '✅ *Invoice paid*\nNumber: #{{invoiceRef}}\nAmount: SAR {{amount}}', '["invoiceRef","amount"]'),

  ('invoice.overdue', 'in_app', 'ar', 'فاتورة متأخرة', 'الفاتورة #{{invoiceRef}} متأخرة السداد منذ {{days}} يوم — المبلغ المستحق: {{amount}} ريال', '["invoiceRef","days","amount"]'),
  ('invoice.overdue', 'in_app', 'en', 'Overdue invoice', 'Invoice #{{invoiceRef}} is overdue by {{days}} days — SAR {{amount}}', '["invoiceRef","days","amount"]'),
  ('invoice.overdue', 'email', 'ar', 'فاتورة متأخرة (Overdue invoice)', '<p>الفاتورة <strong>#{{invoiceRef}}</strong> متأخرة السداد منذ <strong>{{days}} يوم</strong>.</p><p>المبلغ المستحق: <strong>{{amount}} ريال</strong></p><p>يرجى السداد في أقرب وقت.</p>', '["invoiceRef","days","amount"]'),
  ('invoice.overdue', 'email', 'en', 'Overdue invoice reminder', '<p>Invoice <strong>#{{invoiceRef}}</strong> is overdue by <strong>{{days}} days</strong>.</p><p>Outstanding balance: <strong>SAR {{amount}}</strong></p><p>Please settle at your earliest.</p>', '["invoiceRef","days","amount"]'),
  ('invoice.overdue', 'sms', 'ar', NULL, 'فاتورة متأخرة #{{invoiceRef}} ({{days}} يوم) — {{amount}} ر.س', '["invoiceRef","days","amount"]'),
  ('invoice.overdue', 'sms', 'en', NULL, 'Overdue: #{{invoiceRef}} ({{days}}d) SAR {{amount}}', '["invoiceRef","days","amount"]'),
  ('invoice.overdue', 'whatsapp', 'ar', NULL, '⚠️ *فاتورة متأخرة*\nالرقم: #{{invoiceRef}}\nالأيام: {{days}}\nالمبلغ المستحق: {{amount}} ريال', '["invoiceRef","days","amount"]'),
  ('invoice.overdue', 'whatsapp', 'en', NULL, '⚠️ *Overdue invoice*\nNumber: #{{invoiceRef}}\nDays: {{days}}\nOutstanding: SAR {{amount}}', '["invoiceRef","days","amount"]'),

  -- =====================================================================
  -- FINANCE — PURCHASE ORDER / EXPENSE / RECEIPT
  -- =====================================================================
  ('purchase_order.created', 'in_app', 'ar', 'أمر شراء جديد', 'تم إنشاء أمر شراء #{{poNumber}} للمورد {{supplierName}} بقيمة {{amount}} ريال', '["poNumber","supplierName","amount"]'),
  ('purchase_order.created', 'in_app', 'en', 'New purchase order', 'PO #{{poNumber}} created for {{supplierName}} — SAR {{amount}}', '["poNumber","supplierName","amount"]'),
  ('purchase_order.created', 'email', 'ar', 'أمر شراء جديد (Purchase order)', '<p>تم إصدار أمر شراء <strong>#{{poNumber}}</strong> للمورد <strong>{{supplierName}}</strong> بقيمة <strong>{{amount}} ريال</strong>.</p>', '["poNumber","supplierName","amount"]'),
  ('purchase_order.created', 'email', 'en', 'New purchase order', '<p>Purchase order <strong>#{{poNumber}}</strong> issued to <strong>{{supplierName}}</strong> for <strong>SAR {{amount}}</strong>.</p>', '["poNumber","supplierName","amount"]'),
  ('purchase_order.created', 'sms', 'ar', NULL, 'أمر شراء #{{poNumber}} — {{supplierName}} ({{amount}} ر.س)', '["poNumber","supplierName","amount"]'),
  ('purchase_order.created', 'sms', 'en', NULL, 'PO #{{poNumber}} — {{supplierName}} (SAR {{amount}})', '["poNumber","supplierName","amount"]'),
  ('purchase_order.created', 'whatsapp', 'ar', NULL, '📦 *أمر شراء جديد*\nالرقم: #{{poNumber}}\nالمورد: {{supplierName}}\nالمبلغ: {{amount}} ريال', '["poNumber","supplierName","amount"]'),
  ('purchase_order.created', 'whatsapp', 'en', NULL, '📦 *New PO*\nNumber: #{{poNumber}}\nSupplier: {{supplierName}}\nAmount: SAR {{amount}}', '["poNumber","supplierName","amount"]'),

  ('purchase_request.created', 'in_app', 'ar', 'طلب شراء', 'طلب شراء جديد #{{prNumber}} من {{requesterName}} بقيمة تقديرية {{amount}} ريال', '["prNumber","requesterName","amount"]'),
  ('purchase_request.created', 'in_app', 'en', 'Purchase request', 'New PR #{{prNumber}} from {{requesterName}} — est. SAR {{amount}}', '["prNumber","requesterName","amount"]'),
  ('purchase_request.created', 'email', 'ar', 'طلب شراء (Purchase request)', '<p>طلب شراء جديد <strong>#{{prNumber}}</strong> من <strong>{{requesterName}}</strong> بقيمة تقديرية {{amount}} ريال.</p>', '["prNumber","requesterName","amount"]'),
  ('purchase_request.created', 'email', 'en', 'New purchase request', '<p>New purchase request <strong>#{{prNumber}}</strong> from <strong>{{requesterName}}</strong> — estimated SAR {{amount}}.</p>', '["prNumber","requesterName","amount"]'),
  ('purchase_request.created', 'sms', 'ar', NULL, 'طلب شراء #{{prNumber}} — {{requesterName}}', '["prNumber","requesterName"]'),
  ('purchase_request.created', 'sms', 'en', NULL, 'PR #{{prNumber}} — {{requesterName}}', '["prNumber","requesterName"]'),
  ('purchase_request.created', 'whatsapp', 'ar', NULL, '🛒 *طلب شراء*\nالرقم: #{{prNumber}}\nمقدّم الطلب: {{requesterName}}\nالمبلغ: {{amount}} ريال', '["prNumber","requesterName","amount"]'),
  ('purchase_request.created', 'whatsapp', 'en', NULL, '🛒 *Purchase request*\nNumber: #{{prNumber}}\nRequester: {{requesterName}}\nAmount: SAR {{amount}}', '["prNumber","requesterName","amount"]'),

  ('expense.submitted', 'in_app', 'ar', 'مصروف بانتظار الموافقة', 'تم تقديم مصروف من {{employeeName}} بقيمة {{amount}} ريال', '["employeeName","amount"]'),
  ('expense.submitted', 'in_app', 'en', 'Expense pending approval', 'Expense submitted by {{employeeName}} — SAR {{amount}}', '["employeeName","amount"]'),
  ('expense.submitted', 'email', 'ar', 'مصروف بانتظار الموافقة (Expense)', '<p>تم تقديم مصروف من <strong>{{employeeName}}</strong> بقيمة <strong>{{amount}} ريال</strong>. يرجى المراجعة.</p>', '["employeeName","amount"]'),
  ('expense.submitted', 'email', 'en', 'Expense pending approval', '<p>Expense submitted by <strong>{{employeeName}}</strong> for <strong>SAR {{amount}}</strong>. Please review.</p>', '["employeeName","amount"]'),
  ('expense.submitted', 'sms', 'ar', NULL, 'مصروف: {{employeeName}} ({{amount}} ر.س)', '["employeeName","amount"]'),
  ('expense.submitted', 'sms', 'en', NULL, 'Expense: {{employeeName}} (SAR {{amount}})', '["employeeName","amount"]'),
  ('expense.submitted', 'whatsapp', 'ar', NULL, '💸 *مصروف بانتظار الموافقة*\nالموظف: {{employeeName}}\nالمبلغ: {{amount}} ريال', '["employeeName","amount"]'),
  ('expense.submitted', 'whatsapp', 'en', NULL, '💸 *Expense pending*\nEmployee: {{employeeName}}\nAmount: SAR {{amount}}', '["employeeName","amount"]'),

  ('receipt.issued', 'in_app', 'ar', 'سند قبض جديد', 'تم إصدار سند قبض #{{receiptNumber}} بقيمة {{amount}} ريال من {{payerName}}', '["receiptNumber","amount","payerName"]'),
  ('receipt.issued', 'in_app', 'en', 'Receipt issued', 'Receipt #{{receiptNumber}} for SAR {{amount}} from {{payerName}}', '["receiptNumber","amount","payerName"]'),
  ('receipt.issued', 'email', 'ar', 'سند قبض (Receipt)', '<p>تم إصدار سند قبض <strong>#{{receiptNumber}}</strong> بقيمة <strong>{{amount}} ريال</strong> من <strong>{{payerName}}</strong>.</p>', '["receiptNumber","amount","payerName"]'),
  ('receipt.issued', 'email', 'en', 'Receipt issued', '<p>Receipt <strong>#{{receiptNumber}}</strong> for <strong>SAR {{amount}}</strong> from <strong>{{payerName}}</strong>.</p>', '["receiptNumber","amount","payerName"]'),
  ('receipt.issued', 'sms', 'ar', NULL, 'سند قبض #{{receiptNumber}} ({{amount}} ر.س)', '["receiptNumber","amount"]'),
  ('receipt.issued', 'sms', 'en', NULL, 'Receipt #{{receiptNumber}} (SAR {{amount}})', '["receiptNumber","amount"]'),
  ('receipt.issued', 'whatsapp', 'ar', NULL, '🧾 *سند قبض*\nالرقم: #{{receiptNumber}}\nالمبلغ: {{amount}} ريال\nمن: {{payerName}}', '["receiptNumber","amount","payerName"]'),
  ('receipt.issued', 'whatsapp', 'en', NULL, '🧾 *Receipt*\nNumber: #{{receiptNumber}}\nAmount: SAR {{amount}}\nFrom: {{payerName}}', '["receiptNumber","amount","payerName"]'),

  ('payment.issued', 'in_app', 'ar', 'سند صرف جديد', 'تم إصدار سند صرف #{{paymentNumber}} بقيمة {{amount}} ريال إلى {{payeeName}}', '["paymentNumber","amount","payeeName"]'),
  ('payment.issued', 'in_app', 'en', 'Payment voucher', 'Payment #{{paymentNumber}} for SAR {{amount}} to {{payeeName}}', '["paymentNumber","amount","payeeName"]'),
  ('payment.issued', 'email', 'ar', 'سند صرف (Payment)', '<p>تم إصدار سند صرف <strong>#{{paymentNumber}}</strong> بقيمة <strong>{{amount}} ريال</strong> إلى <strong>{{payeeName}}</strong>.</p>', '["paymentNumber","amount","payeeName"]'),
  ('payment.issued', 'email', 'en', 'Payment issued', '<p>Payment <strong>#{{paymentNumber}}</strong> for <strong>SAR {{amount}}</strong> issued to <strong>{{payeeName}}</strong>.</p>', '["paymentNumber","amount","payeeName"]'),
  ('payment.issued', 'sms', 'ar', NULL, 'سند صرف #{{paymentNumber}} ({{amount}} ر.س)', '["paymentNumber","amount"]'),
  ('payment.issued', 'sms', 'en', NULL, 'Payment #{{paymentNumber}} (SAR {{amount}})', '["paymentNumber","amount"]'),
  ('payment.issued', 'whatsapp', 'ar', NULL, '💵 *سند صرف*\nالرقم: #{{paymentNumber}}\nالمبلغ: {{amount}} ريال\nإلى: {{payeeName}}', '["paymentNumber","amount","payeeName"]'),
  ('payment.issued', 'whatsapp', 'en', NULL, '💵 *Payment*\nNumber: #{{paymentNumber}}\nAmount: SAR {{amount}}\nTo: {{payeeName}}', '["paymentNumber","amount","payeeName"]'),

  -- =====================================================================
  -- APPROVAL CHAINS
  -- =====================================================================
  ('approval.pending', 'in_app', 'ar', 'طلب بانتظار موافقتك', 'لديك طلب {{requestType}} بانتظار موافقتك من {{requesterName}}', '["requestType","requesterName"]'),
  ('approval.pending', 'in_app', 'en', 'Pending your approval', 'You have a {{requestType}} request from {{requesterName}} awaiting approval', '["requestType","requesterName"]'),
  ('approval.pending', 'email', 'ar', 'طلب بانتظار موافقتك (Pending approval)', '<p>لديك طلب <strong>{{requestType}}</strong> من <strong>{{requesterName}}</strong> بانتظار موافقتك.</p>', '["requestType","requesterName"]'),
  ('approval.pending', 'email', 'en', 'Pending your approval', '<p>You have a <strong>{{requestType}}</strong> request from <strong>{{requesterName}}</strong> awaiting your approval.</p>', '["requestType","requesterName"]'),
  ('approval.pending', 'sms', 'ar', NULL, 'طلب موافقة: {{requestType}} من {{requesterName}}', '["requestType","requesterName"]'),
  ('approval.pending', 'sms', 'en', NULL, 'Approval needed: {{requestType}} from {{requesterName}}', '["requestType","requesterName"]'),
  ('approval.pending', 'whatsapp', 'ar', NULL, '📥 *طلب موافقة*\nالنوع: {{requestType}}\nمقدّم الطلب: {{requesterName}}', '["requestType","requesterName"]'),
  ('approval.pending', 'whatsapp', 'en', NULL, '📥 *Approval needed*\nType: {{requestType}}\nRequester: {{requesterName}}', '["requestType","requesterName"]'),

  ('approval.escalated', 'in_app', 'ar', 'تصعيد طلب موافقة', 'تم تصعيد طلب {{requestType}} إليك من {{escalatedFrom}} (تجاوز SLA)', '["requestType","escalatedFrom"]'),
  ('approval.escalated', 'in_app', 'en', 'Approval escalated', '{{requestType}} request escalated to you from {{escalatedFrom}} (SLA breach)', '["requestType","escalatedFrom"]'),
  ('approval.escalated', 'email', 'ar', 'تصعيد طلب موافقة (Escalated)', '<p>تم تصعيد طلب <strong>{{requestType}}</strong> إليك من <strong>{{escalatedFrom}}</strong> بسبب تجاوز وقت الاستجابة.</p>', '["requestType","escalatedFrom"]'),
  ('approval.escalated', 'email', 'en', 'Approval escalated to you', '<p>A <strong>{{requestType}}</strong> request has been escalated to you from <strong>{{escalatedFrom}}</strong> due to SLA breach.</p>', '["requestType","escalatedFrom"]'),
  ('approval.escalated', 'sms', 'ar', NULL, 'تصعيد: {{requestType}} من {{escalatedFrom}}', '["requestType","escalatedFrom"]'),
  ('approval.escalated', 'sms', 'en', NULL, 'Escalated: {{requestType}} from {{escalatedFrom}}', '["requestType","escalatedFrom"]'),
  ('approval.escalated', 'whatsapp', 'ar', NULL, '🚨 *تصعيد طلب*\nالنوع: {{requestType}}\nمن: {{escalatedFrom}}', '["requestType","escalatedFrom"]'),
  ('approval.escalated', 'whatsapp', 'en', NULL, '🚨 *Escalated approval*\nType: {{requestType}}\nFrom: {{escalatedFrom}}', '["requestType","escalatedFrom"]'),

  -- =====================================================================
  -- TASKS & PROJECTS
  -- =====================================================================
  ('task.assigned', 'in_app', 'ar', 'مهمة جديدة', 'تم تعيين مهمة لك: {{taskTitle}}', '["taskTitle"]'),
  ('task.assigned', 'in_app', 'en', 'New task assigned', 'You have been assigned a task: {{taskTitle}}', '["taskTitle"]'),
  ('task.assigned', 'email', 'ar', 'مهمة جديدة (Task assigned)', '<p>تم تعيين مهمة جديدة لك: <strong>{{taskTitle}}</strong></p><p>الموعد النهائي: {{dueDate}}</p>', '["taskTitle","dueDate"]'),
  ('task.assigned', 'email', 'en', 'New task assigned', '<p>You have been assigned a new task: <strong>{{taskTitle}}</strong></p><p>Due: {{dueDate}}</p>', '["taskTitle","dueDate"]'),
  ('task.assigned', 'sms', 'ar', NULL, 'مهمة جديدة: {{taskTitle}}', '["taskTitle"]'),
  ('task.assigned', 'sms', 'en', NULL, 'New task: {{taskTitle}}', '["taskTitle"]'),
  ('task.assigned', 'whatsapp', 'ar', NULL, '📋 *مهمة جديدة*\nالعنوان: {{taskTitle}}\nالموعد: {{dueDate}}', '["taskTitle","dueDate"]'),
  ('task.assigned', 'whatsapp', 'en', NULL, '📋 *New task*\nTitle: {{taskTitle}}\nDue: {{dueDate}}', '["taskTitle","dueDate"]'),

  ('task.overdue', 'in_app', 'ar', 'مهمة متأخرة', 'المهمة "{{taskTitle}}" تجاوزت موعدها المحدد ({{dueDate}})', '["taskTitle","dueDate"]'),
  ('task.overdue', 'in_app', 'en', 'Task overdue', 'Task "{{taskTitle}}" is overdue (was due {{dueDate}})', '["taskTitle","dueDate"]'),
  ('task.overdue', 'email', 'ar', 'مهمة متأخرة (Overdue task)', '<p>المهمة <strong>"{{taskTitle}}"</strong> تجاوزت موعدها المحدد ({{dueDate}}). يرجى إنهاؤها.</p>', '["taskTitle","dueDate"]'),
  ('task.overdue', 'email', 'en', 'Task overdue', '<p>Task <strong>"{{taskTitle}}"</strong> is past its due date ({{dueDate}}). Please complete it.</p>', '["taskTitle","dueDate"]'),
  ('task.overdue', 'sms', 'ar', NULL, 'مهمة متأخرة: {{taskTitle}}', '["taskTitle"]'),
  ('task.overdue', 'sms', 'en', NULL, 'Overdue: {{taskTitle}}', '["taskTitle"]'),
  ('task.overdue', 'whatsapp', 'ar', NULL, '⏰ *مهمة متأخرة*\n{{taskTitle}} ({{dueDate}})', '["taskTitle","dueDate"]'),
  ('task.overdue', 'whatsapp', 'en', NULL, '⏰ *Overdue task*\n{{taskTitle}} ({{dueDate}})', '["taskTitle","dueDate"]'),

  ('project.milestone.reached', 'in_app', 'ar', 'إنجاز معلم في المشروع', 'تم إنجاز المعلم "{{milestoneName}}" في مشروع {{projectName}}', '["milestoneName","projectName"]'),
  ('project.milestone.reached', 'in_app', 'en', 'Project milestone reached', 'Milestone "{{milestoneName}}" reached in project {{projectName}}', '["milestoneName","projectName"]'),
  ('project.milestone.reached', 'email', 'ar', 'إنجاز معلم في المشروع (Milestone)', '<p>تم إنجاز المعلم <strong>"{{milestoneName}}"</strong> في مشروع <strong>{{projectName}}</strong>.</p>', '["milestoneName","projectName"]'),
  ('project.milestone.reached', 'email', 'en', 'Project milestone reached', '<p>Milestone <strong>"{{milestoneName}}"</strong> has been reached in project <strong>{{projectName}}</strong>.</p>', '["milestoneName","projectName"]'),
  ('project.milestone.reached', 'sms', 'ar', NULL, 'معلم: {{milestoneName}} ({{projectName}})', '["milestoneName","projectName"]'),
  ('project.milestone.reached', 'sms', 'en', NULL, 'Milestone: {{milestoneName}} ({{projectName}})', '["milestoneName","projectName"]'),
  ('project.milestone.reached', 'whatsapp', 'ar', NULL, '🎯 *إنجاز معلم*\nالمعلم: {{milestoneName}}\nالمشروع: {{projectName}}', '["milestoneName","projectName"]'),
  ('project.milestone.reached', 'whatsapp', 'en', NULL, '🎯 *Milestone reached*\nMilestone: {{milestoneName}}\nProject: {{projectName}}', '["milestoneName","projectName"]'),

  -- =====================================================================
  -- SUPPORT TICKETS
  -- =====================================================================
  ('support.ticket.created', 'in_app', 'ar', 'تذكرة دعم جديدة', 'تم فتح تذكرة دعم جديدة #{{ticketId}} — {{subject}}', '["ticketId","subject"]'),
  ('support.ticket.created', 'in_app', 'en', 'New support ticket', 'New ticket #{{ticketId}} — {{subject}}', '["ticketId","subject"]'),
  ('support.ticket.created', 'email', 'ar', 'تذكرة دعم جديدة (Ticket)', '<p>تم فتح تذكرة دعم جديدة <strong>#{{ticketId}}</strong>.</p><p>الموضوع: {{subject}}</p>', '["ticketId","subject"]'),
  ('support.ticket.created', 'email', 'en', 'New support ticket', '<p>New support ticket <strong>#{{ticketId}}</strong> opened.</p><p>Subject: {{subject}}</p>', '["ticketId","subject"]'),
  ('support.ticket.created', 'sms', 'ar', NULL, 'تذكرة #{{ticketId}}: {{subject}}', '["ticketId","subject"]'),
  ('support.ticket.created', 'sms', 'en', NULL, 'Ticket #{{ticketId}}: {{subject}}', '["ticketId","subject"]'),
  ('support.ticket.created', 'whatsapp', 'ar', NULL, '🎫 *تذكرة دعم جديدة*\nالرقم: #{{ticketId}}\nالموضوع: {{subject}}', '["ticketId","subject"]'),
  ('support.ticket.created', 'whatsapp', 'en', NULL, '🎫 *New ticket*\nNumber: #{{ticketId}}\nSubject: {{subject}}', '["ticketId","subject"]'),

  ('support.ticket.assigned', 'in_app', 'ar', 'تذكرة مُسندة لك', 'تم إسناد التذكرة #{{ticketId}} لك — {{subject}}', '["ticketId","subject"]'),
  ('support.ticket.assigned', 'in_app', 'en', 'Ticket assigned to you', 'Ticket #{{ticketId}} assigned to you — {{subject}}', '["ticketId","subject"]'),
  ('support.ticket.assigned', 'email', 'ar', 'تذكرة مُسندة لك (Ticket assigned)', '<p>تم إسناد التذكرة <strong>#{{ticketId}}</strong> إليك.</p><p>الموضوع: {{subject}}</p>', '["ticketId","subject"]'),
  ('support.ticket.assigned', 'email', 'en', 'Ticket assigned to you', '<p>Ticket <strong>#{{ticketId}}</strong> has been assigned to you.</p><p>Subject: {{subject}}</p>', '["ticketId","subject"]'),
  ('support.ticket.assigned', 'sms', 'ar', NULL, 'إسناد تذكرة #{{ticketId}}: {{subject}}', '["ticketId","subject"]'),
  ('support.ticket.assigned', 'sms', 'en', NULL, 'Assigned #{{ticketId}}: {{subject}}', '["ticketId","subject"]'),
  ('support.ticket.assigned', 'whatsapp', 'ar', NULL, '👤 *تذكرة مُسندة لك*\nالرقم: #{{ticketId}}\nالموضوع: {{subject}}', '["ticketId","subject"]'),
  ('support.ticket.assigned', 'whatsapp', 'en', NULL, '👤 *Ticket assigned*\nNumber: #{{ticketId}}\nSubject: {{subject}}', '["ticketId","subject"]'),

  ('support.ticket.resolved', 'in_app', 'ar', 'تم حل التذكرة', 'تم حل التذكرة #{{ticketId}} — {{subject}}', '["ticketId","subject"]'),
  ('support.ticket.resolved', 'in_app', 'en', 'Ticket resolved', 'Ticket #{{ticketId}} resolved — {{subject}}', '["ticketId","subject"]'),
  ('support.ticket.resolved', 'email', 'ar', 'تم حل التذكرة (Ticket resolved)', '<p>تم حل التذكرة <strong>#{{ticketId}}</strong> ({{subject}}).</p><p>إذا لم تكن المشكلة قد حُلَّت، يرجى الرد على هذه الرسالة.</p>', '["ticketId","subject"]'),
  ('support.ticket.resolved', 'email', 'en', 'Your ticket was resolved', '<p>Ticket <strong>#{{ticketId}}</strong> ({{subject}}) has been resolved.</p><p>If the issue persists, please reply to this message.</p>', '["ticketId","subject"]'),
  ('support.ticket.resolved', 'sms', 'ar', NULL, 'حُلَّت التذكرة #{{ticketId}}', '["ticketId"]'),
  ('support.ticket.resolved', 'sms', 'en', NULL, 'Ticket #{{ticketId}} resolved', '["ticketId"]'),
  ('support.ticket.resolved', 'whatsapp', 'ar', NULL, '✅ *تم حل التذكرة*\nالرقم: #{{ticketId}}\nالموضوع: {{subject}}', '["ticketId","subject"]'),
  ('support.ticket.resolved', 'whatsapp', 'en', NULL, '✅ *Ticket resolved*\nNumber: #{{ticketId}}\nSubject: {{subject}}', '["ticketId","subject"]'),

  -- =====================================================================
  -- FLEET
  -- =====================================================================
  ('fleet.maintenance.due', 'in_app', 'ar', 'صيانة مركبة مستحقة', 'المركبة {{plateNumber}} مستحقة للصيانة — {{maintenanceType}}', '["plateNumber","maintenanceType"]'),
  ('fleet.maintenance.due', 'in_app', 'en', 'Vehicle maintenance due', 'Vehicle {{plateNumber}} is due for maintenance — {{maintenanceType}}', '["plateNumber","maintenanceType"]'),
  ('fleet.maintenance.due', 'email', 'ar', 'صيانة مركبة مستحقة (Maintenance due)', '<p>المركبة <strong>{{plateNumber}}</strong> مستحقة للصيانة.</p><p>النوع: {{maintenanceType}}</p>', '["plateNumber","maintenanceType"]'),
  ('fleet.maintenance.due', 'email', 'en', 'Vehicle maintenance due', '<p>Vehicle <strong>{{plateNumber}}</strong> is due for maintenance.</p><p>Type: {{maintenanceType}}</p>', '["plateNumber","maintenanceType"]'),
  ('fleet.maintenance.due', 'sms', 'ar', NULL, 'صيانة {{plateNumber}}: {{maintenanceType}}', '["plateNumber","maintenanceType"]'),
  ('fleet.maintenance.due', 'sms', 'en', NULL, 'Maintenance {{plateNumber}}: {{maintenanceType}}', '["plateNumber","maintenanceType"]'),
  ('fleet.maintenance.due', 'whatsapp', 'ar', NULL, '🔧 *صيانة مركبة مستحقة*\nاللوحة: {{plateNumber}}\nالنوع: {{maintenanceType}}', '["plateNumber","maintenanceType"]'),
  ('fleet.maintenance.due', 'whatsapp', 'en', NULL, '🔧 *Maintenance due*\nPlate: {{plateNumber}}\nType: {{maintenanceType}}', '["plateNumber","maintenanceType"]'),

  ('fleet.accident.reported', 'in_app', 'ar', 'حادث مركبة', 'تم تسجيل حادث للمركبة {{plateNumber}} — السائق: {{driverName}}', '["plateNumber","driverName"]'),
  ('fleet.accident.reported', 'in_app', 'en', 'Vehicle accident', 'Accident logged for {{plateNumber}} — driver: {{driverName}}', '["plateNumber","driverName"]'),
  ('fleet.accident.reported', 'email', 'ar', 'حادث مركبة (Accident)', '<p>تم تسجيل حادث للمركبة <strong>{{plateNumber}}</strong>.</p><p>السائق: {{driverName}}</p>', '["plateNumber","driverName"]'),
  ('fleet.accident.reported', 'email', 'en', 'Vehicle accident reported', '<p>An accident has been logged for vehicle <strong>{{plateNumber}}</strong>.</p><p>Driver: {{driverName}}</p>', '["plateNumber","driverName"]'),
  ('fleet.accident.reported', 'sms', 'ar', NULL, 'حادث {{plateNumber}} — {{driverName}}', '["plateNumber","driverName"]'),
  ('fleet.accident.reported', 'sms', 'en', NULL, 'Accident {{plateNumber}} — {{driverName}}', '["plateNumber","driverName"]'),
  ('fleet.accident.reported', 'whatsapp', 'ar', NULL, '🚨 *حادث مركبة*\nاللوحة: {{plateNumber}}\nالسائق: {{driverName}}', '["plateNumber","driverName"]'),
  ('fleet.accident.reported', 'whatsapp', 'en', NULL, '🚨 *Vehicle accident*\nPlate: {{plateNumber}}\nDriver: {{driverName}}', '["plateNumber","driverName"]'),

  ('fleet.license.expiring', 'in_app', 'ar', 'استمارة مركبة قريبة الانتهاء', 'استمارة المركبة {{plateNumber}} تنتهي في {{expiryDate}}', '["plateNumber","expiryDate"]'),
  ('fleet.license.expiring', 'in_app', 'en', 'Vehicle license expiring', 'License for {{plateNumber}} expires on {{expiryDate}}', '["plateNumber","expiryDate"]'),
  ('fleet.license.expiring', 'email', 'ar', 'استمارة مركبة قريبة الانتهاء (License)', '<p>استمارة المركبة <strong>{{plateNumber}}</strong> تنتهي بتاريخ <strong>{{expiryDate}}</strong>. يرجى التجديد.</p>', '["plateNumber","expiryDate"]'),
  ('fleet.license.expiring', 'email', 'en', 'Vehicle license expiring soon', '<p>The license for vehicle <strong>{{plateNumber}}</strong> expires on <strong>{{expiryDate}}</strong>. Please renew.</p>', '["plateNumber","expiryDate"]'),
  ('fleet.license.expiring', 'sms', 'ar', NULL, 'استمارة {{plateNumber}} تنتهي {{expiryDate}}', '["plateNumber","expiryDate"]'),
  ('fleet.license.expiring', 'sms', 'en', NULL, 'License {{plateNumber}} expires {{expiryDate}}', '["plateNumber","expiryDate"]'),
  ('fleet.license.expiring', 'whatsapp', 'ar', NULL, '⚠️ *استمارة قريبة الانتهاء*\nاللوحة: {{plateNumber}}\nالانتهاء: {{expiryDate}}', '["plateNumber","expiryDate"]'),
  ('fleet.license.expiring', 'whatsapp', 'en', NULL, '⚠️ *License expiring*\nPlate: {{plateNumber}}\nExpires: {{expiryDate}}', '["plateNumber","expiryDate"]'),

  -- =====================================================================
  -- CRM
  -- =====================================================================
  ('lead.created', 'in_app', 'ar', 'عميل محتمل جديد', 'تم تسجيل عميل محتمل: {{leadName}} ({{source}})', '["leadName","source"]'),
  ('lead.created', 'in_app', 'en', 'New lead', 'Lead added: {{leadName}} ({{source}})', '["leadName","source"]'),
  ('lead.created', 'email', 'ar', 'عميل محتمل جديد (New lead)', '<p>تم تسجيل عميل محتمل جديد: <strong>{{leadName}}</strong> (المصدر: {{source}}).</p>', '["leadName","source"]'),
  ('lead.created', 'email', 'en', 'New lead', '<p>New lead added: <strong>{{leadName}}</strong> (source: {{source}}).</p>', '["leadName","source"]'),
  ('lead.created', 'sms', 'ar', NULL, 'عميل محتمل: {{leadName}} ({{source}})', '["leadName","source"]'),
  ('lead.created', 'sms', 'en', NULL, 'New lead: {{leadName}} ({{source}})', '["leadName","source"]'),
  ('lead.created', 'whatsapp', 'ar', NULL, '🤝 *عميل محتمل جديد*\nالاسم: {{leadName}}\nالمصدر: {{source}}', '["leadName","source"]'),
  ('lead.created', 'whatsapp', 'en', NULL, '🤝 *New lead*\nName: {{leadName}}\nSource: {{source}}', '["leadName","source"]'),

  ('opportunity.won', 'in_app', 'ar', 'فرصة بيع مكتسبة', 'تم كسب الفرصة {{opportunityName}} بقيمة {{amount}} ريال', '["opportunityName","amount"]'),
  ('opportunity.won', 'in_app', 'en', 'Opportunity won', 'Opportunity {{opportunityName}} won — SAR {{amount}}', '["opportunityName","amount"]'),
  ('opportunity.won', 'email', 'ar', 'فرصة مكتسبة (Opportunity won)', '<p>تم كسب الفرصة <strong>{{opportunityName}}</strong> بقيمة <strong>{{amount}} ريال</strong>. تهانينا!</p>', '["opportunityName","amount"]'),
  ('opportunity.won', 'email', 'en', 'Opportunity won', '<p>Opportunity <strong>{{opportunityName}}</strong> won for <strong>SAR {{amount}}</strong>. Congratulations!</p>', '["opportunityName","amount"]'),
  ('opportunity.won', 'sms', 'ar', NULL, 'فرصة مكتسبة: {{opportunityName}} ({{amount}} ر.س)', '["opportunityName","amount"]'),
  ('opportunity.won', 'sms', 'en', NULL, 'Won: {{opportunityName}} (SAR {{amount}})', '["opportunityName","amount"]'),
  ('opportunity.won', 'whatsapp', 'ar', NULL, '🎉 *فرصة مكتسبة*\nالاسم: {{opportunityName}}\nالقيمة: {{amount}} ريال', '["opportunityName","amount"]'),
  ('opportunity.won', 'whatsapp', 'en', NULL, '🎉 *Opportunity won*\nName: {{opportunityName}}\nValue: SAR {{amount}}', '["opportunityName","amount"]'),

  -- =====================================================================
  -- SYSTEM / SECURITY
  -- =====================================================================
  ('user.created', 'in_app', 'ar', 'حساب جديد', 'تم إنشاء حساب لك في النظام — البريد: {{email}}', '["email"]'),
  ('user.created', 'in_app', 'en', 'Account created', 'An account has been created for you — email: {{email}}', '["email"]'),
  ('user.created', 'email', 'ar', 'مرحباً بك في النظام (Welcome)', '<p>تم إنشاء حسابك في نظام غيث.</p><p>البريد: <strong>{{email}}</strong></p><p>كلمة المرور المؤقتة: <strong>{{tempPassword}}</strong></p><p>يرجى تغييرها عند أول دخول.</p>', '["email","tempPassword"]'),
  ('user.created', 'email', 'en', 'Welcome to the system', '<p>Your account has been created.</p><p>Email: <strong>{{email}}</strong></p><p>Temporary password: <strong>{{tempPassword}}</strong></p><p>Please change it on first login.</p>', '["email","tempPassword"]'),
  ('user.created', 'sms', 'ar', NULL, 'تم إنشاء حسابك في غيث — {{email}}', '["email"]'),
  ('user.created', 'sms', 'en', NULL, 'Your Ghayth account is ready — {{email}}', '["email"]'),
  ('user.created', 'whatsapp', 'ar', NULL, '👋 *مرحباً بك في غيث*\nالبريد: {{email}}\nسجّل الدخول من خلال {{loginUrl}}', '["email","loginUrl"]'),
  ('user.created', 'whatsapp', 'en', NULL, '👋 *Welcome to Ghayth*\nEmail: {{email}}\nSign in: {{loginUrl}}', '["email","loginUrl"]'),

  ('user.password.reset', 'in_app', 'ar', 'طلب إعادة تعيين كلمة المرور', 'تم طلب إعادة تعيين كلمة المرور لحسابك', '[]'),
  ('user.password.reset', 'in_app', 'en', 'Password reset requested', 'A password reset was requested for your account', '[]'),
  ('user.password.reset', 'email', 'ar', 'إعادة تعيين كلمة المرور (Password reset)', '<p>تم طلب إعادة تعيين كلمة المرور لحسابك.</p><p>الرمز: <strong>{{resetCode}}</strong></p><p>صالح لمدة {{validMinutes}} دقيقة.</p>', '["resetCode","validMinutes"]'),
  ('user.password.reset', 'email', 'en', 'Password reset', '<p>A password reset was requested for your account.</p><p>Code: <strong>{{resetCode}}</strong></p><p>Valid for {{validMinutes}} minutes.</p>', '["resetCode","validMinutes"]'),
  ('user.password.reset', 'sms', 'ar', NULL, 'رمز إعادة تعيين كلمة المرور: {{resetCode}}', '["resetCode"]'),
  ('user.password.reset', 'sms', 'en', NULL, 'Password reset code: {{resetCode}}', '["resetCode"]'),
  ('user.password.reset', 'whatsapp', 'ar', NULL, '🔐 *إعادة تعيين كلمة المرور*\nالرمز: {{resetCode}}\nصالح: {{validMinutes}} دقيقة', '["resetCode","validMinutes"]'),
  ('user.password.reset', 'whatsapp', 'en', NULL, '🔐 *Password reset*\nCode: {{resetCode}}\nValid: {{validMinutes}} minutes', '["resetCode","validMinutes"]'),

  -- =====================================================================
  -- WAREHOUSE / INVENTORY
  -- =====================================================================
  ('inventory.low_stock', 'in_app', 'ar', 'مخزون منخفض', 'الصنف {{productName}} وصل لحد المخزون الأدنى ({{currentQty}} متبقي)', '["productName","currentQty"]'),
  ('inventory.low_stock', 'in_app', 'en', 'Low stock alert', 'Product {{productName}} reached low-stock threshold ({{currentQty}} remaining)', '["productName","currentQty"]'),
  ('inventory.low_stock', 'email', 'ar', 'مخزون منخفض (Low stock)', '<p>الصنف <strong>{{productName}}</strong> وصل لحد المخزون الأدنى.</p><p>الكمية المتبقية: <strong>{{currentQty}}</strong></p>', '["productName","currentQty"]'),
  ('inventory.low_stock', 'email', 'en', 'Low stock alert', '<p>Product <strong>{{productName}}</strong> has reached the low-stock threshold.</p><p>Remaining: <strong>{{currentQty}}</strong></p>', '["productName","currentQty"]'),
  ('inventory.low_stock', 'sms', 'ar', NULL, 'مخزون منخفض: {{productName}} ({{currentQty}})', '["productName","currentQty"]'),
  ('inventory.low_stock', 'sms', 'en', NULL, 'Low stock: {{productName}} ({{currentQty}})', '["productName","currentQty"]'),
  ('inventory.low_stock', 'whatsapp', 'ar', NULL, '📦 *مخزون منخفض*\nالصنف: {{productName}}\nالمتبقي: {{currentQty}}', '["productName","currentQty"]'),
  ('inventory.low_stock', 'whatsapp', 'en', NULL, '📦 *Low stock*\nProduct: {{productName}}\nRemaining: {{currentQty}}', '["productName","currentQty"]'),

  -- =====================================================================
  -- PROPERTIES (real-estate)
  -- =====================================================================
  ('property.rent.due', 'in_app', 'ar', 'إيجار مستحق', 'إيجار الوحدة {{unitName}} مستحق بتاريخ {{dueDate}} — {{amount}} ريال', '["unitName","dueDate","amount"]'),
  ('property.rent.due', 'in_app', 'en', 'Rent due', 'Rent for unit {{unitName}} is due on {{dueDate}} — SAR {{amount}}', '["unitName","dueDate","amount"]'),
  ('property.rent.due', 'email', 'ar', 'إيجار مستحق (Rent due)', '<p>إيجار الوحدة <strong>{{unitName}}</strong> مستحق بتاريخ <strong>{{dueDate}}</strong>.</p><p>المبلغ: <strong>{{amount}} ريال</strong></p>', '["unitName","dueDate","amount"]'),
  ('property.rent.due', 'email', 'en', 'Rent due reminder', '<p>Rent for unit <strong>{{unitName}}</strong> is due on <strong>{{dueDate}}</strong>.</p><p>Amount: <strong>SAR {{amount}}</strong></p>', '["unitName","dueDate","amount"]'),
  ('property.rent.due', 'sms', 'ar', NULL, 'إيجار {{unitName}} مستحق {{dueDate}} ({{amount}} ر.س)', '["unitName","dueDate","amount"]'),
  ('property.rent.due', 'sms', 'en', NULL, 'Rent {{unitName}} due {{dueDate}} (SAR {{amount}})', '["unitName","dueDate","amount"]'),
  ('property.rent.due', 'whatsapp', 'ar', NULL, '🏠 *إيجار مستحق*\nالوحدة: {{unitName}}\nالتاريخ: {{dueDate}}\nالمبلغ: {{amount}} ريال', '["unitName","dueDate","amount"]'),
  ('property.rent.due', 'whatsapp', 'en', NULL, '🏠 *Rent due*\nUnit: {{unitName}}\nDate: {{dueDate}}\nAmount: SAR {{amount}}', '["unitName","dueDate","amount"]'),

  -- =====================================================================
  -- UMRAH (line of business)
  -- =====================================================================
  ('umrah.booking.confirmed', 'in_app', 'ar', 'تأكيد حجز عمرة', 'تم تأكيد حجز العمرة #{{bookingRef}} للمعتمر {{pilgrimName}}', '["bookingRef","pilgrimName"]'),
  ('umrah.booking.confirmed', 'in_app', 'en', 'Umrah booking confirmed', 'Umrah booking #{{bookingRef}} confirmed for {{pilgrimName}}', '["bookingRef","pilgrimName"]'),
  ('umrah.booking.confirmed', 'email', 'ar', 'تأكيد حجز عمرة (Booking)', '<p>تم تأكيد حجز العمرة <strong>#{{bookingRef}}</strong> للمعتمر <strong>{{pilgrimName}}</strong>.</p><p>تاريخ الوصول: {{arrivalDate}}</p>', '["bookingRef","pilgrimName","arrivalDate"]'),
  ('umrah.booking.confirmed', 'email', 'en', 'Umrah booking confirmed', '<p>Umrah booking <strong>#{{bookingRef}}</strong> for pilgrim <strong>{{pilgrimName}}</strong> has been confirmed.</p><p>Arrival: {{arrivalDate}}</p>', '["bookingRef","pilgrimName","arrivalDate"]'),
  ('umrah.booking.confirmed', 'sms', 'ar', NULL, 'تأكيد عمرة #{{bookingRef}} — {{pilgrimName}}', '["bookingRef","pilgrimName"]'),
  ('umrah.booking.confirmed', 'sms', 'en', NULL, 'Umrah #{{bookingRef}} — {{pilgrimName}} confirmed', '["bookingRef","pilgrimName"]'),
  ('umrah.booking.confirmed', 'whatsapp', 'ar', NULL, '🕋 *تأكيد حجز عمرة*\nالرقم: #{{bookingRef}}\nالمعتمر: {{pilgrimName}}\nالوصول: {{arrivalDate}}', '["bookingRef","pilgrimName","arrivalDate"]'),
  ('umrah.booking.confirmed', 'whatsapp', 'en', NULL, '🕋 *Umrah booking confirmed*\nRef: #{{bookingRef}}\nPilgrim: {{pilgrimName}}\nArrival: {{arrivalDate}}', '["bookingRef","pilgrimName","arrivalDate"]'),

  ('umrah.overstay.warning', 'in_app', 'ar', 'تنبيه تأخر معتمر', 'المعتمر {{pilgrimName}} متأخر عن المغادرة — {{daysOverstay}} يوم', '["pilgrimName","daysOverstay"]'),
  ('umrah.overstay.warning', 'in_app', 'en', 'Pilgrim overstay alert', 'Pilgrim {{pilgrimName}} has overstayed by {{daysOverstay}} days', '["pilgrimName","daysOverstay"]'),
  ('umrah.overstay.warning', 'email', 'ar', 'تنبيه تأخر معتمر (Overstay)', '<p>المعتمر <strong>{{pilgrimName}}</strong> تجاوز موعد المغادرة بـ <strong>{{daysOverstay}} يوم</strong>.</p>', '["pilgrimName","daysOverstay"]'),
  ('umrah.overstay.warning', 'email', 'en', 'Pilgrim overstay alert', '<p>Pilgrim <strong>{{pilgrimName}}</strong> has overstayed by <strong>{{daysOverstay}} days</strong>.</p>', '["pilgrimName","daysOverstay"]'),
  ('umrah.overstay.warning', 'sms', 'ar', NULL, 'تأخر معتمر: {{pilgrimName}} ({{daysOverstay}} يوم)', '["pilgrimName","daysOverstay"]'),
  ('umrah.overstay.warning', 'sms', 'en', NULL, 'Overstay: {{pilgrimName}} ({{daysOverstay}}d)', '["pilgrimName","daysOverstay"]'),
  ('umrah.overstay.warning', 'whatsapp', 'ar', NULL, '⚠️ *تأخر معتمر*\nالاسم: {{pilgrimName}}\nالتأخر: {{daysOverstay}} يوم', '["pilgrimName","daysOverstay"]'),
  ('umrah.overstay.warning', 'whatsapp', 'en', NULL, '⚠️ *Overstay alert*\nName: {{pilgrimName}}\nDays: {{daysOverstay}}', '["pilgrimName","daysOverstay"]')
) AS t("templateKey", channel, language, "titleTemplate", "bodyTemplate", variables)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates nt
  WHERE nt."companyId" = c.id
    AND nt."templateKey" = t."templateKey"
    AND nt.channel = t.channel
    AND nt.language = t.language
);
