# /hr/official-letters — `artifacts/ghayth-erp/src/pages/create/hr/contracts-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/official-letters`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/contracts-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:164`
- المجموعة: `hr`
- الكومبوننت: `ContractsCreate`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `official-letters`
- سطور الملف: 114
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L66: "مسح المسودة" → `clearDraft`
- L107: "(بلا تسمية)" → `() => setLocation("/hr/contracts")` 🔒
- L108: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `official-letters` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/official-letters`
- لقطة: `audit/screenshots/hr_official_letters.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
