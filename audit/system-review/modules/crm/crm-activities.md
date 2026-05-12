# /crm/activities — `artifacts/ghayth-erp/src/pages/create/crm-create.tsx`

## 1. الميتاداتا
- المسار: `/crm/activities`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/crm-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:86`
- المجموعة: `crm`
- الكومبوننت: `CrmCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `activities`
- سطور الملف: 163
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/crm/opportunities` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L81: "مسح المسودة" → `clearDraft`
- L156: "(بلا تسمية)" → `() => setLocation("/crm")` 🔒
- L157: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/crm.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `activities` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/crm/activities`
- لقطة: `audit/screenshots/crm_activities.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
