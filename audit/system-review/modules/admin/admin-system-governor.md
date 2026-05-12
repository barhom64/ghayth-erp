# /admin/system-governor — `artifacts/ghayth-erp/src/pages/admin-system-governor.tsx`

## 1. الميتاداتا
- المسار: `/admin/system-governor`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-system-governor.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:28`
- المجموعة: `admin`
- الكومبوننت: `AdminSystemGovernor`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `system-governor`
- سطور الملف: 105
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L25: "(بلا تسمية)" → `() => refetch()`

### القراءات (GET)
- GET `/admin/governance/system-guards`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
System Governor — لوحة admin للتحكّم الكامل بنظام إدارة المخاطر والامتثال.

| الميزة | الوحدة | الوظيفة |
|--------|---------|---------|
| Feature flags | admin | تفعيل/إيقاف ميزات system-wide (ZATCA, e-invoice, gov-integrations) |
| Rate limits | admin/rate-limit | تعديل حدود التكرار per route/user |
| RBAC matrix | admin/rbac-matrix | راجع `admin-rbac-matrix.md` |
| Policy engine | admin/policy | قواعد business_rules القابلة للتعديل |
| Event monitor | admin/events | عرض event_logs real-time |
| System health | admin/monitoring | DB health, queue depth, error rates |
| Posting failures | admin/posting-failures | عرض القيود المالية الفاشلة + إعادة المحاولة |
| Lifecycle monitor | admin/lifecycle | حالات entity transitions النادرة |
| Domain registry | admin/domain-registry | تخصيص modules per company |
| Violations report | admin/violations-report | اختراقات RBAC المحاولة |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| تعديل feature flag | POST `/admin/feature-flags` | `feature_flags` | ✅ |
| Audit log + emit event | إجباري | `audit_logs`, `event_logs` | ✅ critical |
| Approval workflow (للتغييرات الحرجة) | يحتاج 2-of-N | `approval_chains` | ⚠ تحقق |
| إشعار للـ admins | event=`admin.feature_flag.changed` | `notifications` | ⚠ |
| تأثير real-time | invalidate caches | في الذاكرة | ✅ |

تحقق يدوي:
- [ ] هل تغيير feature flag system-wide يتطلب موافقة 2 admins؟
- [ ] هل rate limit أقل من الحد الأدنى الآمن يطلق تحذير قبل الحفظ؟
- [ ] هل re-try لـ posting failure يتم في فترة محاسبية مفتوحة فقط؟
- [ ] هل violations-report يحفظ المحاولات الفاشلة حتى لو الـ user لم يصل لـ DB؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `system-governor` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/system-governor`
- لقطة: `audit/screenshots/admin_system_governor.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
