# /fleet/traffic-violations — `artifacts/ghayth-erp/src/pages/fleet/traffic-violations.tsx`

## 1. الميتاداتا
- المسار: `/fleet/traffic-violations`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/fleet/traffic-violations.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:52`
- المجموعة: `fleet`
- الكومبوننت: `TrafficViolations`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `traffic-violations`
- سطور الملف: 287
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L158: "(بلا تسمية)" → `() => handlePay(v.id)`
- L173: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L212: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/fleet/traffic-violations`
- GET `/fleet/vehicles?limit=200`
- GET `/fleet/drivers?limit=200`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/fleet.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `traffic-violations` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/fleet/traffic-violations`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
