-- ════════════════════════════════════════════════════════════════════════════
-- approval-systems-sync-check.sql
-- الدفعة 1 من توحيد نظامَي الموافقة — أداة تشخيص **للقراءة فقط** (صفر كتابة).
--
-- الغرض: قبل أي توحيد، نقيس هل النظامين متزامنان فعلًا على بياناتك الحيّة:
--   • approval_chains (approval_requests) = منطق الموافقة العامل.
--   • workflow_instances = ما يغذّي اللوحات (مركز القرارات/مساحتي/التنفيذيين).
-- الأنواع ذات الكتابة المزدوجة: السلف/الإضافي/الخروج/المشتريات.
-- انحراف الحالة بين النظامين لنفس الطلب = خطر فعلي يجب معالجته قبل/أثناء التوحيد.
--
-- الربط: approval_requests.refType (مفرد) + 's' = workflow_instances.refTable (جمع).
-- الاستعمال: psql "$DATABASE_URL" -f scripts/approval-systems-sync-check.sql
-- ════════════════════════════════════════════════════════════════════════════

\echo '════════ 1) ملخّص التزامن لكل نوع طلب (منحرف>0 ⟹ خطر) ════════'
WITH pairs AS (
  SELECT ar."refType",
         ar.status AS approval_status,
         wi.status AS workflow_status
  FROM approval_requests ar
  JOIN workflow_instances wi
    ON wi."companyId" = ar."companyId"
   AND wi."refId"     = ar."refId"
   AND wi."refTable"  = ar."refType" || 's'
  WHERE ar."refType" IN
        ('hr_employee_loan','hr_overtime_request','hr_exit_request','purchase_request')
)
SELECT "refType"                                                  AS "نوع الطلب",
       COUNT(*)                                                   AS "أزواج",
       COUNT(*) FILTER (WHERE approval_status =  workflow_status) AS "متزامن",
       COUNT(*) FILTER (WHERE approval_status <> workflow_status) AS "منحرف"
FROM pairs
GROUP BY "refType"
ORDER BY "منحرف" DESC;

\echo ''
\echo '════════ 2) طلبات فردانية (في نظام واحد فقط — أيتام محتملون) ════════'
-- في approval_requests دون نظير في workflow_instances (أو العكس) = ازدواج ناقص.
SELECT
  (SELECT COUNT(*) FROM approval_requests ar
     WHERE ar."refType" IN ('hr_employee_loan','hr_overtime_request','hr_exit_request','purchase_request')
       AND NOT EXISTS (SELECT 1 FROM workflow_instances wi
                       WHERE wi."companyId"=ar."companyId" AND wi."refId"=ar."refId"
                         AND wi."refTable"=ar."refType"||'s'))       AS "في approval فقط",
  (SELECT COUNT(*) FROM workflow_instances wi
     WHERE wi."refTable" IN ('hr_employee_loans','hr_overtime_requests','hr_exit_requests','purchase_requests')
       AND NOT EXISTS (SELECT 1 FROM approval_requests ar
                       WHERE ar."companyId"=wi."companyId" AND ar."refId"=wi."refId"
                         AND ar."refType"||'s'=wi."refTable"))       AS "في workflow فقط";

\echo ''
\echo '════════ 3) تفاصيل المنحرفة (أول 200 — لمراجعة يدوية) ════════'
WITH pairs AS (
  SELECT ar."refType", ar."refId",
         ar.status AS approval_status, wi.status AS workflow_status
  FROM approval_requests ar
  JOIN workflow_instances wi
    ON wi."companyId" = ar."companyId" AND wi."refId" = ar."refId"
   AND wi."refTable"  = ar."refType" || 's'
  WHERE ar."refType" IN
        ('hr_employee_loan','hr_overtime_request','hr_exit_request','purchase_request')
)
SELECT "refType" AS "النوع", "refId" AS "المعرّف",
       approval_status AS "حالة_approval_chains", workflow_status AS "حالة_workflow"
FROM pairs
WHERE approval_status <> workflow_status
ORDER BY "refType", "refId"
LIMIT 200;

\echo ''
\echo 'منحرف=0 وأيتام=0 ⟹ النظامان متطابقان (الكتابة المزدوجة سليمة، التوحيد أأمن).'
\echo 'منحرف>0 أو أيتام>0 ⟹ يجب التسوية قبل/أثناء التوحيد (الدفعات التالية).'
