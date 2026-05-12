# /crm/leads/:id — `artifacts/ghayth-erp/src/pages/crm/lead-detail.tsx`

## 1. الميتاداتا
- المسار: `/crm/leads/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/crm/lead-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:87`
- المجموعة: `crm`
- الكومبوننت: `LeadDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 262
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L202: "(بلا تسمية)" → `() => navigate("/crm/activities")`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تفاصيل lead (عميل محتمل) قبل التحويل لـ opportunity.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل lead | crm | POST `/crm/leads` | `crm_leads` | ✅ |
| مصدر (source) | crm | `lead.source` (website/referral/event/...) | للـ marketing ROI | ✅ |
| فرز (qualification) | crm | تحديث `lead.score`, `qualifiedAt` | ✅ |
| إسناد لمندوب | hr/employees | `lead.assignedTo` → `employees.id` | round-robin أو يدوي | ✅ |
| متابعة (activities) | crm | `crm_activities.leadId` (calls/emails/meetings) | ✅ |
| **تحويل lead → opportunity** | crm | POST `/opportunities/from-lead/:id` | `crm_opportunities` + `lead.status='converted'` | ✅ |
| تحويل lead → client (مباشر) | crm | POST `/clients/from-lead/:id` | `clients` + nullify lead | ✅ |
| رفض (lost) | crm | PATCH `/leads/:id` status=`lost` مع reason | `lead_lost_reasons` للتحليل | ✅ |
| تذكير متابعة (cron) | comms | lead لم يُلامَس X أيام → reminder | `notifications` | ⚠ |
| ربط بـ marketing campaign | marketing | `lead.campaignId` → `marketing_campaigns` | للـ attribution | ✅ |
| تقرير conversion rate | bi | aggregation per source/rep/campaign | views | ✅ |
| Audit log | core | يقرأ من `auditMiddleware` لو `/crm/leads` ضمن ENTITY_MAP (حالياً `/crm/opportunities` فقط) | ⚠ تحقق |

تحقق يدوي:
- [ ] هل lead مكرر (نفس email/phone) يُكتشف ويُدمج آلياً؟
- [ ] هل إعادة فتح lost lead بعد سنة ممكنة (re-engagement)؟
- [ ] هل عمر lead في كل stage مرصود (time-in-stage) للـ funnel analysis؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/crm/leads → 404`
- landedUrl: `?`
- توصية: مغلق
