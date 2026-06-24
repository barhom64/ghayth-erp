# خطة: مزامنة تذاكر الدعم التقنية مع GitHub Issues

> الحالة: **مسودة بانتظار اعتماد إبراهيم** (هجرة + مُصنِّف + توكن). لا بناء قبل الاعتماد.
> التاريخ: 2026-06-19 · المؤلف: وكيل غيث · المرجع الأعلى: `docs/ghayth-constitution.md`

## 1. القرارات المعتمدة (من إبراهيم)
- **الآلية:** خادم غيث بالأحداث (فوري) — لا جلسة Claude مجدولة.
- **المحتوى:** التفاصيل كاملة + المرفقات + مقدّم الشكوى.
- **المستودع:** `barhom64/ghayth-erp` (مؤكَّد أنه **خاص** — تهدئة لقلق الخصوصية: العرض محصور بالمتعاونين).
- **النطاق:** البلاغات التقنية فقط (bugs/أعطال المنتج).

## 2. المعمارية (دعم = قائد · GitHub = خادم معزول)
الدعم يبقى مالكًا للتذكرة وقرارها. تكامل GitHub **قدرة خادمة** كالإشعارات: يُرسل/يربط فقط، لا يملك قرارًا، ولا يكسر استقلال الدعم.

```
POST /support/tickets  →  emitEvent("support.ticket.created")   [موجود — support.ts:368]
                                   │
                                   ▼
       registerCrossDomainHandler("support.ticket.created", githubSync)   [eventBus.ts:262]
                                   │  (إعادة 3× + backoff ثم DLQ — لا يعطّل إنشاء التذكرة)
                                   ▼
       githubSupportSync:  هل التذكرة تقنية؟ → ابنِ جسم الـIssue → أنشئه عبر GitHub API
                           → اربطه عكسيًا على التذكرة (idempotent)
```

**قفل الحدود:** الوحدة الجديدة `lib/integrations/githubSupportSync.ts` تقرأ التذكرة + العميل (JOIN clients) فقط، وتكتب حصرًا حقول الربط على `support_tickets` (لا كتابة عابرة لأي مسار آخر).

## 3. المكوّنات

### (أ) الهجرة — ⛔ تتطلب اعتماد إبراهيم الصريح
إضافة إلى `support_tickets` (لا حذف، لا تعديل أعمدة قائمة):
- `githubIssueNumber integer NULL` — رقم الـIssue (للربط + منع التكرار).
- `githubIssueUrl text NULL` — رابط الـIssue (لعرضه في واجهة التذكرة).
- `githubSyncedAt timestamptz NULL` — وقت المزامنة.

(لا حقل مُصنِّف جديد — يُعتمد حقل `category` القائم؛ انظر §4.)

idempotent: الهجرة `ADD COLUMN IF NOT EXISTS`، بلا فقد بيانات، رقم هجرة غير مكرر.

### (ب) التوكن — يوفّره إبراهيم (لا أُنشئه)
يُخزَّن في جدول `integrations` (النمط القائم): `type='github'`, `config={ token: encryptSecret(pat), repo:"barhom64/ghayth-erp" }`, مُعمّى بـ`encryptSecret` (`lib/secrets.ts`). يُقرأ عبر `getActiveIntegration(companyId,'github')` + `decryptSecret`. **مطلوب فقط للتفعيل، لا للبناء/الاختبار** (نختبر بـmock).

### (ج) خدمة GitHub: `lib/integrations/githubSupportSync.ts`
- `createIssueForTicket(ticket, client, attachments)` → نداء `POST /repos/barhom64/ghayth-erp/issues` (عبر fetch؛ لا تبعية ثقيلة).
- جسم الـIssue (عربي): العنوان = `[دعم #ref] title` · المتن = الوصف + الأولوية + الحالة + SLA + **مقدّم الشكوى** (اسم/تواصل من `clients`) + **روابط المرفقات** (انظر §5) + رابط عميق للتذكرة في غيث + label `support` + label الأولوية.
- **idempotent:** إن كان `githubIssueNumber` مضبوطًا → تخطٍّ (يمنع التكرار عند إعادة المحاولة).

