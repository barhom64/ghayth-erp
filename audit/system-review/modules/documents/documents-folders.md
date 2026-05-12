# /documents/folders — `artifacts/ghayth-erp/src/pages/create/documents/version-upload.tsx`

## 1. الميتاداتا
- المسار: `/documents/folders`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/documents/version-upload.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/documentsRoutes.tsx:15`
- المجموعة: `documents`
- الكومبوننت: `VersionUpload`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `folders`
- سطور الملف: 166
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L106: "مسح المسودة" → `clearDraft`
- L133: "(بلا تسمية)" → `handleUploadVersion` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `folders` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/documents/folders`
- لقطة: `audit/screenshots/documents_folders.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
