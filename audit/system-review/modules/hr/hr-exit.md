# /hr/exit — `artifacts/ghayth-erp/src/pages/create/hr/overtime-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/exit`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/overtime-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:128`
- المجموعة: `hr`
- الكومبوننت: `OvertimeCreate`
- subKey: `attendance` | minRoleLevel: —
- الكيان المستنبط: `exit`
- سطور الملف: 247
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/hr/overtime` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L129: "مسح المسودة" → `clearDraft`
- L235: "(بلا تسمية)" 🔒
- L239: "(بلا تسمية)" → `() => setLocation("/hr/overtime")`

### القراءات (GET)
- GET `/employees?limit=500`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `exit` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/exit`
- لقطة: `audit/screenshots/hr_exit.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
