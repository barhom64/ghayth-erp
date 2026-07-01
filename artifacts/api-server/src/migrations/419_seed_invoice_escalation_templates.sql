-- ===========================================================================
-- 419_seed_invoice_escalation_templates.sql
-- ---------------------------------------------------------------------------
-- WHAT:    seed 3 new notification template keys for the invoice collection
--          escalation tiers 21/30/60 (Spec ملف 03 §تحصيل 6 مراحل):
--             invoice.escalation.fm      — يوم 21 → تصعيد للمدير المالي
--             invoice.blocked.gm         — يوم 30 → إشعار GM + خيار الحظر
--             invoice.legal_handover     — يوم 60 → إشعار القانوني + churn
--
-- WHY:     PR #3010 (slice 1 of 9) added days 1+7 client reminders. This
--          slice 2 of 9 extends to the internal escalation tiers. The
--          existing invoice.overdue template is for the CLIENT — these
--          three are INTERNAL escalations addressed by name to the
--          responsible manager (CFO/GM/legal). They cite the client +
--          invoice + days + amount + the recommended action.
--
-- PLACEHOLDERS (every variable matches the call site in cronScheduler
-- exactly — interpolateTemplate is strict):
--   invoice.escalation.fm:
--       {{managerName}}, {{clientName}}, {{invoiceRef}}, {{days}}, {{amount}}
--   invoice.blocked.gm:
--       {{managerName}}, {{clientName}}, {{invoiceRef}}, {{days}}, {{amount}}
--   invoice.legal_handover:
--       {{managerName}}, {{clientName}}, {{invoiceRef}}, {{days}}, {{amount}}
--
-- SAFETY:  pure idempotent seed (WHERE NOT EXISTS by company+key+channel+
--          language). No secret material. Channel = email for all (the
--          internal in_app path stays handled by the existing
--          broadcastAlert call in dailyInvoiceOverdueEscalation).
--
-- @rollback:
--   DELETE FROM notification_templates
--    WHERE "templateKey" IN ('invoice.escalation.fm','invoice.blocked.gm',
--                            'invoice.legal_handover') AND "isDefault" = true;
-- ===========================================================================

INSERT INTO notification_templates
  ("companyId", "templateKey", channel, language, "titleTemplate", "bodyTemplate", variables, "isActive", "isDefault")
