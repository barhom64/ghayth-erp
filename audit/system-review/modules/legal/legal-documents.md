# /legal/documents — `artifacts/ghayth-erp/src/pages/create/legal-cases-create.tsx`

## 1. الميتاداتا
- المسار: `/legal/documents`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/legal-cases-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:27`
- المجموعة: `legal`
- الكومبوننت: `LegalCasesCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `documents`
- سطور الملف: 136
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/legal/cases` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L61: "مسح المسودة" → `clearDraft`
- L129: "(بلا تسمية)" → `() => setLocation("/legal")` 🔒
- L130: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/legal.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `documents` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/legal/documents`
- لقطة: `audit/screenshots/legal_documents.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
