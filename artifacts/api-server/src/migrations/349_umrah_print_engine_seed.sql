-- 349_umrah_print_engine_seed.sql
--
-- WHAT:    seed `document_templates` with classic preset rows for the
--          umrah-specific entityTypes the print engine already knows
--          how to render (BESPOKE_PRESETS map in templateResolver.ts).
--          Each row is companyId-NULL "system default" so the resolver
--          step 4 finds it for any tenant + the dashboard print-template
--          editor has something to clone.
--
-- WHY:     U-14 audit (#2306) §2.6 + §3.4 documented that
--          172_print_engine_seed.sql skipped umrah entirely. Without
--          a DB row, the editor falls back to read-only in-memory
--          HTML — operators can't customise umrah templates via the
--          dashboard (the file-level BESPOKE_PRESETS are immutable).
--          This migration ships the classic preset row for each umrah
--          entityType so the editor's "edit template" path lights up
--          for umrah operations.
--
-- SAFETY:  pure additive. INSERT … ON CONFLICT DO NOTHING — re-running
--          the migration is safe. No row update / no delete. Existing
--          umrah templates already created by a tenant are NOT touched.
--          The BESPOKE_PRESETS code-map remains the in-engine fallback
--          (resolver step 5 → BESPOKE_PRESETS[entityType]?.() ??
--          universalFallback). The seed only unblocks the dashboard
--          editor path.
--
-- @rollback: BEGIN;
--   DELETE FROM document_templates
--    WHERE "companyId" IS NULL
--      AND "presetKey" = 'classic'
--      AND "entityType" IN (
--        'umrah_pilgrim', 'umrah_invoice', 'umrah_agent_invoice',
--        'umrah_agent', 'umrah_sub_agent', 'umrah_penalty',
--        'umrah_violation', 'umrah_transport', 'umrah_package',
--        'umrah_season'
--      );
--   COMMIT;

BEGIN;

-- Fix 2026-06-15 (TA-T18-DR follow-up after migration 339 fix):
-- the original INSERT referenced `templateType` and `entityKind`
-- columns that don't exist on the live schema. The real columns
-- per the schema dump + sibling migration 172 are `"type"` (no
-- `templateType`) and there's no `entityKind` at all (the
-- entity-type identity already lives on `"entityType"`). `category`
-- is the print-vs-other classifier — sibling 172 uses the literal
-- 'print' for it, so we follow the same convention here instead of
-- duplicating `entity_type` into category. CI never caught this
-- because guard.yml marks every migration as already-applied; only
-- fresh `provision-agent-db.sh` runs hit the wall.
INSERT INTO document_templates (
  name, description, "entityType",
  "type", category,
  "paperSize", mode, "presetKey",
  variables, "htmlContent",
  "isDefault", "isActive", "isThermal", version
)
SELECT
  t.label || ' — كلاسيكي',
  'قالب افتراضي — ' || t.label,
  t.entity_type,
  t.entity_type,
  'print',
  'A4',
  'preset',
  'classic',
  '[]'::jsonb,
  t.html,
  true,
  true,
  false,
  1
