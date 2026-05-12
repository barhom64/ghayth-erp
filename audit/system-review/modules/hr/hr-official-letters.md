# /hr/official-letters — `artifacts/ghayth-erp/src/pages/hr/official-letters.tsx`

## 1. الميتاداتا
- المسار: `/hr/official-letters`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/official-letters.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:164`
- المجموعة: `hr`
- الكومبوننت: `OfficialLetters`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `official-letters`
- سطور الملف: 248
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L89: "معاينة وطباعة" → `() => setPreviewLetter(l)`
- L164: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/hr/official-letters`



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
