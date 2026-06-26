-- ============================================================
-- Migration 421: financial_import_mapping_presets  (م٢-ب)
-- ============================================================
-- ضرورة (موافقة المالك ٢٦‑٠٦ «كلها على التسلسل»): بوابة الاستيراد المالي (م٢-أ)
-- تعمل بقوالب جاهزة + كشف ترويسة تلقائي، لكن ملفات الشركاء غير القياسية تحتاج
-- تعيينًا يدويًا في كل مرة. هذا الجدول يحفظ قرار التعيين (ترويسة المصدر → حقل
-- المستند) لكل (شركة، مستخدم، قالب) ليُطبَّق تلقائيًا في المرة التالية — نفس نمط
-- umrah_import_mapping_presets (هجرة 234)، لكن **مملوك لمسار المالية** (لا تشابك
-- بين المسارات — الدستور قاعدة ٨).
--
-- عزل المستأجر (قاعدة ٧): companyId (NOT NULL) + branchId؛ كل SELECT يُفلتر
-- بـ companyId. مُعرَّف بـ userId للحفظ لكل مستخدم (مثل العمرة).
--
-- إضافية + idempotent (IF NOT EXISTS) — لا مساس بالدفتر.
--
-- @rollback: DROP TABLE IF EXISTS financial_import_mapping_presets;
--   (يُسقِط الفهارس الجزئية الثلاثة. المستخدمون يفقدون التعيينات المحفوظة فقط؛
--    بوابة الاستيراد تبقى عاملة بالقوالب الجاهزة + الكشف التلقائي.)
-- ============================================================

CREATE TABLE IF NOT EXISTS financial_import_mapping_presets (
  id            serial PRIMARY KEY,
  "companyId"   integer NOT NULL,
  "branchId"    integer,
  "userId"      integer NOT NULL,
  name          varchar(120) NOT NULL,
  -- مفتاح القالب الذي يُكمّله هذا التعيين (expense-detailed / payment-simple / …).
  "templateKey" varchar(40) NOT NULL,
  -- Record<sourceHeader, financeImportField>. القيمة الفارغة = «تجاهل هذا العمود».
  mapping       jsonb NOT NULL DEFAULT '{}'::jsonb,
  "isDefault"   boolean NOT NULL DEFAULT false,
  "createdAt"   timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt"   timestamptz NOT NULL DEFAULT NOW(),
  "deletedAt"   timestamptz
);

-- اسم تعيين فريد لكل (شركة، مستخدم، قالب) — يمنع التكرار العرضي.
CREATE UNIQUE INDEX IF NOT EXISTS financial_import_mapping_presets_name_uq
  ON financial_import_mapping_presets ("companyId", "userId", "templateKey", name)
  WHERE "deletedAt" IS NULL;

-- تعيين افتراضي واحد فقط لكل (شركة، مستخدم، قالب). المنفذ يُلغي علم الإخوة عند التحديث.
CREATE UNIQUE INDEX IF NOT EXISTS financial_import_mapping_presets_default_uq
  ON financial_import_mapping_presets ("companyId", "userId", "templateKey")
  WHERE "isDefault" = true AND "deletedAt" IS NULL;

-- فهرس قائمة المنسدلة (يُفلتر بالشركة/المستخدم/القالب).
CREATE INDEX IF NOT EXISTS financial_import_mapping_presets_list_idx
  ON financial_import_mapping_presets ("companyId", "userId", "templateKey")
  WHERE "deletedAt" IS NULL;

COMMENT ON TABLE financial_import_mapping_presets IS
  'م٢-ب: تعيينات محفوظة (ترويسة المصدر → حقل المستند المالي) لبوابة الاستيراد، لكل مستخدم/قالب.';
COMMENT ON COLUMN financial_import_mapping_presets.mapping IS
  'Record<sourceHeader, financeImportField>. القيمة الفارغة تعني «تجاهل هذا العمود».';
COMMENT ON COLUMN financial_import_mapping_presets."isDefault" IS
  'عند true، تُطبّق البوابة هذا التعيين تلقائيًا عند اختيار القالب.';
