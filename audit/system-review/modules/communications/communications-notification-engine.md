# /communications/notification-engine — `artifacts/ghayth-erp/src/pages/notification-engine.tsx`

## 1. الميتاداتا
- المسار: `/communications/notification-engine`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/notification-engine.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/commsRoutes.tsx:12`
- المجموعة: `communications`
- الكومبوننت: `NotificationEngine`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `notification-engine`
- سطور الملف: 970
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L140: "(بلا تسمية)" → `() => setEditId(null)`
- L154: "(بلا تسمية)" → `() => startEdit(rule)`
- L271: "(بلا تسمية)" → `() => setShowNew(false)`
- L306: "(بلا تسمية)" → `() => setEditId(null)`
- L449: "(بلا تسمية)" → `() => removeStep(idx)`
- L456: "خطوة" → `addStep`
- L458: "(بلا تسمية)" → `() => setShowNew(false)`
- L594: "(بلا تسمية)" → `() => setShowNew(false)`

### القراءات (GET)
- GET `/notification-engine/routing-rules`
- GET `/notification-engine/fallback-chains`
- GET `/notification-engine/templates`
- GET `/notification-engine/fallback-chains`
- GET `/notification-engine/webhooks`
- GET `/notification-engine/delivery-log?limit=20`
- GET `/notification-engine/preferences`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/communications.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `notification-engine` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/communications/notification-engine`
- لقطة: `audit/screenshots/communications_notification_engine.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
