# /crm — `artifacts/ghayth-erp/src/pages/crm.tsx`

## 1. الميتاداتا
- المسار: `/crm`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/crm.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:83`
- المجموعة: `crm`
- الكومبوننت: `CRM`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `crm`
- سطور الملف: 264
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L133: "(بلا تسمية)" → `() => setPreviewItem(o)`

### القراءات (GET)
- GET `/crm/pipeline`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
CRM pipeline + leads → فرص → عملاء. المرجع: `docs/blueprints/crm-clients.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل lead | crm | `crm.ts` POST `/leads` | `crm_leads` | ✅ |
| تحويل lead → opportunity | crm | POST `/opportunities/from-lead/:id` | `crm_opportunities`, `crm_leads.status='converted'` | ✅ |
| تتبّع stage في pipeline | crm | PATCH `/opportunities/:id` (stage) | `crm_opportunities.stage` (`new\|qualified\|proposal\|won\|lost`) | ✅ |
| ربط بفاتورة (عند `won`) | finance/invoices | POST `/finance/invoices` مع `opportunityId` | `invoices.opportunityId` | ⚠ تحقق من ربط FK |
| تسجيل أنشطة (calls, meetings) | crm | `crm_activities` | `crm_activities` (entity-audited via middleware) | ✅ |
| إسناد للمندوب | hr/employees | `crm_opportunities.salespersonId` → `employees.id` | ✅ |
| KPIs المندوب (conversion rate) | bi | aggregation | views | ✅ |
| إشعار عند `won` / `lost` | comms | event=`crm.opportunity.won\|lost` | `notifications` | ✅ |
| تكامل WhatsApp/SMS (إن مفعّل) | gov-integrations | اختياري | `messaging_log` | ⚠ |
| Audit log | core | `auditMiddleware` (`/crm/opportunities`, `/crm/activities`) | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل lead لم يُلامَس منذ N يوم يطلق reminder تلقائي؟
- [ ] هل تحويل opportunity إلى فاتورة بدون تأكيد المدير ممكن أم محظور؟
- [ ] هل عمولة المندوب محسوبة تلقائياً عند `won` ومرتبطة بـ HR/payroll؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `crm` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/crm`
- لقطة: `audit/screenshots/crm.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
