# خريطة الأحداث التشغيلية
# Events Operational Map

> **المرجع:** #1603 (تحت #1594). يوثّق بنية الأحداث في غيث وحالتها المُتحقَّقة فعليًا.

## البنية (موجودة ومُفعّلة — لا تُبنى من جديد)
| المكوّن | الوصف |
| --- | --- |
| `eventBus` (`lib/eventBus.ts`) | نقطة بثّ موحّدة. كل `emit` يَختم الظرف (نسخة + وقت)، يلتقط في `event_outbox`، ثم يبثّ للمستمعين. كل مستمع مغلّف لالتقاط الفشل ودفعه إلى DLQ. |
| `eventCatalog` (`lib/eventCatalog.ts`) | **457 تعريف حدث** (منها **86 حرجة**) مع domain/consumers/sideEffects. `emitEvent` يتحقق من الكتالوج ويرفض الأحداث الحرجة غير المسجّلة. |
| `eventListeners` (`lib/eventListeners.ts`) | 50+ معالجًا، **مُسجَّل عند الإقلاع** في `index.ts` (`registerEventListeners()`). |
| `journeyTracking` (`lib/journeyTracking.ts`) | مراقب الرحلات (#1604) — مُسجَّل عند الإقلاع. |
| الجداول | `event_logs` (سجل إلحاقي)، `event_outbox` (التقاط transactional — migration 187)، `event_dlq` (فشل — migration 110). |

## نموذج الحفظ (مُتحقَّق)
- **الأحداث الحرجة** (`critical: true`): تُكتب في `event_logs` **قبل** البثّ (في `emitEvent`).
- **كل الأحداث**: تُلتقط في `event_outbox` عبر `eventBus.emit` (Phase 1 = التقاط؛ المُرحِّل/الـdrain متابعة Phase 2).
- **غير الحرجة**: تُحفظ في `event_logs` فقط عند تفعيل `PERSIST_ALL_EVENTS` (افتراضيًا off لتفادي تضخّم السجل) — أو fallback عند فشل البثّ.
- **الفشل**: المستمع الفاشل يُدفَع إلى `event_dlq` (مع `retryCount`)، وصيانة دورية كل 10 دقائق + احتفاظ 30 يومًا.

## إثبات حيّ (أثناء رحلة المالية على قاعدة نظيفة)
| الجدول | بعد الرحلة |
| --- | --- |
| `event_logs` | 5 أحداث: `invoice.created`, `invoice.approved`, `journal.entry.created`, `invoice.posted`, `fiscal_period.closed` |
| `event_outbox` | 9: تشمل `client.created`, `invoice.created`, `journal.entry.created`, `invoice.posted`, `audit.*` |
| `audit_logs` | 14 |

> **الخلاصة:** خلافًا لتقرير مايو (`event_logs=0`)، الأحداث تُحفظ فعليًا الآن.

## أمثلة أحداث تشغيلية (من الكتالوج)
- **مالية:** `invoice.created` · `invoice.approved` (حرج) · `invoice.posted` (حرج، gl_post) · `fiscal_period.closed` · `journal.entry.created`.
- **HR:** `hr.payroll.posted` · `hr.violation.recorded` · `hr.leave.approved`.
- **عمرة:** `umrah.invoice.generated` · `umrah.payment.recorded` · `umrah.season.closed`.
- **أسطول/عقارات:** `fleet.violation.recorded` · `property.rent.due`.
- **حوكمة/نظام:** `governance.policy.violated` · `system.obligation.breached` · `system.journey.completed`.

## متابعة (موثّقة)
- **مُرحِّل الـoutbox (Phase 2):** الالتقاط فعّال؛ الـdrain غير المُفعَّل بعد.
- **اتساق البثّ:** بعض الأحداث الحرجة (مثل `invoice.approved`) تُكتب في `event_logs` لكن لا تظهر في `event_outbox`/المستمعين — يلزم مواءمة مسار البثّ الحرج (أثّر على ربط خطوة اعتماد الفاتورة في #1604).
