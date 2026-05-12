# /documents/templates — `artifacts/ghayth-erp/src/pages/documents/documents-upload.tsx`

## 1. الميتاداتا
- المسار: `/documents/templates`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/documents/documents-upload.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/documentsRoutes.tsx:16`
- المجموعة: `documents`
- الكومبوننت: `DocumentsUpload`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `templates`
- سطور الملف: 229
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L136: "(بلا تسمية)" → `() => setLocation("/documents")`
- L159: "إضافة ربط" → `addEntityLink`
- L177: "(بلا تسمية)" → `() => removeEntityLink(idx)`

### القراءات (GET)
_لا قراءات._



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
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/documents/templates`
- لقطة: `audit/screenshots/documents_templates.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