FROM (VALUES
  ('umrah_pilgrim',
   'بطاقة معتمر',
   '<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center;border-bottom:2px solid #333;padding-bottom:8px;margin:18px 0">بطاقة معتمر</h2>
<div class="meta-grid">
  <div><strong>الاسم:</strong> {{entity.fullName}}</div>
  <div><strong>رقم نُسُك:</strong> {{entity.nuskNumber}}</div>
  <div><strong>الجنسية:</strong> {{entity.nationality}}</div>
  <div><strong>رقم الجواز:</strong> {{entity.passportNumber}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>تاريخ الدخول:</strong> {{entity.entryDate}}</div>
  <div><strong>تاريخ الخروج:</strong> {{entity.exitDate}}</div>
  <div><strong>المجموعة:</strong> {{entity.groupName}}</div>
</div>
{{branch.footer}}</div>'),

  ('umrah_invoice',
   'فاتورة عمرة',
   '<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center;border-bottom:2px solid #333;padding-bottom:8px;margin:18px 0">فاتورة مبيعات عمرة</h2>
<div class="meta-grid">
  <div><strong>الرقم:</strong> {{entity.ref}}</div>
  <div><strong>التاريخ:</strong> {{entity.invoiceDate}}</div>
  <div><strong>الوكيل الفرعي:</strong> {{entity.subAgentName}}</div>
  <div><strong>الموسم:</strong> {{entity.seasonName}}</div>
</div>
{{entity.itemsTable}}
<div class="totals">
  <div>المجموع الفرعي: {{entity.subtotal}}</div>
  <div>الغرامات: {{entity.penaltiesTotal}}</div>
  <div>ضريبة القيمة المضافة: {{entity.vatAmount}}</div>
  <div class="grand">الإجمالي: <strong>{{entity.total}}</strong></div>
</div>
{{branch.footer}}</div>'),

  ('umrah_agent_invoice',
   'فاتورة وكيل عمرة',
   '<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center;border-bottom:2px solid #333;padding-bottom:8px;margin:18px 0">فاتورة وكيل</h2>
<div class="meta-grid">
  <div><strong>الرقم:</strong> {{entity.ref}}</div>
  <div><strong>التاريخ:</strong> {{entity.invoiceDate}}</div>
  <div><strong>الوكيل الرئيسي:</strong> {{entity.agentName}}</div>
  <div><strong>الموسم:</strong> {{entity.seasonName}}</div>
</div>
{{entity.itemsTable}}
<div class="totals">
  <div class="grand">الإجمالي: <strong>{{entity.total}}</strong></div>
</div>
{{branch.footer}}</div>'),

  ('umrah_agent',
   'بطاقة وكيل رئيسي',
   '<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">بطاقة الوكيل الرئيسي</h2>
<div class="meta-grid">
  <div><strong>الاسم:</strong> {{entity.name}}</div>
  <div><strong>رقم العقد:</strong> {{entity.contractRef}}</div>
  <div><strong>العميل المالي:</strong> {{entity.clientName}}</div>
  <div><strong>الجوّال:</strong> {{entity.phone}}</div>
</div>
{{branch.footer}}</div>'),

  ('umrah_sub_agent',
   'بطاقة وكيل فرعي',
   '<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">بطاقة الوكيل الفرعي</h2>
<div class="meta-grid">
  <div><strong>الاسم:</strong> {{entity.name}}</div>
  <div><strong>رمز الوكيل الفرعي:</strong> {{entity.nuskCode}}</div>
  <div><strong>الوكيل الرئيسي:</strong> {{entity.agentName}}</div>
  <div><strong>العميل المالي:</strong> {{entity.clientName}}</div>
  <div><strong>الجوّال:</strong> {{entity.phone}}</div>
</div>
{{branch.footer}}</div>'),

  ('umrah_penalty',
   'إشعار غرامة عمرة',
   '<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center;color:#dc2626">إشعار غرامة</h2>
<div class="meta-grid">
  <div><strong>المعتمر:</strong> {{entity.pilgrimName}}</div>
  <div><strong>النوع:</strong> {{entity.type}}</div>
  <div><strong>المبلغ:</strong> {{entity.amount}}</div>
  <div><strong>التاريخ:</strong> {{entity.date}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<div class="notes">{{entity.notes}}</div>
{{branch.footer}}</div>'),

  ('umrah_violation',
   'مخالفة نظامية',
   '<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center;color:#dc2626">مخالفة نظامية</h2>
<div class="meta-grid">
  <div><strong>المعتمر:</strong> {{entity.pilgrimName}}</div>
  <div><strong>نوع المخالفة:</strong> {{entity.type}}</div>
  <div><strong>التاريخ:</strong> {{entity.date}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<div class="notes">{{entity.notes}}</div>
{{branch.footer}}</div>'),

  ('umrah_transport',
   'تنقّل عمرة',
   '<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">سند تنقّل</h2>
<div class="meta-grid">
  <div><strong>نوع الخدمة:</strong> {{entity.serviceType}}</div>
  <div><strong>السائق:</strong> {{entity.driverName}}</div>
  <div><strong>المركبة:</strong> {{entity.vehiclePlate}}</div>
  <div><strong>التاريخ:</strong> {{entity.tripDate}}</div>
  <div><strong>عدد المعتمرين:</strong> {{entity.pilgrimCount}}</div>
</div>
{{branch.footer}}</div>'),

  ('umrah_package',
   'باقة عمرة',
   '<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">باقة العمرة</h2>
<div class="meta-grid">
  <div><strong>الاسم:</strong> {{entity.name}}</div>
  <div><strong>الموسم:</strong> {{entity.seasonName}}</div>
  <div><strong>سعر التكلفة:</strong> {{entity.costPrice}}</div>
  <div><strong>سعر البيع:</strong> {{entity.sellPrice}}</div>
  <div><strong>المدّة:</strong> {{entity.duration}} يوم</div>
</div>
<div class="notes">{{entity.description}}</div>
{{branch.footer}}</div>'),

  ('umrah_season',
   'موسم العمرة',
   '<div class="print-doc">{{branch.letterhead}}
<h2 style="text-align:center">بطاقة الموسم</h2>
<div class="meta-grid">
  <div><strong>الموسم:</strong> {{entity.title}}</div>
  <div><strong>تاريخ البداية:</strong> {{entity.startDate}}</div>
  <div><strong>تاريخ النهاية:</strong> {{entity.endDate}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
{{branch.footer}}</div>')
) AS t(entity_type, label, html)
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates dt
   WHERE dt."entityType" = t.entity_type
     AND dt."presetKey" = 'classic'
     AND dt."companyId" IS NULL
);

COMMIT;
