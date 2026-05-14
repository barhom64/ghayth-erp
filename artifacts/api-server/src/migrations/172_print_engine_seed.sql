-- ============================================================
-- Migration 081: Print Engine v2 — Seed permissions + preset templates
-- ------------------------------------------------------------
-- Seeds the new print:* permissions into role_permissions so the engine
-- works out of the box for built-in roles. Templates are also seeded for
-- each phase-1 entityType as 'preset' classic templates so the resolver
-- always finds a fallback.
-- ============================================================

-- 1. Seed role_permissions ---------------------------------------------------

INSERT INTO role_permissions (role, permission, "companyId")
SELECT r.role, p.perm, NULL
FROM (VALUES
  ('owner'),('general_manager'),('admin'),
  ('branch_manager'),('finance_manager'),('hr_manager'),
  ('supervisor'),('accountant'),('cashier'),('employee'),('sales')
) AS r(role)
CROSS JOIN (VALUES
  ('print:read'),
  ('print:create')
) AS p(perm)
ON CONFLICT DO NOTHING;

-- Per-entity print permissions (granted to a broad set; revoke as needed)
INSERT INTO role_permissions (role, permission, "companyId")
SELECT r.role, p.perm, NULL
FROM (VALUES
  ('owner'),('general_manager'),('admin'),
  ('branch_manager'),('finance_manager'),('hr_manager'),
  ('supervisor'),('accountant'),('cashier'),('sales')
) AS r(role)
CROSS JOIN (VALUES
  ('print:invoice:create'),
  ('print:quotation:create'),
  ('print:sales_order:create'),
  ('print:delivery_note:create'),
  ('print:credit_note:create'),
  ('print:pos_receipt:create'),
  ('print:receipt_voucher:create'),
  ('print:payment_voucher:create'),
  ('print:purchase_request:create'),
  ('print:purchase_order:create'),
  ('print:goods_receipt:create'),
  ('print:journal_entry:create'),
  ('print:account_statement:create'),
  ('print:stock_transfer:create'),
  ('print:stock_adjustment:create'),
  ('print:item_barcode_label:create'),
  ('print:leave_request:create'),
  ('print:loan_request:create'),
  ('print:maintenance_request:create'),
  ('print:payroll:create'),
  ('print:official_letter:create'),
  ('print:employee_contract:create'),
  ('print:employee_profile:create'),
  ('print:discipline_memo:create'),
  ('print:rental_contract:create'),
  ('print:legal_contract:create'),
  ('print:trial_balance:create'),
  ('print:fleet_trips:create'),
  ('print:umrah_invoice:create'),
  ('print:umrah_statement:create')
) AS p(perm)
ON CONFLICT DO NOTHING;

-- Reprint + template management permissions (managers only)
INSERT INTO role_permissions (role, permission, "companyId")
SELECT r.role, p.perm, NULL
FROM (VALUES
  ('owner'),('general_manager'),('admin'),
  ('branch_manager'),('finance_manager'),('hr_manager')
) AS r(role)
CROSS JOIN (VALUES
  ('print:reprint:create'),
  ('print:reprint:approve'),
  ('templates:read'),
  ('templates:write'),
  ('print_jobs:read')
) AS p(perm)
ON CONFLICT DO NOTHING;

-- Read-only for auditors
INSERT INTO role_permissions (role, permission, "companyId") VALUES
  ('audit', 'print_jobs:read', NULL),
  ('compliance', 'print_jobs:read', NULL),
  ('audit', 'templates:read', NULL),
  ('compliance', 'templates:read', NULL)
ON CONFLICT DO NOTHING;

-- 2. Seed classic preset templates for each phase-1 entityType ---------------
-- These act as the universal fallback when a branch has not customised yet.
-- They are scoped to companyId NULL = "system defaults" the resolver can clone.

INSERT INTO document_templates (
  name, description, content, category, "type",
  "entityType", "paperSize", "mode", "presetKey",
  "variables", "htmlContent", "isDefault", "isActive",
  "isThermal", "version"
)
SELECT
  t.label || ' — كلاسيكي',
  'قالب افتراضي مع ترويسة الفرع — ' || t.label,
  t.entity_type,
  'print',
  t.entity_type,
  t.entity_type,
  t.paper,
  'preset',
  'classic',
  '[]'::jsonb,
  t.html,
  true,
  true,
  t.is_thermal,
  1
