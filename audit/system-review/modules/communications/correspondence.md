# /correspondence — `artifacts/ghayth-erp/src/pages/notification-engine.tsx`

## 1. الميتاداتا
- المسار: `/correspondence`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/notification-engine.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/commsRoutes.tsx:14`
- المجموعة: `communications`
- الكومبوننت: `NotificationEngine`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `correspondence`
- سطور الملف: 969
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L138: "حفظ" → `saveRule`
- L139: "(بلا تسمية)" → `() => setEditId(null)`
- L153: "(بلا تسمية)" → `() => startEdit(rule)`
- L235: "(بلا تسمية)" → `() => setShowNew(!showNew)`
- L270: "إنشاء" → `() => setShowNew(false)`
- L271: "إنشاء" → `createTemplate`
- L304: "حفظ" → `saveEdit`
- L305: "(بلا تسمية)" → `() => setEditId(null)`
- L309: "(بلا تسمية)"
- L315: "(بلا تسمية)" → `() => deleteTemplate(tId)`
- L408: "(بلا تسمية)" → `() => setShowNew(!showNew)`
- L448: "(بلا تسمية)" → `() => removeStep(idx)`
- L455: "خطوة" → `addStep`
- L457: "إنشاء" → `() => setShowNew(false)`
- L458: "إنشاء" → `createChain`
- L482: "(بلا تسمية)" → `() => deleteChain(chain.id as number)`
- L561: "(بلا تسمية)" → `() => setShowNew(!showNew)`
- L593: "إنشاء" → `() => setShowNew(false)`
- L594: "إنشاء" → `createWebhook`
- L632: "(بلا تسمية)" → `() => deleteWebhook(wh.id as number)`
- L894: "حفظ التفضيلات" → `saveAll` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `correspondence` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/correspondence`
- لقطة: `audit/screenshots/correspondence.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
