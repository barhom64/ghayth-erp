# /notifications — `artifacts/ghayth-erp/src/pages/notifications.tsx`

## 1. الميتاداتا
- المسار: `/notifications`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/notifications.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:118`
- المجموعة: `misc`
- الكومبوننت: `Notifications`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `notifications`
- سطور الملف: 128
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L108: "(بلا تسمية)"

### القراءات (GET)
- GET `/notifications`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

مركز الإشعارات الموحّد — كل تنبيهات المستخدم في مكان واحد. يُدعى من كل الوحدات.

| القناة | الاستخدام | المرجع |
|--------|-----------|--------|
| In-app (toast + bell badge) | الافتراضي | `notification-engine.ts` |
| Email | للطلبات الرسمية + المراسلات | `lib/email/transport` |
| SMS | للأمور العاجلة (OTP، تنبيه حرج) | Twilio/STC — راجع `admin-integrations.md` |
| WhatsApp Business | للعملاء + الموردين | Meta Cloud API |
| Push (PWA / mobile) | للموبايل | web-push / FCM |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List notifications (mine) | GET `/notifications` | `notifications` WHERE userId=me | ✅ |
| Mark as read | PATCH `/notifications/:id/read` | `notifications.readAt` | ⚠ تحقق من endpoint |
| Mark all as read | POST `/notifications/mark-all-read` | bulk update | ⚠ |
| Snooze | PATCH `/notifications/:id/snooze` | إعادة الظهور بعد X | ⚠ |
| Delete (soft) | DELETE `/notifications/:id` | `deletedAt` | ⚠ |
| Unread count | GET `/notifications/unread-count` | للـ badge | ✅ |
| Click action URL | GET المسار المخزّن | `notifications.actionUrl` — راجع `docs/action-url-registry.md` | ✅ |
| Subscribe to event | preferences | `notification_preferences` per user × event | ⚠ تحقق |
| Throttle (per event) | server-side | منع spam | ✅ |
| Delivery tracking | per channel | `notification_deliveries` (status, attempts) | ✅ |
| Bounce/failure handling | retry + fallback channel | ✅ |
| **Critical** notification | تجاوز preferences | للأمور الحرجة (security, compliance) | ✅ |
| تكامل مع `comms-templates.md` (rendering) | ✅ |
| تكامل مع `eventCatalog.ts` (مصادر الأحداث) | 16 entry | ✅ |
| Audit log | كل إرسال + قراءة | `audit_logs` | ✅ |
| **PDPL** — opt-out كامل | except security/legal | ✅ |
| Retention | 90 يوم للمقروءة، 1 سنة للملفّ | راجع `documents-archive.md` |

تحقق يدوي:
- [ ] هل actionUrl لكل event موجود ضمن `docs/action-url-registry.md`؟
- [ ] هل critical notifications تتجاوز quiet-hours / opt-out؟
- [ ] هل throttle شغّال (نفس الحدث لا يكرّر أكثر من X في دقيقة)؟
- [ ] هل fallback channel فعّال إذا فشلت القناة الأساسية؟
- [ ] هل preferences UI متوفّر للمستخدم في `my-space`؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `notifications` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/notifications`
- لقطة: `audit/screenshots/notifications.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
