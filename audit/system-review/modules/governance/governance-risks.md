# /governance/risks — `artifacts/ghayth-erp/src/pages/create/governance/risks-create.tsx`

## 1. الميتاداتا
- المسار: `/governance/risks`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/governance/risks-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/governanceRoutes.tsx:21`
- المجموعة: `governance`
- الكومبوننت: `RisksCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `risks`
- سطور الملف: 149
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/governance/risks` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L61: "مسح المسودة" → `clearDraft`
- L142: "(بلا تسمية)" → `() => setLocation("/governance/risks")` 🔒
- L143: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/governance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `risks` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/governance/risks`
- لقطة: `audit/screenshots/governance_risks.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
