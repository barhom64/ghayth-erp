# /admin — `artifacts/ghayth-erp/src/pages/admin.tsx`

## 1. الميتاداتا
- المسار: `/admin`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:21`
- المجموعة: `admin`
- الكومبوننت: `Admin`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `admin`
- سطور الملف: 104
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

لوحة الإدارة الرئيسية — entry point لكل وظائف admin.

| القسم الفرعي | الوصف | المرجع |
|--------------|------|--------|
| Users | إدارة المستخدمين | راجع `admin-users.md` |
| Roles | الأدوار والصلاحيات | راجع `admin-roles.md` |
| RBAC Matrix | مصفوفة الصلاحيات | راجع `admin-rbac-matrix.md` |
| Integrations | تكاملات خارجية | راجع `admin-integrations.md` |
| Monitoring | مراقبة النظام | راجع `admin-monitoring.md` |
| Logs | السجلات الموحّدة | راجع `admin-logs.md` |
| System Registry | سجل النظام | راجع `admin-system-registry.md` |
| Posting Failures | فشل الترحيل | راجع `admin-posting-failures.md` |
| Event Monitor | مراقبة الأحداث | راجع `admin-event-monitor.md` |
| Automation | الأتمتة | راجع `automation.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Landing dashboard | GET `/admin` | aggregations | ✅ |
| System health summary | counts من كل registry | راجع `admin-monitoring.md` | ✅ |
| Quick actions | navigate to sub-modules | ✅ |
| Recent admin activity | last N from `audit_logs` WHERE actor=admin | ✅ |
| Alerts banner | active critical issues | راجع `admin-event-monitor.md` | ✅ |
| RBAC | min superadmin أو admin role | level≥80 | ✅ critical |
| Audit log access (read) | كل من يدخل admin | `access_logs` | ✅ |

تحقق يدوي:
- [ ] هل /admin مرئي فقط للأدوار المخوّلة (hide-when-denied)؟
- [ ] هل أي قسم فرعي مفتوح بدون RBAC ثانوي؟ (defense-in-depth)
- [ ] هل دخول /admin يولّد access_log مع IP + user-agent؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `admin` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin`
- لقطة: `audit/screenshots/admin.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
