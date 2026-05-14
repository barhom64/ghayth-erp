# /my-space — `artifacts/ghayth-erp/src/pages/my-space.tsx`

## 1. الميتاداتا
- المسار: `/my-space`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/my-space.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:64`
- المجموعة: `misc`
- الكومبوننت: `MySpace`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `my-space`
- سطور الملف: 129
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L72: "مركز القرارات"

### القراءات (GET)
- GET `/intelligence/suggestions`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

بوابة الموظف الذاتية (My Space / ESS - Employee Self Service).

| القسم | الوصف | المرجع |
|------|------|--------|
| My profile | الملف الشخصي | راجع `hr-employee-profile-byid.md` |
| My attendance | الحضور | راجع `my-attendance.md` |
| My leaves | الإجازات | راجع `my-leave-request.md` |
| My loans | السلف | راجع `my-loans.md` |
| My payslip | كشف الراتب | راجع `my-payslip.md` |
| My documents | المستندات | راجع `my-documents.md` |
| My overtime | الإضافي | راجع `my-overtime.md` |
| My performance | التقييم | راجع `my-performance.md` |
| My requests | طلباتي | راجع `requests.md` |
| My tasks | مهامي | راجع `tasks.md` |
| My calendar | جدولي | راجع `calendar.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| ESS landing | GET `/my-space` | aggregations per user | ✅ |
| Summary widgets (leave balance, pending requests, etc.) | aggregate | ✅ |
| Quick actions (request leave, view payslip, etc.) | navigation | ✅ |
| Notifications inbox | راجع `notifications.md` | ✅ |
| Self-update profile (limited fields) | PATCH | راجع `hr-employee-profile-byid.md` | ⚠ |
| **PDPL** — own data access only | scope enforcement | ✅ critical |
| تكامل مع all my-* sub-modules | navigation | ✅ |
| Audit log on access | for security audit | `access_logs` | ✅ |
| RBAC | self only — no cross-employee access | ✅ critical |
| Mobile-friendly | responsive | ✅ |

تحقق يدوي:
- [ ] هل scope صارم على الـ user (لا cross-employee access)?
- [ ] هل limited fields update enforce بدقة (لا تعديل salary أو position)?
- [ ] هل mobile UX smooth للـ self-service?
- [ ] هل sensitive data masked appropriately في الـ display?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `my-space` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/my-space`
- لقطة: `audit/screenshots/my_space.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
