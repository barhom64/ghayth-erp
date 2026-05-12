# /communications/letters/create — `artifacts/ghayth-erp/src/pages/create/communications/letters-create.tsx`

## 1. الميتاداتا
- المسار: `/communications/letters/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/communications/letters-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/commsRoutes.tsx:13`
- المجموعة: `communications`
- الكومبوننت: `LettersCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 133
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L65: "مسح المسودة" → `clearDraft`
- L126: "(بلا تسمية)" → `() => setLocation("/communications")` 🔒
- L127: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/communications.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/communications/letters/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/communications_letters_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
