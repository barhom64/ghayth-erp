-- Migration 431 — رمز ضريبة على رأس وثائق الشراء (دقّة حساب ضريبة المدخلات)
--
-- @rollback: Fully additive. To undo:
--   ALTER TABLE purchase_orders DROP COLUMN IF EXISTS "taxCode";
--   ALTER TABLE vendor_invoices DROP COLUMN IF EXISTS "taxCode";
--
-- البند ٤ (بإذن إبراهيم الصريح «اعتمد واكمل» بعد ملاحظة الحارس): جانب المبيعات
-- يربط رمز ضريبة الفاتورة بحسابه (#3073)، والمشتريات تشتق من الرمز القياسي
-- للشركة (#3084). هذا العمود يتيح **الدقّة لكل وثيقة شراء**: رأس أمر الشراء
-- وفاتورة المورد يحملان رمز ضريبة، فيُرحَّل سطر ضريبة المدخلات إلى حساب ذلك
-- الرمز (tax_codes.inputAccountId) بدل الرمز القياسي — لازم لشركة تشغّل عدّة
-- معدّلات شراء غير صفرية لحسابات مختلفة.
--
-- nullable: الوثائق السابقة بلا قيمة → تُشتقّ من الرمز القياسي للشركة كما في
-- #3084 (متوافق رجعيًّا تمامًا). يُقرأ مع صف الوثيقة بالـid فلا فهرسة.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS "taxCode" TEXT;

ALTER TABLE vendor_invoices
  ADD COLUMN IF NOT EXISTS "taxCode" TEXT;
