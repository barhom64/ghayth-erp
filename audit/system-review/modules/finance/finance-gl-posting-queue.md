# /finance/gl-posting-queue — `artifacts/ghayth-erp/src/pages/create/finance/journal-manual-create.tsx`

## 1. الميتاداتا
- المسار: `/finance/gl-posting-queue`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/journal-manual-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:133`
- المجموعة: `finance`
- الكومبوننت: `JournalManualCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `gl-posting-queue`
- سطور الملف: 195
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L94: "مسح المسودة" → `clearDraft`
- L177: "+ إضافة سطر" → `addLine`
- L185: "(بلا تسمية)" → `() => navigate("/finance/journal-manual")` 🔒
- L186: "(بلا تسمية)" 🔒

### القراءات (GET)
- GET `/finance/chart-of-accounts${scopeSuffix}`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `gl-posting-queue` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **N/A** — لم يُشغّل بعد لهذا المسار.
- توصية: **TBD**