FROM (VALUES
  ('quotation', 'A4', false, 'عرض سعر',
'<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center;border-bottom:2px solid #333;padding-bottom:8px;margin:18px 0">عرض سعر / Quotation</h2>
<div class="meta-grid">
  <div><strong>الرقم:</strong> {{entity.ref}}</div>
  <div><strong>التاريخ:</strong> {{entity.date}}</div>
  <div><strong>صالح حتى:</strong> {{entity.validUntil}}</div>
  <div><strong>العميل:</strong> {{client.name}}</div>
</div>
{{entity.itemsTable}}
<div class="totals">
  <div>المجموع الفرعي: {{entity.subtotal}}</div>
  <div>ضريبة القيمة المضافة: {{entity.vat}}</div>
  <div class="grand">الإجمالي: <strong>{{entity.total}}</strong></div>
</div>
<div class="notes">{{entity.notes}}</div>
{{branch.footer}}</div>'),
  ('sales_order', 'A4', false, 'أمر بيع',
'<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">أمر بيع / Sales Order</h2>
<div class="meta-grid"><div><strong>الرقم:</strong> {{entity.ref}}</div><div><strong>التاريخ:</strong> {{entity.date}}</div><div><strong>العميل:</strong> {{client.name}}</div></div>
{{entity.itemsTable}}
<div class="totals"><div class="grand">الإجمالي: <strong>{{entity.total}}</strong></div></div>
{{branch.footer}}</div>'),
  ('delivery_note', 'A4', false, 'سند تسليم',
'<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">سند تسليم / Delivery Note</h2>
<div class="meta-grid"><div><strong>الرقم:</strong> {{entity.ref}}</div><div><strong>التاريخ:</strong> {{entity.date}}</div><div><strong>العميل:</strong> {{client.name}}</div></div>
{{entity.itemsTable}}
<div class="signatures"><div>توقيع المسلِّم</div><div>توقيع المستلِم</div></div>
{{branch.footer}}</div>'),
  ('credit_note', 'A4', false, 'إشعار دائن',
'<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center;color:#dc2626">إشعار دائن / Credit Note</h2>
<div class="meta-grid"><div><strong>الرقم:</strong> {{entity.ref}}</div><div><strong>الفاتورة المرجعية:</strong> {{entity.invoiceRef}}</div><div><strong>التاريخ:</strong> {{entity.date}}</div><div><strong>العميل:</strong> {{client.name}}</div></div>
{{entity.itemsTable}}
<div class="totals"><div class="grand">إجمالي المردود: <strong>{{entity.total}}</strong></div></div>
{{branch.footer}}</div>'),
  ('pos_receipt', 'THERMAL_80', true, 'إيصال POS',
'<div class="thermal-doc">{{branch.letterheadThermal}}
<div class="t-title">إيصال نقطة بيع</div>
<div class="t-meta">#{{entity.ref}} — {{entity.date}}</div>
{{entity.itemsTable}}
<div class="t-totals">
  <div>المجموع: {{entity.subtotal}}</div>
  <div>ضريبة: {{entity.vat}}</div>
  <div class="t-grand">الإجمالي: {{entity.total}}</div>
</div>
<div class="t-qr">{{entity.zatcaQr}}</div>
{{branch.footerThermal}}</div>'),
  ('receipt_voucher', 'A4', false, 'سند قبض',
'<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center;color:#16a34a">سند قبض / Receipt Voucher</h2>
<div class="meta-grid"><div><strong>الرقم:</strong> {{entity.ref}}</div><div><strong>التاريخ:</strong> {{entity.date}}</div><div><strong>القابض:</strong> {{entity.from}}</div><div><strong>المبلغ:</strong> {{entity.amount}}</div></div>
<p>وذلك مقابل: {{entity.note}}</p>
<div class="signatures"><div>توقيع المستلم</div><div>توقيع المحاسب</div></div>
{{branch.footer}}</div>'),
  ('purchase_request', 'A4', false, 'طلب شراء',
'<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">طلب شراء / Purchase Request</h2>
<div class="meta-grid"><div><strong>الرقم:</strong> {{entity.ref}}</div><div><strong>التاريخ:</strong> {{entity.date}}</div><div><strong>القسم:</strong> {{entity.department}}</div></div>
{{entity.itemsTable}}
<div class="signatures"><div>الطالب</div><div>المعتمد</div></div>
{{branch.footer}}</div>'),
  ('goods_receipt', 'A4', false, 'سند استلام',
'<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">سند استلام بضاعة / Goods Receipt</h2>
<div class="meta-grid"><div><strong>الرقم:</strong> {{entity.ref}}</div><div><strong>التاريخ:</strong> {{entity.date}}</div><div><strong>المورد:</strong> {{entity.supplier}}</div></div>
{{entity.itemsTable}}
<div class="signatures"><div>المستلم</div><div>المسؤول</div></div>
{{branch.footer}}</div>'),
  ('journal_entry', 'A4', false, 'قيد يومي',
'<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">قيد محاسبي / Journal Entry</h2>
<div class="meta-grid"><div><strong>رقم القيد:</strong> {{entity.ref}}</div><div><strong>التاريخ:</strong> {{entity.date}}</div><div><strong>البيان:</strong> {{entity.narration}}</div></div>
{{entity.linesTable}}
<div class="totals"><div>مدين: {{entity.totalDebit}}</div><div>دائن: {{entity.totalCredit}}</div></div>
{{branch.footer}}</div>'),
  ('account_statement', 'A4', false, 'كشف حساب',
'<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">كشف حساب / Account Statement</h2>
<div class="meta-grid"><div><strong>الحساب:</strong> {{entity.accountName}}</div><div><strong>الفترة:</strong> {{entity.periodFrom}} - {{entity.periodTo}}</div></div>
{{entity.movementsTable}}
<div class="totals"><div>الرصيد الافتتاحي: {{entity.openingBalance}}</div><div class="grand">الرصيد الختامي: <strong>{{entity.closingBalance}}</strong></div></div>
{{branch.footer}}</div>'),
  ('stock_transfer', 'A4', false, 'نقل مخزون',
'<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">سند نقل مخزون / Stock Transfer</h2>
<div class="meta-grid"><div><strong>الرقم:</strong> {{entity.ref}}</div><div><strong>التاريخ:</strong> {{entity.date}}</div><div><strong>من:</strong> {{entity.fromWarehouse}}</div><div><strong>إلى:</strong> {{entity.toWarehouse}}</div></div>
{{entity.itemsTable}}
<div class="signatures"><div>المرسل</div><div>المستلم</div></div>
{{branch.footer}}</div>'),
  ('stock_adjustment', 'A4', false, 'تسوية مخزون',
'<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">تسوية مخزون / Stock Adjustment</h2>
<div class="meta-grid"><div><strong>الرقم:</strong> {{entity.ref}}</div><div><strong>التاريخ:</strong> {{entity.date}}</div><div><strong>المستودع:</strong> {{entity.warehouse}}</div><div><strong>السبب:</strong> {{entity.reason}}</div></div>
{{entity.itemsTable}}
{{branch.footer}}</div>'),
  ('item_barcode_label', 'LABEL_50x30', false, 'ملصق صنف',
'<div class="label-doc">
<div class="l-name">{{entity.name}}</div>
<div class="l-sku">{{entity.sku}}</div>
<div class="l-barcode">{{entity.barcode}}</div>
<div class="l-price">{{entity.price}}</div>
</div>'),
  ('leave_request', 'A4', false, 'طلب إجازة',
'<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">طلب إجازة / Leave Request</h2>
<div class="meta-grid"><div><strong>الموظف:</strong> {{employee.name}}</div><div><strong>الرقم الوظيفي:</strong> {{employee.empNumber}}</div><div><strong>نوع الإجازة:</strong> {{entity.leaveType}}</div><div><strong>من:</strong> {{entity.startDate}}</div><div><strong>إلى:</strong> {{entity.endDate}}</div><div><strong>عدد الأيام:</strong> {{entity.days}}</div></div>
<p>السبب: {{entity.reason}}</p>
<div class="signatures"><div>الموظف</div><div>المدير المباشر</div><div>الموارد البشرية</div></div>
{{branch.footer}}</div>'),
  ('loan_request', 'A4', false, 'طلب سلفة',
'<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">طلب سلفة / Loan Request</h2>
<div class="meta-grid"><div><strong>الموظف:</strong> {{employee.name}}</div><div><strong>المبلغ:</strong> {{entity.amount}}</div><div><strong>عدد الأقساط:</strong> {{entity.installments}}</div><div><strong>القسط الشهري:</strong> {{entity.monthly}}</div></div>
<p>السبب: {{entity.reason}}</p>
<div class="signatures"><div>الموظف</div><div>المدير المالي</div><div>الموارد البشرية</div></div>
{{branch.footer}}</div>'),
  ('maintenance_request', 'A4', false, 'طلب صيانة',
'<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">طلب صيانة / Maintenance Request</h2>
<div class="meta-grid"><div><strong>الرقم:</strong> {{entity.ref}}</div><div><strong>التاريخ:</strong> {{entity.date}}</div><div><strong>الموقع:</strong> {{entity.location}}</div><div><strong>الأولوية:</strong> {{entity.priority}}</div></div>
<p>{{entity.description}}</p>
{{branch.footer}}</div>')
) AS t(entity_type, paper, is_thermal, label, html)
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates dt
  WHERE dt."entityType" = t.entity_type
    AND dt."presetKey" = 'classic'
    AND dt."companyId" IS NULL
);
