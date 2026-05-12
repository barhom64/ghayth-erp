# /communications — `artifacts/ghayth-erp/src/pages/communications.tsx`

## 1. الميتاداتا
- المسار: `/communications`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/communications.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/commsRoutes.tsx:11`
- المجموعة: `communications`
- الكومبوننت: `Communications`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `communications`
- سطور الملف: 648
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L139: "(بلا تسمية)" → `handleSubscribe` 🔒
- L145: "إرسال تجريبي" → `handleTest` 🔒
- L149: "إلغاء الاشتراك" → `handleUnsubscribe` 🔒
- L236: "(بلا تسمية)" → `() => refetch()`
- L407: "(بلا تسمية)" → `() => setShow(!show)`
- L415: "(بلا تسمية)"

### القراءات (GET)
- GET `/communications/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/communications.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `communications` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L379 _(inline-data-array)_: `const options = [`

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/communications`)
- توصية: **TBD**
- المشاكل: 1 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
