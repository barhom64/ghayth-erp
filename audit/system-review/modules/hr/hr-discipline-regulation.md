# /hr/discipline/regulation — `artifacts/ghayth-erp/src/pages/hr/auto-detection.tsx`

## 1. الميتاداتا
- المسار: `/hr/discipline/regulation`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/auto-detection.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:137`
- المجموعة: `hr`
- الكومبوننت: `AutoDetection`
- subKey: `violations` | minRoleLevel: —
- الكيان المستنبط: `regulation`
- سطور الملف: 597
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L225: "(بلا تسمية)"
- L261: "(بلا تسمية)"
- L270: "(بلا تسمية)" → `handleRun`

### القراءات (GET)
- GET `/hr/discipline/auto-detection/settings`
- GET `/hr/discipline/auto-detection/summary`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `regulation` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/discipline/regulation`
- لقطة: `audit/screenshots/hr_discipline_regulation.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
