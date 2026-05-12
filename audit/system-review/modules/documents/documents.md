# /documents — `artifacts/ghayth-erp/src/pages/documents-page.tsx`

## 1. الميتاداتا
- المسار: `/documents`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/documents-page.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/documentsRoutes.tsx:11`
- المجموعة: `documents`
- الكومبوننت: `DocumentsPage`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `documents`
- سطور الملف: 428
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L137: "رفع مستند"
- L138: "إنشاء مستند"
- L200: "(بلا تسمية)" → `() => handleDownload(d.id, d.fileName)`
- L205: "الإصدارات"
- L210: "(بلا تسمية)" → `() => handleStatusChange(d.id, "approved")`
- L215: "(بلا تسمية)" → `() => handleStatusChange(d.id, "cancelled")`
- L220: "(بلا تسمية)" → `() => handleStatusChange(d.id, "draft")`
- L268: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L279: "(بلا تسمية)" → `() => setShowForm(false)`
- L304: "(بلا تسمية)" → `() => setShowForm(true)`
- L346: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L357: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/documents/folders`
- GET `/documents/templates`
- GET `/documents/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/documents.md` (إن وُجد) وعدّد:
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
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/documents`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
