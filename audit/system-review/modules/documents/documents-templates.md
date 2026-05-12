# /documents/templates — `artifacts/ghayth-erp/src/pages/documents/templates.tsx`

## 1. الميتاداتا
- المسار: `/documents/templates`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/documents/templates.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/documentsRoutes.tsx:16`
- المجموعة: `documents`
- الكومبوننت: `DocumentsTemplates`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `templates`
- سطور الملف: 515
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/documents/templates` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L234: "(بلا تسمية)" → `() => { setViewMode("list"); setEditingId(null);`
- L240: "معاينة" → `handleLivePreview` 🔒
- L243: "حفظ" → `handleSave`
- L345: "(بلا تسمية)" → `() => removeVariable(i)`
- L356: "إضافة متغير" → `addVariable` 🔒
- L417: "(بلا تسمية)" → `() => openEditor()`
- L476: "معاينة" → `() => handlePreview(t)`
- L479: "تعديل" → `() => openEditor(t)`
- L483: "حذف" → `() => handleDelete(t.id)`

### القراءات (GET)
- GET `/documents/templates`
- GET `/settings/branches`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/documents.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `templates` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L94 _(inline-data-array)_: `const statCards = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/documents/templates`
- لقطة: `audit/screenshots/documents_templates.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
