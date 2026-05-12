# /daily-close — `artifacts/ghayth-erp/src/pages/manager-board.tsx`

## 1. الميتاداتا
- المسار: `/daily-close`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/manager-board.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:79`
- المجموعة: `operations`
- الكومبوننت: `ManagerBoard`
- subKey: — | minRoleLevel: 40
- الكيان المستنبط: `daily-close`
- سطور الملف: 491
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L177: "(بلا تسمية)" → `() => doApprove(item)` 🔒
- L180: "(بلا تسمية)" → `() => doReject(item)` 🔒
- L195: "مركز القرارات الكامل"
- L244: "(بلا تسمية)" → `() => doApprove(item)` 🔒
- L248: "(بلا تسمية)" → `() => doReject(item)` 🔒
- L268: "التفاصيل"
- L325: "الكل"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `daily-close` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/daily-close`
- لقطة: `audit/screenshots/daily_close.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
