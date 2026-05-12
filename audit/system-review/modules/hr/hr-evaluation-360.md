# /hr/evaluation-360 — `artifacts/ghayth-erp/src/pages/create/hr/evaluation-360-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/evaluation-360`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/evaluation-360-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:149`
- المجموعة: `hr`
- الكومبوننت: `Evaluation360Create`
- subKey: `performance` | minRoleLevel: —
- الكيان المستنبط: `evaluation-360`
- سطور الملف: 200
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/hr/evaluation-cycles` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L102: "مسح المسودة" → `clearDraft`
- L163: "إضافة" → `addParticipant`
- L192: "(بلا تسمية)" → `() => setLocation("/hr/evaluation-360")` 🔒
- L193: "(بلا تسمية)" → `handleSave` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `evaluation-360` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/evaluation-360`
- لقطة: `audit/screenshots/hr_evaluation_360.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
