# /documents/upload — `artifacts/ghayth-erp/src/pages/documents/documents-upload.tsx`

## 1. الميتاداتا
- المسار: `/documents/upload`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/documents/documents-upload.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/documentsRoutes.tsx:14`
- المجموعة: `documents`
- الكومبوننت: `DocumentsUpload`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `upload`
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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `upload` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/documents/upload`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
