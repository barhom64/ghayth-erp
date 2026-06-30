/**
 * أغراض حساب فاتورة المورد — قيم TEXT يحلّها المحرّك المالي خلفيًا إلى حساب GL.
 * مصدر واحد لصفحتَي إدخال فاتورة المورد: الكلاسيكية (vendor-invoice-create) +
 * التشغيلية (م٤ — financial-vendor-invoice-create). المفاتيح عقدٌ مع المحرّك،
 * فلا تُكرَّر ولا تُغيَّر بلا تطابق مع resolveAccountCode في الخلفية.
 */
export const ACCOUNT_PURPOSE_OPTIONS: { value: string; label: string }[] = [
  { value: "general_expense", label: "مصروف عام / إداري" },
  { value: "service_expense", label: "خدمات / أتعاب مهنية" },
  { value: "vehicle_expense", label: "مصروف مركبات (صيانة/وقود)" },
  { value: "project_cost", label: "تكلفة مشروع/مقاولات" },
  { value: "store_inventory", label: "مخزون / بضاعة" },
  { value: "inventory_receipt", label: "استلام مخزون" },
  { value: "fixed_asset_purchase", label: "شراء أصل ثابت (رسملة)" },
  { value: "supplier_prepayment", label: "دفعة مقدمة لمورد" },
];
