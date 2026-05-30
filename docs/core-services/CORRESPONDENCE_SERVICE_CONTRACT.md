# عقد خدمة المراسلات — CORRESPONDENCE_SERVICE_CONTRACT

> المرحلة 5 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **يُبنى على:** `CORE_SERVICES_INVENTORY.md` (#5) + `docs/architecture/communications-unification.md`.

| البند | القيمة |
|---|---|
| **المسؤولية** | إرسال المراسلات (بريد/SMS/واتساب) والصادر/الوارد من مرسِل موحّد |
| **الملف/الجدول** | `routes/correspondence.ts`، `lib/messageSender.ts`، `routes/inbox.ts`، جداول `message_log` (+ `outbound_queue`) |
| **الواجهة الأمامية** | `/inbox` (قياسي، thread-based)، `/correspondence` |
| **المدخلات** | `{ entityType, entityId, channel, recipients, body }` |
| **المخرجات/الأثر** | رسالة مسجَّلة في `message_log` + طابور صادر + DLP + تدقيق |
| **النطاق** | حسب صلاحية المستخدم |

**القاعدة:** مرسِل واحد (`messageSender.sendMessage`) لكل المسارات — **ممنوع** مراسلات لكل مسار. فحص DLP موحّد على الصادر.

**القرار:** تُستخدم. **حالة:** التوحيد قيد الإنهاء (المسارات القديمة `communications_log`/`notification_log` في فترة سماح قبل الحذف — يُتابَع حسب `communications-unification.md`، **يحتاج تحقق تشغيلي** لتأكيد اكتمال الترحيل قبل أي حذف).
</content>
