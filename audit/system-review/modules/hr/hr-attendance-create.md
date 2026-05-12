# /hr/attendance/create — `artifacts/ghayth-erp/src/pages/create/hr/attendance-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/attendance/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/attendance-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:92`
- المجموعة: `hr`
- الكومبوننت: `AttendanceCreate`
- subKey: `attendance` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 180
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/check-in` | POST | — | — | — | — | ✅ | ✅ | — |
| _(write)_ | `/hr/check-out` | POST | — | — | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L101: "مسح المسودة" → `clearDraft`
- L141: "(بلا تسمية)" → `handleGetLocation` 🔒
- L172: "(بلا تسمية)" → `() => setLocation("/hr/attendance")` 🔒
- L173: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/attendance/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/hr_attendance_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
