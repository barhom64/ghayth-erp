# /legal/sessions — `artifacts/ghayth-erp/src/pages/legal.tsx`

## 1. الميتاداتا
- المسار: `/legal/sessions`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/legal.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:19`
- المجموعة: `legal`
- الكومبوننت: `Legal`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `sessions`
- سطور الملف: 396
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L104: "نسخ العقد"
- L150: "عقد جديد"
- L270: "قضية جديدة"

### القراءات (GET)
- GET `/legal/stats`
- GET `/legal/stats`
- GET `/legal/cases`
- GET `/legal/financial-report`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/legal.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `sessions` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/legal/sessions`
- لقطة: `audit/screenshots/legal_sessions.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
