-- Migration 132: Seed notification_templates for core events
-- Required for: SMS/Email/Push notifications — templates empty = notifications blank

INSERT INTO notification_templates ("companyId", "templateKey", channel, "titleTemplate", "bodyTemplate", variables, language, "isActive", "isDefault")
SELECT c.id, t."templateKey", t.channel, t."titleTemplate", t."bodyTemplate", t.variables::jsonb, 'ar', true, true
FROM companies c
CROSS JOIN (VALUES
  ('leave.request.created',    'in_app', 'طلب إجازة جديد',         'تم تقديم طلب إجازة من {{employeeName}} — {{leaveType}} من {{startDate}} إلى {{endDate}}',  '["employeeName","leaveType","startDate","endDate"]'),
  ('leave.request.approved',   'in_app', 'تمت الموافقة على إجازتك', 'تمت الموافقة على طلب إجازتك {{leaveType}} من {{startDate}} إلى {{endDate}}',               '["leaveType","startDate","endDate"]'),
  ('leave.request.rejected',   'in_app', 'تم رفض طلب إجازتك',     'تم رفض طلب إجازتك {{leaveType}}. السبب: {{reason}}',                                        '["leaveType","reason"]'),
  ('attendance.late',          'in_app', 'تنبيه تأخير',            'تم تسجيل تأخير {{minutes}} دقيقة للموظف {{employeeName}}',                                   '["minutes","employeeName"]'),
  ('payroll.ready',            'in_app', 'كشف الراتب جاهز',        'كشف راتب شهر {{month}} جاهز للمراجعة — المبلغ: {{amount}} ريال',                              '["month","amount"]'),
  ('invoice.created',          'in_app', 'فاتورة جديدة',           'تم إنشاء فاتورة #{{invoiceRef}} بقيمة {{amount}} ريال',                                      '["invoiceRef","amount"]'),
  ('invoice.overdue',          'in_app', 'فاتورة متأخرة',          'الفاتورة #{{invoiceRef}} متأخرة السداد منذ {{days}} يوم',                                     '["invoiceRef","days"]'),
  ('approval.pending',         'in_app', 'طلب بانتظار موافقتك',    'لديك طلب {{requestType}} بانتظار موافقتك من {{requesterName}}',                                '["requestType","requesterName"]'),
  ('task.assigned',            'in_app', 'مهمة جديدة',             'تم تعيين مهمة لك: {{taskTitle}}',                                                             '["taskTitle"]'),
  ('task.overdue',             'in_app', 'مهمة متأخرة',            'المهمة "{{taskTitle}}" تجاوزت موعدها المحدد',                                                  '["taskTitle"]'),
  ('support.ticket.created',   'in_app', 'تذكرة دعم جديدة',       'تم فتح تذكرة دعم جديدة #{{ticketId}} — {{subject}}',                                          '["ticketId","subject"]'),
  ('fleet.maintenance.due',    'in_app', 'صيانة مركبة مستحقة',     'المركبة {{plateNumber}} مستحقة للصيانة — {{maintenanceType}}',                                  '["plateNumber","maintenanceType"]'),
  ('contract.expiring',        'in_app', 'عقد يقترب من الانتهاء',  'العقد #{{contractNumber}} ينتهي في {{expiryDate}}',                                            '["contractNumber","expiryDate"]'),
  ('leave.request.created',    'email',  'طلب إجازة جديد',         'تم تقديم طلب إجازة من {{employeeName}} — {{leaveType}} من {{startDate}} إلى {{endDate}}',  '["employeeName","leaveType","startDate","endDate"]'),
  ('payroll.ready',            'email',  'كشف الراتب جاهز',        'كشف راتب شهر {{month}} جاهز. يرجى مراجعة التفاصيل في النظام.',                                '["month","amount"]')
) AS t("templateKey", channel, "titleTemplate", "bodyTemplate", variables)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates nt
  WHERE (nt."companyId" = c.id OR nt."companyId" IS NULL)
    AND nt."templateKey" = t."templateKey" AND nt.channel = t.channel
);
