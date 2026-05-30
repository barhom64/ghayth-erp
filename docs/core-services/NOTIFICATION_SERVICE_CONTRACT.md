# عقد خدمة الإشعارات — NOTIFICATION_SERVICE_CONTRACT

> المرحلة 5 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **يُبنى على:** `CORE_SERVICES_INVENTORY.md` (#3) + `NOTIFICATION_EVENT_MATRIX`.

| البند | القيمة |
|---|---|
| **المسؤولية** | توليد وتوجيه الإشعارات لكل المسارات من محرّك واحد |
| **الملف/الجدول** | `lib/notificationEngine.ts`، `lib/notificationService.ts`، `routes/notifications.ts`، جدول `notifications` (+ `notification_preferences`) |
| **الواجهة الأمامية** | مركز الإشعارات + `assignmentId` (صندوق المستخدم) |
| **المدخلات** | حدث من `eventBus` → قالب إشعار (`type, title, body, refType, refId, actionUrl`) |
| **المخرجات/الأثر** | إشعار في صندوق المستخدم + توجيه حسب التفضيل (in-app/email/push) |
| **النطاق** | للمستخدمين المعنيين ضمن نطاقهم |
| **الأحداث** | يستهلك أحداث الكتالوج؛ القنوات الصادرة عبر `outbound_queue` |

**القاعدة:** محرّك واحد — **ممنوع** إشعارات لكل مسار. كل حدث مُسجَّل في `eventCatalog`. الخدمة **تُبلّغ** ولا **تقرر**.

**القرار:** تُستخدم. **يُراجَع:** FND-007 (أحداث غير حرجة بلا مستمع قد تُفقَد) لاكتمال أثر PDPL.
</content>
