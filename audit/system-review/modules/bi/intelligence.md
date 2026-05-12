# /intelligence — `artifacts/ghayth-erp/src/pages/intelligence.tsx`

## 1. الميتاداتا
- المسار: `/intelligence`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/intelligence.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:119`
- المجموعة: `bi`
- الكومبوننت: `Intelligence`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `intelligence`
- سطور الملف: 127
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/intelligence/overview`
- GET `/intelligence/alerts`
- GET `/intelligence/daily-schedule`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/bi.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `intelligence` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/intelligence`
- لقطة: `audit/screenshots/intelligence.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
