# /admin/violations-report — `artifacts/ghayth-erp/src/pages/admin-violations-report.tsx`

## 1. الميتاداتا
- المسار: `/admin/violations-report`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-violations-report.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:27`
- المجموعة: `admin`
- الكومبوننت: `AdminViolationsReport`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `violations-report`
- سطور الملف: 348
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تقرير المخالفات (Admin Violations Report) — security incidents + RBAC breaches.

| النوع | الوصف | المصدر |
|------|------|--------|
| Permission denied (UI bypass) | محاولة استدعاء API بدون role | `audit_logs WHERE outcome='denied'` |
| Direct URL navigation to blocked page | `AccessDenied` page hit | `event_logs.action='access_denied'` |
| Failed login attempts | brute-force محتمل | `auth_failures` per IP |
| Suspicious data access pattern | مستخدم يقرأ بيانات كثيرة في فترة قصيرة | `audit_logs` aggregate |
| Tenant scope violation محاولة | حاول قراءة data خارج companyId | الـ middleware يرفض ويسجل | 
| Field-level access bypass | عبر `maskFields()` (PR #481) | `event_logs.action='field_mask_attempt'` |
| HR violations (للموظفين العاديين) | راجع `hr-violations.md` | منفصل عن security |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Aggregate per type/user/date | GET `/admin/violations-report` | aggregations | ✅ |
| Detail per violation | drill-down للـ event | full payload | ✅ |
| Block IP (anti-abuse) | POST `/admin/block-ip` | `blocked_ips` | ⚠ |
| Reset user lockout | POST `/admin/users/:id/unlock` | `users.lockedAt=null` | ✅ |
| تنبيه للـ admin | event=`security_violation_critical` | `notifications` | ✅ |
| تقرير شهري للـ governance | export PDF | ✅ |
| Audit log إجباري | لكل تعديل في الـ violations | ✅ |

تحقق يدوي:
- [ ] هل نمط متكرر لنفس المستخدم يطلق lockout تلقائي + إشعار HR؟
- [ ] هل البيانات الشخصية في الـ report محمية بـ RBAC level 90+؟
- [ ] هل التقرير الشهري يحفظ snapshot للأرشيف لـ compliance؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `violations-report` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/violations-report`
- لقطة: `audit/screenshots/admin_violations_report.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
