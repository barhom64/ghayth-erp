# /admin/logs — `artifacts/ghayth-erp/src/pages/admin/logs.tsx`

## 1. الميتاداتا
- المسار: `/admin/logs`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin/logs.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:24`
- المجموعة: `admin`
- الكومبوننت: `AdminLogs`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `logs`
- سطور الملف: 272
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L172: "تصدير جدولي" → `exportCSV`
- L175: "(بلا تسمية)" → `() => refetch()`

### القراءات (GET)
- GET `/audit-logs/entities`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/admin.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `logs` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/logs`
- لقطة: `audit/screenshots/admin_logs.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
