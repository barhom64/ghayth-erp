# /legal/correspondence — `artifacts/ghayth-erp/src/pages/legal/judgments.tsx`

## 1. الميتاداتا
- المسار: `/legal/correspondence`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/legal/judgments.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:23`
- المجموعة: `legal`
- الكومبوننت: `LegalJudgments`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `correspondence`
- سطور الملف: 73
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/legal/judgments/financial-report`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/legal.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `correspondence` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/legal/correspondence`
- لقطة: `audit/screenshots/legal_correspondence.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
