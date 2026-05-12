# /admin/event-monitor — `artifacts/ghayth-erp/src/pages/admin-event-monitor.tsx`

## 1. الميتاداتا
- المسار: `/admin/event-monitor`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-event-monitor.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:31`
- المجموعة: `admin`
- الكومبوننت: `AdminEventMonitor`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `event-monitor`
- سطور الملف: 149
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L49: "(بلا تسمية)" → `() => refetch()`

### القراءات (GET)
- GET `/admin/governance/event-catalog`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/admin.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `event-monitor` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/admin/event-monitor`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
