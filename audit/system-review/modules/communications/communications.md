# /communications — `artifacts/ghayth-erp/src/pages/communications.tsx`

## 1. الميتاداتا
- المسار: `/communications`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/communications.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/commsRoutes.tsx:11`
- المجموعة: `communications`
- الكومبوننت: `Communications`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `communications`
- سطور الملف: 650
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L237: "(بلا تسمية)" → `() => refetch()`
- L408: "(بلا تسمية)" → `() => setShow(!show)`

### القراءات (GET)
- GET `/communications/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
مركز الاتصالات (Communications Hub) — يجمع كل القنوات.

| القناة | الوحدة المتأثرة |
|--------|-----------------|
| Internal notifications | comms — in-app `notifications` |
| Email | gov-integrations — SMTP/SendGrid |
| SMS | gov-integrations — Twilio/STC |
| WhatsApp Business | gov-integrations — Meta Cloud API |
| Push notifications | comms — VAPID web push |
| Letters (رسمية) | راجع `communications-letters-create.md` |
| Correspondence (incoming/outgoing) | راجع `correspondence.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Aggregate كل القنوات | `communications.ts` GET `/` | aggregations | ✅ |
| إعدادات القنوات | settings | راجع `settings-channels` | ✅ |
| Auto-routing per event type | rules → channel | لكل event type | ⚠ |
| Templates (للرسائل المتكررة) | راجع `documents-templates.md` | ✅ |
| Throttling per recipient | rate-limit | لمنع spam | ⚠ |
| Opt-in/Opt-out per channel | `comms_preferences` | per user | ⚠ |
| Delivery tracking | `messaging_log` (status: sent/delivered/failed/read) | ✅ |
| Audit log إجباري للرسائل الخارجية | `auditMiddleware` (`/communications`) | راجع PR #481 maskFields() | ✅ |
| تأثير على الـ KPIs | bi | engagement rate, delivery rate | views | ✅ |
| تكامل CRM (للعملاء) | crm | راجع `clients-byid.md` | ✅ |

تحقق يدوي:
- [ ] هل failure في قناة (مثلاً SMS) يحاول channel ثانٍ تلقائياً (fallback)؟
- [ ] هل recipient لديه opt-out على email لا يُرسَل له حتى لو فعّال على push؟
- [ ] هل سعر الرسائل (cost tracking) محسوب per recipient/channel/month؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `communications` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/communications`
- لقطة: `audit/screenshots/communications.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
