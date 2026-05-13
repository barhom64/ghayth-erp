# /crm/pipeline — `artifacts/ghayth-erp/src/pages/crm.tsx`

## 1. الميتاداتا
- المسار: `/crm/pipeline`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/crm.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:85`
- المجموعة: `crm`
- الكومبوننت: `CRM`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `pipeline`
- سطور الملف: 264
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L133: "(بلا تسمية)" → `() => setPreviewItem(o)`

### القراءات (GET)
- GET `/crm/pipeline`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

CRM Pipeline (Kanban view) — متابعة الفرص (opportunities) عبر مراحل البيع.

| المرحلة | الوصف | يطلق |
|---------|------|------|
| Lead | أوّل اتصال | event=`lead_created` |
| Qualified | تأهيل | criteria check |
| Proposal | عرض سعر مرسل | راجع `crm-quotes.md` |
| Negotiation | تفاوض | track price changes |
| Won | فاز بالصفقة | يولّد sales order تلقائياً + invoice — راجع `finance-invoices.md` |
| Lost | فقد | reason mandatory |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List pipeline (kanban) | GET `/crm/pipeline` | `opportunities` GROUP BY stage | ✅ |
| Drag-drop stage change | PATCH `/crm/opportunities/:id/stage` | lifecycle | راجع `lifecycle/crm.ts` ✅ |
| Update value | PATCH `/crm/opportunities/:id` | للـ forecasting | ✅ |
| Mark Won | POST `/crm/opportunities/:id/win` | يولّد: sales order + invoice | راجع `finance-invoices.md` ✅ |
| Mark Lost | POST `/crm/opportunities/:id/lose` | with reason | ✅ |
| إنشاء فرصة | راجع `crm-create.md` | ✅ |
| Activities (calls/meetings/emails) | راجع `crm-activities.md` | ✅ |
| Forecast (per stage probability) | aggregate | راجع `bi-kpis.md` | ✅ |
| Stuck opportunities (X days no activity) | alert | event=`opportunity_stale` | راجع `notifications.md` |
| Quota tracking | per sales rep | راجع `crm-quotas.md` | ⚠ |
| تكامل مع `finance-invoices.md` | عند Won | invoice مع GL entries | ✅ critical |
| تكامل مع `commissions.md` | لو فيه عمولات | ⚠ |
| Audit log | كل تغيير stage | `audit_logs` | ✅ |
| RBAC scope | sales rep يرى الخاصة به، manager يرى team | راجع `admin-scopes.md` | ✅ |

تحقق يدوي:
- [ ] هل Won يولّد sales order تلقائياً أم يحتاج خطوة منفصلة؟
- [ ] هل تغيير المرحلة من Won → Lost يلغي الـ invoice المرتبط؟
- [ ] هل forecast يأخذ probability per stage (configurable)؟
- [ ] هل sales rep يستطيع تعديل value بعد marked Won؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `pipeline` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/crm/pipeline`
- لقطة: `audit/screenshots/crm_pipeline.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
