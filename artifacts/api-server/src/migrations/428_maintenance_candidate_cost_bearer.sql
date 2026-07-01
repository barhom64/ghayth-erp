-- Migration 428 — capture costBearer operationally on the maintenance expense candidate
--
-- @rollback: Fully additive. To undo:
--   ALTER TABLE transport_billing_candidates DROP COLUMN IF EXISTS "costBearer";
--
-- البند ٤ ج-٥ (بإذن إبراهيم الصريح «اعتمد»): شريحة ٢ (#3034) جعلت postMaintenanceGL
-- يحترم costBearer، لكنه كان يُمرَّر **تجاوزًا عند المادْيَلة فقط** (المحاسب) — لا
-- يلتقطه مُكمِل تذكرة الصيانة (الأسطول) الذي يعرف مَن يتحمّل فعلًا (سائق أهمل /
-- يغطّيه التأمين). هذا العمود يحمل اختيار المُكمِل على الترشيح فيصل المحاسب
-- **كافتراض** (يبقى تجاوزه ممكنًا — المالية سلطة المال، حدّ TA-T18).
--
-- nullable: الترشيحات السابقة بلا قيمة → تُعامَل كـ company (متوافق رجعيًّا). يخصّ
-- ترشيح الصيانة؛ أنواع المصادر الأخرى تتركه NULL. لا فهرسة (يُقرأ مع صف الترشيح بالـid).

ALTER TABLE transport_billing_candidates
  ADD COLUMN IF NOT EXISTS "costBearer" TEXT;
