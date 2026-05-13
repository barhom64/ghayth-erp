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

محرّك الإشعارات — admin UI لإدارة routing + templates + webhooks.

| المكوّن | الوظيفة |
|---------|---------|
| Routing rules | متى يذهب إشعار، لمن، عبر أي قناة | `notification_routing_rules` |
| Fallback chains | إذا فشلت القناة الأساسية، جرب التالي | `notification_fallback_chains` |
| Templates | نصوص جاهزة للـ rendering | `notification_templates` (i18n: ar/en) |
| Webhooks | للـ outbound integrations | `notification_webhooks` |
| Delivery log | تتبّع كل إشعار مرسل | `notification_deliveries` |
| Preferences | per user per event | `notification_preferences` |
| Quiet hours | متى لا يرسل | per user |
| Throttle | spam prevention | per event per user per minute |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List rules | GET `/notification-engine/routing-rules` | ✅ |
| Create/Update rule | POST/PATCH | إجباري للـ admin | ✅ |
| Test rule (dry-run) | POST `/test` | لا يرسل فعلياً | ⚠ |
| List fallback chains | GET `/fallback-chains` | ✅ |
| List templates | GET `/templates` | ✅ |
| Render template (preview) | POST `/templates/:id/preview` | with mock data | ⚠ |
| List webhooks | GET `/webhooks` | ✅ |
| Test webhook | POST `/webhooks/:id/test` | sends test payload | ⚠ |
| View delivery log | GET `/delivery-log` | للـ debug | ✅ |
| Failed deliveries | filter | للـ retry | ✅ |
| Manual retry | POST `/delivery/:id/retry` | للـ admin | ⚠ |
| User preferences | GET/PATCH `/preferences` | per current user | ✅ |
| تكامل مع `notifications.md` (consumer view) | ✅ |
| تكامل مع `eventCatalog.ts` | source of truth للأحداث | ✅ |
| تكامل مع `comms-templates.md` | rendering | ✅ |
| Audit log إجباري | كل تعديل rule/template | `audit_logs` | ✅ |
| RBAC | admin + comms-manager فقط | ✅ critical |

تحقق يدوي:
- [ ] هل عند تعديل rule في الإنتاج، هل يحدث rollback آمن إن سبّب طوفان إشعارات؟
- [ ] هل webhook test لا يلوث delivery log الحقيقي؟
- [ ] هل الـ quiet hours تحترم تايم زون كل مستخدم؟
- [ ] هل throttle شغّال لكل قناة منفصلة؟

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
