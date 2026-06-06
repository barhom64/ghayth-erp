# محرك الرحلات التشغيلية
# Journey Engine

> **المرجع:** #1604 (تحت #1594). يوثّق تفعيل `journeyEngine` وربطه بناقل الأحداث.

## ما هو
`journeyEngine` (`artifacts/api-server/src/lib/journeyEngine.ts`) متتبّع رحلات عابرة للمسارات: كل رحلة تعريفها سلسلة خطوات، وكل خطوة مرتبطة بحدث (`requiredEvent`). **لا يفرض المحرك ترتيبًا** — يرصد الأحداث ويعلّم الخطوات كمكتملة عند وقوعها. الجدول الخلفي `journey_instances` (migration 248).

## الحالة قبل/بعد
- **قبل (#1594):** المحرك مكتمل لكن **بلا أي ربط** (صفر مستدعين) — محجوز.
- **بعد (هذا العمل):** مُفعَّل عبر وحدة ربط معزولة `lib/journeyTracking.ts` المسجّلة عند الإقلاع في `index.ts` (بجانب `registerEventListeners`)، **بدون لمس** ملف المستمعين المركزي (1971 سطرًا).

## آلية الربط (`journeyTracking.ts`)
1. يبني فهرسًا عكسيًا: `requiredEvent → [{journeyType, stepKey}]` من كل تعريفات الرحلات.
2. يشترك بمعالج واحد على ناقل الأحداث لكل حدث مطلوب.
3. عند وقوع الحدث: **يضمن وجود instance** للرحلة لهذا الكيان (يبدأها إن لم تكن مفتوحة)، ثم يعلّم الخطوة.
4. **تسلسل لكل (شركة:رحلة:كيان)** عبر سلسلة وعود — يمنع سباق إنشاء instances مكرّرة عندما تقع أحداث متتابعة بسرعة (مثل `invoice.created` ثم `invoice.posted`).

## رحلة مُتحقَّقة فعليًا: `finance_invoice`
خطوتان مرتبطتان بحدثين يُصدرهما مسار المالية على **ناقل الأحداث**:
| الخطوة | الحدث |
| --- | --- |
| `invoice_created` | `invoice.created` |
| `invoice_posted` | `invoice.posted` |

**الإثبات:** `scripts/verify-finance-posting-journey.sh` يؤكد أن `journey_instances` يسجّل الرحلة وتصل `status='completed'` بعد ترحيل الفاتورة (الخطوة 7 في السكربت).

## ملاحظة مهمة: الأحداث يجب أن تكون على ناقل الأحداث
المعالج يرصد ناقل الأحداث (`eventBus`). أي خطوة يجب أن يكون حدثها مُصدَرًا عبر `eventBus.emit` (أي عبر `emitEvent`/`safeEmitEvent`).

> **اكتشاف أثناء التفعيل:** `invoice.approved` يُحفظ حاليًا في `event_logs` فقط (مسار الأحداث الحرجة في `emitEvent`) ولا يُلتقط في `event_outbox` ولا يصل المستمعين — أي **لا يُبثّ على الناقل** كما تفعل `invoice.created`/`invoice.posted`. لذلك حُذفت خطوة الاعتماد من `finance_invoice` مؤقتًا. **متابعة:** مواءمة بثّ الأحداث الحرجة على الناقل (أو توحيد مصدر الإشارة) ثم إعادة إدراج خطوة `invoice_approved`.

## الرحلات الأخرى (جاهزة، تُضاء عند بثّ أحداثها)
`hr_onboarding`, `umrah_season`, `crm_deal`, `fleet_vehicle`, `property_lease`, `finance_month_close` — معرّفة بالفعل. الربط عام، فبمجرد أن تُبثّ أحداثها المطلوبة على الناقل ستُسجَّل instances تلقائيًا. مواءمة أسماء أحداث كل مسار مع `requiredEvent` تتم ضمن مهام تفعيل تلك المسارات (#1609).

## الاستعلام
- `getJourneyProgress(companyId, journeyType, entityType?, entityId?)`
- `listJourneys(companyId, status?)`
- عند الاكتمال يُصدر المحرك `system.journey.completed` (مُسجّل في الكتالوج).