### (د) المستمع: `lib/integrations/registerGithubSupportSync.ts`
`registerCrossDomainHandler("support.ticket.created", handler)`:
1. اجلب التذكرة الكاملة (SELECT * … companyId scope).
2. **المُصنِّف:** هل تقنية؟ (§4). غير تقنية → تجاهل بهدوء.
3. هل تكامل github نشط للشركة؟ لا → تجاهل (لا خطأ).
4. أنشئ الـIssue → حدّث حقول الربط → سجّل audit/event (`support.ticket.github_synced`).
الفشل → إعادة 3× ثم DLQ (التذكرة غير متأثرة).

### (هـ) الواجهة (دفعة لاحقة)
- عرض «🔗 GitHub #N» على صفحة التذكرة عند وجود `githubIssueUrl`.
- (إن اختير المُصنِّف الصريح) إضافة حقل «نوع البلاغ» في `support-create.tsx`.

## 4. المُصنِّف — معتمد: حقل `category` القائم (قابل للضبط)
نموذج إنشاء التذكرة يستخدم **قائمة `category` منسدلة** بقيم ثابتة
(`technical`/`financial`/`administrative`/`maintenance`/`other`)، فلا حاجة لحقل
جديد (الدستور م.5 — لا تنشئ أصلًا بديلًا لأصل قائم).

المُصنِّف = `category ∈ مجموعة مُهيّأة per-company` عبر `integration.config.categories`،
والافتراضي `["technical"]` (قابل لإضافة `maintenance` أو غيرها عند تهيئة التكامل).
قرار إبراهيم: **قابلة للضبط** (technical افتراضيًا، مع إمكان إضافة الصيانة).

## 5. المرفقات
لا FK رسمي بين التذاكر والمرفقات؛ الملفات في object storage وروابطها قد ترد ضمن `ticket_replies.message`. **v1:** نُدرج **روابطًا عميقة** للمرفقات/التذكرة في غيث داخل الـIssue (المستودع خاص، الفريق ينقر للوصول) — لا رفع بايتات إلى GitHub. **تحسين لاحق:** رفع البايتات فعليًا إلى الـIssue.

## 6. RBAC / Audit / السلامة
- المزامنة مبادرة من النظام (حدث)، لا تتطلب RBAC مستخدم؛ التكامل **مُنطاق بالشركة** (companyId).
- Audit/Event عند المزامنة: `support.ticket.github_synced` (actor=system, سبب, رقم الـIssue).
- **Fail-safe:** فشل GitHub لا يعطّل إنشاء التذكرة (cross-domain handler + DLQ).
- **العزل متعدد الشركات:** كل قراءة/كتابة بفلتر companyId (الدستور م.13).

## 7. الاختبارات (قبل أي «تم»)
- وحدة: المُصنِّف · بناء جسم الـIssue · idempotency (تخطّي عند وجود رقم) · تجاهل عند غياب تكامل.
- تكامل: مستمع الحدث مع **mock لـGitHub API** (نجاح + فشل→DLQ).
- ثبات: لا كتابة عابرة (audit-domain-boundaries) · typecheck · wiring.

## 8. الدفعات والحوكمة
- **دفعة 0 (بوابة):** اعتماد الهجرة + قرار المُصنِّف. ← الآن.
- **دفعة 1:** الهجرة + الخدمة + المستمع + الاختبارات → **مجلس ghayth-review** → دمج.
- **دفعة 2:** الواجهة (رابط الـIssue + حقل النوع) → مجلس → دمج.
- **التفعيل:** إدخال التوكن (إبراهيم) في `integrations`.
كل دفعة لا تُعلَن «تم» إلا بحكم مجلس **«يُعتمد»** (دستور + يقيني + مجلس).

## 9. المخاطر المتبقية
- مطابقة المُصنِّف (إن اختير الخيار 3) قد تُخطئ — لذا التوصية بحقل صريح.
- حدود معدل GitHub API (نادر لحجم التذاكر؛ DLQ يلتقط الفشل).
- المرفقات كروابط لا بايتات في v1 (مقبول لمستودع خاص).
- تدوير التوكن: مسؤولية تشغيلية (يُحدَّث في `integrations`).

## 10. ما أحتاجه من إبراهيم الآن
1. **اعتماد الهجرة** (الأعمدة في §3-أ).
2. **قرار المُصنِّف** (§4 — التوصية: `isTechnical`).
3. (لاحقًا، للتفعيل) **توكن GitHub** fine-grained: Issues=Read/write على المستودع فقط.