SELECT c.id, t."templateKey", t.channel, t.language, t."titleTemplate", t."bodyTemplate", t.variables::jsonb, true, true
FROM companies c
CROSS JOIN (VALUES
  -- ── يوم 21 → تصعيد للمدير المالي ────────────────────────────────────────
  ('invoice.escalation.fm', 'email', 'ar', 'تصعيد فاتورة متأخرة: {{invoiceRef}} (٢١ يومًا)',
   '<p>الأستاذ/ة {{managerName}}،</p><p>الفاتورة <strong>#{{invoiceRef}}</strong> للعميل <strong>{{clientName}}</strong> تجاوزت {{days}} يومًا من تاريخ الاستحقاق.</p><ul><li><strong>المبلغ المستحق:</strong> {{amount}} ريال</li><li><strong>المرحلة:</strong> تصعيد للمدير المالي</li></ul><p>يُرجى مراجعة الحالة واتخاذ القرار المناسب (تواصل مباشر مع العميل، خطة سداد، أو تصعيد إلى GM).</p>',
   '["managerName","clientName","invoiceRef","days","amount"]'),
  ('invoice.escalation.fm', 'email', 'en', 'Overdue invoice escalated: {{invoiceRef}} (21 days)',
   '<p>Dear {{managerName}},</p><p>Invoice <strong>#{{invoiceRef}}</strong> for client <strong>{{clientName}}</strong> is now {{days}} days past due.</p><ul><li><strong>Outstanding:</strong> SAR {{amount}}</li><li><strong>Stage:</strong> escalated to Finance Manager</li></ul><p>Please review and decide next steps (direct outreach, payment plan, or escalation to GM).</p>',
   '["managerName","clientName","invoiceRef","days","amount"]'),

  -- ── يوم 30 → إشعار GM + حظر فعلي + طلب اعتماد الغرامة ───────────────────
  -- ملاحظة: نُعلن عن الحظر فقط (يُطبَّق فعلياً عبر منع إنشاء فواتير جديدة
  -- في finance-invoices.ts عند isBlacklisted=TRUE). الغرامة 2% تتطلّب قيداً
  -- محاسبياً مع assertion على سطور القيد (دستور غيث)، فلا ندّعي تطبيقها
  -- — نطلب اعتمادها يدوياً من GM. تأتي الأتمتة لاحقاً في شريحة منفصلة.
  ('invoice.blocked.gm', 'email', 'ar', 'تصعيد فاتورة متأخرة وحظر العميل: {{invoiceRef}} (٣٠ يومًا)',
   '<p>الأستاذ/ة {{managerName}}،</p><p>الفاتورة <strong>#{{invoiceRef}}</strong> للعميل <strong>{{clientName}}</strong> تجاوزت {{days}} يومًا من تاريخ الاستحقاق.</p><ul><li><strong>المبلغ المستحق:</strong> {{amount}} ريال</li><li><strong>المرحلة:</strong> تصعيد للمدير العام</li><li><strong>الإجراء التلقائي:</strong> تم وضع العميل في القائمة السوداء (إصدار فواتير جديدة لهذا العميل سيُرفض حتى رفع الحظر).</li></ul><p>قرارك مطلوب: متابعة قانونية مبكرة، أو خطة سداد بشروط، أو اعتماد تطبيق غرامة 2% شهرياً (قيد يدوي)، أو رفع الحظر من ملف العميل.</p>',
   '["managerName","clientName","invoiceRef","days","amount"]'),
  ('invoice.blocked.gm', 'email', 'en', 'Overdue invoice + client blocked: {{invoiceRef}} (30 days)',
   '<p>Dear {{managerName}},</p><p>Invoice <strong>#{{invoiceRef}}</strong> for client <strong>{{clientName}}</strong> is now {{days}} days past due.</p><ul><li><strong>Outstanding:</strong> SAR {{amount}}</li><li><strong>Stage:</strong> escalated to GM</li><li><strong>Automatic action:</strong> client blacklisted (new invoices for this client will be rejected until the block is lifted).</li></ul><p>Your decision: early legal action, conditional payment plan, approve a 2% monthly late fee (manual journal entry), or lift the block from the client profile.</p>',
   '["managerName","clientName","invoiceRef","days","amount"]'),

  -- ── يوم 60 → إشعار القانوني + تصنيف العميل churned ──────────────────────
  ('invoice.legal_handover', 'email', 'ar', 'إحالة قانونية: فاتورة {{invoiceRef}} (٦٠ يومًا)',
   '<p>الأستاذ/ة {{managerName}}،</p><p>الفاتورة <strong>#{{invoiceRef}}</strong> للعميل <strong>{{clientName}}</strong> تجاوزت {{days}} يومًا.</p><ul><li><strong>المبلغ المستحق:</strong> {{amount}} ريال</li><li><strong>المرحلة:</strong> إحالة للقسم القانوني</li><li><strong>الإجراء التلقائي:</strong> تم تحديث تصنيف العميل إلى <strong>churned</strong>.</li></ul><p>يُرجى فتح قضية تحصيل قانونية وتحديد المسار (ودي، إنذار رسمي، تنفيذ).</p>',
   '["managerName","clientName","invoiceRef","days","amount"]'),
  ('invoice.legal_handover', 'email', 'en', 'Legal handover: invoice {{invoiceRef}} (60 days)',
   '<p>Dear {{managerName}},</p><p>Invoice <strong>#{{invoiceRef}}</strong> for client <strong>{{clientName}}</strong> is now {{days}} days past due.</p><ul><li><strong>Outstanding:</strong> SAR {{amount}}</li><li><strong>Stage:</strong> handed over to Legal</li><li><strong>Automatic action:</strong> client classification updated to <strong>churned</strong>.</li></ul><p>Please open a collection case and decide the path (amicable, formal notice, or enforcement).</p>',
   '["managerName","clientName","invoiceRef","days","amount"]')
) AS t("templateKey", channel, language, "titleTemplate", "bodyTemplate", variables)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates nt
   WHERE nt."companyId" = c.id
     AND nt."templateKey" = t."templateKey"
     AND nt.channel = t.channel
     AND nt.language = t.language
);
