# /admin/lifecycle-monitor — `artifacts/ghayth-erp/src/pages/admin-lifecycle-monitor.tsx`

## 1. الميتاداتا
- المسار: `/admin/lifecycle-monitor`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-lifecycle-monitor.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:33`
- المجموعة: `admin`
- الكومبوننت: `AdminLifecycleMonitor`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `lifecycle-monitor`
- سطور الملف: 152
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L27: "(بلا تسمية)" → `() => refetch()`

### القراءات (GET)
- GET `/admin/governance/lifecycle-machines`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
Lifecycle Monitor — راصد transitions النادرة/الشاذة في كيانات النظام.

| الكيان | Transitions طبيعية | شاذة (raise alert) |
|--------|---------------------|---------------------|
| invoice | draft → sent → paid | paid → cancelled (refund) |
| leave_request | pending → approved/rejected | approved → cancelled مع used_days > 0 |
| payroll_run | pending → completed | completed → reversed |
| property_contract | active → expired/terminated | terminated < 30 days after signing |
| employee | hired → active → exited | active → suspended → reactivated multiple times |
| crm_opportunity | new → qualified → won/lost | lost → won (re-opened) |
| support_ticket | open → in_progress → resolved | resolved → reopened > 3 times |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| تتبّع transitions | `applyTransition()` يُسجّل في `lifecycle_events` | ✅ |
| كشف الشذوذ | rules per entity | يطلق `system_alert` | ⚠ |
| Audit trail per entity | GET `/admin/lifecycle/:entityType/:id` | aggregation | ✅ |
| إشعار للـ admin | event=`lifecycle_anomaly` | `notifications` | ⚠ |
| Forensics للأحداث الحرجة | rebuild state من event_logs | ✅ |
| إعادة محاكاة (replay) | للـ debugging | ⚠ |

تحقق يدوي:
- [ ] هل قواعد الشذوذ قابلة للتعديل بدون نشر كود؟
- [ ] هل الـ rollback يحفظ كل transitions الوسيطة؟
- [ ] هل RBAC على lifecycle محصور حسب الكيان؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `lifecycle-monitor` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/lifecycle-monitor`
- لقطة: `audit/screenshots/admin_lifecycle_monitor.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
