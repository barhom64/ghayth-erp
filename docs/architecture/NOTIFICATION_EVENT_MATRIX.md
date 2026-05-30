# مصفوفة الإشعارات والأحداث — NOTIFICATION_EVENT_MATRIX

> المرحلة 2 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **المبدأ:** محرّك إشعارات واحد وناقل أحداث واحد — لا إشعارات منفصلة لكل مسار. كل حدث مُسجَّل في الكتالوج.
> **يُبنى على:** `CORE_SERVICES_INVENTORY.md` (#3 الإشعارات، #14 الأحداث) + `lib/eventCatalog.ts` + `lib/notificationEngine.ts`.

---

## 1. النموذج

```
إجراء على كيان ──► eventBus.emit("entity.action") ──► event_outbox (دائم)
                                │
                ┌───────────────┼─────────────────┐
                ▼               ▼                 ▼
          مستمعون داخليون   تدقيق/GL hooks    notificationEngine ──► notifications (صندوق المستخدم)
          (cross-domain)                              │
                                          توجيه حسب التفضيل/القناة (email/in-app/push)
```

- **الحدث** مُسجَّل في `eventCatalog.ts` (يُرفَض غير المسجَّل).
- **الإشعار** يُولَّد من الحدث ويُوجَّه عبر `notification_preferences`.
- **القنوات الصادرة** تُوحَّد في `outbound_queue` (`communications-unification.md`).

---

## 2. مصفوفة الحدث → الإشعار (نماذج)

| الحدث | المستمعون | الإشعار → من | القناة |
|---|---|---|---|
| `invoice.submitted` | GL hook، notif | المعتمد المالي | in-app + email |
| `payroll.posted` | commission، notif | CFO + HR | in-app |
| `leave.requested` | notif | مدير الفرع | in-app |
| `leave.approved` | notif | الموظف | in-app + push |
| `fleet.trip.completed` | GL، notif | مدير الأسطول | in-app |
| `legal.session.scheduled` | obligation، notif، (task) | فريق القضية | in-app + email |
| `contract.renewal.due` | obligation، notif | مسؤول التحصيل | in-app + email |
| `document.expiring` | notif | مسؤول الموظفين | in-app |
| `device.online` (telematics) | notif | مراقب الأسطول | in-app |

> الأحداث تخدم المسارات الأخرى (الخادم العام) دون أن يبني أي مسار ناقله الخاص.

---

## 3. قواعد

1. **محرّك واحد:** كل إشعار عبر `notificationEngine` → `notifications`. ممنوع جدول إشعارات لكل مسار.
2. **كل حدث مُسجَّل:** إضافة حدث جديد تتطلب تسجيله في `eventCatalog` (يمنع أحداثًا عشوائية).
3. **التوجيه بالتفضيل:** المستخدم يتحكم في قنواته عبر `notification_preferences`.
4. **الأحداث غير الحرجة بلا مستمع تُفقَد** عند `PERSIST_ALL_EVENTS=false` (FND-007) — يُراجَع لاكتمال أثر PDPL.
5. **DLP على الصادر:** المراسلات الصادرة تمرّ بفحص DLP الموحّد.

---

## 4. الفجوات والقرارات

- **FND-006:** `auditMiddleware.ENTITY_MAP` يغطّي 42 بادئة ويغفل legal/store/governance/automation/bi/marketing → تعديلات هذه الوحدات لا تولّد حدث `audit.*` تلقائيًا. **يُوسَّع** في التنفيذ.
- **FND-007:** خطر فقد أحداث غير حرجة بلا مستمع — قرار: تفعيل `PERSIST_ALL_EVENTS` للامتثال أو إضافة مستمع شامل.
- **مصفوفة الحدث الكاملة** تُشتق من `eventCatalog.ts` (مصدر الحقيقة) في عقد المرحلة 5 `NOTIFICATION_SERVICE_CONTRACT`.
</content>
