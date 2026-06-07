# التحقق الوظيفي والحوكمي لمسار العمرة — Functional & Governance Verification: Umrah

**تاريخ الإصدار:** 2026-05-21
**الوضع:** تقرير وتحليل فقط — Static code-trace. **لا إصلاحات، لا migrations، لا تغييرات Finance/GL.**
**المسار:** Umrah & Operations Integrity
**خارج النطاق صراحةً:** Finance · HR · Production Hardening · Runtime Verification · #685 Scope Normalization.

---

## 0. الملخص التنفيذي والحكم النهائي

**السؤال:** هل مسار العمرة في غيث تشغيل فعلي end-to-end، أم مجرد API وواجهات متفرقة؟

**الحكم: تشغيل فعلي بنسبة كبيرة — وليس واجهات وهمية — لكنه ليس مسارًا متصلًا end-to-end.**

مسار العمرة وحدة حقيقية ومبنية بعمق: ~30 صفحة فعلية، **100 endpoint** (57 منها كتابة) موزّعة على ملفين (`umrah.ts` + `umrah-entities.ts`)، CRUD حقيقي، محرك دورة حياة (`applyTransition`)، تشفير حقول حساسة (passport/visa)، سجل تدقيق (`createAuditLog`)، نظام أحداث (`emitEvent` + catalog + listeners)، 6 مهام cron، و4 محركات (`umrahEngine`، `umrahInvoicingEngine`، `umrahCommissionEngine`، `umrahImportEngine`) مع ترحيل GL فعلي. **لا توجد صفحة واحدة تعتمد على بيانات وهمية mock** — كل الصفحات موصولة بـ API حقيقي.

**لكن** المسار التشغيلي مكسور عند **خمسة فواصل (seams)** تمنع التدفق الكامل end-to-end:

| # | الفاصل المكسور | الأثر |
|---|---|---|
| C1 | فاتورة الوكيل (`umrah_agent_invoices`) تُولَّد بحالة `draft` ولا يوجد مسار lifecycle يخرجها منها | الفاتورة لا تستقبل دفعة أبدًا — مسار agent-invoice مغلق |
| C2 | صفحة تفاصيل الفاتورة تنادي `GET /umrah/invoices/:id` وهو endpoint غير موجود | كل نقرة على صف فاتورة → صفحة 404 |
| C3 | نظامان متوازيان غير موحَّدين للتجاوز/الغرامات (`umrah_penalties` ضد `umrah_violations`) | معالجة overstay مكررة وغامضة |
| C4 | لا علاقة فعلية بين النقل والمعتمر (لا join table ولا `transportId`) | تخصيص النقل تجميلي فقط |
| C5 | تقدّم حالة المعتمر (arrived/overstayed/departed) يدوي بالكامل — لا cron له | خط الغرامات معطّل ما لم يضغط مستخدم زرًّا يدويًا |

**الخلاصة:** البنية موجودة وحقيقية؛ المشكلة في **تكامل المسار** لا في وجوده. إصلاح C1–C5 يحوّل العمرة من "وحدة وظائف متصلة جزئيًا" إلى "مسار تشغيلي end-to-end".

---

## 1. النطاق والمنهجية

**Static code-trace** للمسار الكامل: `Page → API route → handler → DB → lifecycle → audit/events → permissions → reports/exports`.

**الملفات الأساسية المفحوصة:**
- Backend: `artifacts/api-server/src/routes/umrah.ts` (1854 سطر)، `artifacts/api-server/src/routes/umrah-entities.ts` (1844 سطر)
- المحركات: `lib/engines/umrahEngine.ts`، `lib/umrahInvoicingEngine.ts`، `lib/umrahCommissionEngine.ts`، `lib/umrahImportEngine.ts`، `lib/lifecycleEngine.ts`
- Cron: `lib/cronScheduler.ts` (6 وظائف umrah)
- Frontend: `artifacts/ghayth-erp/src/pages/umrah/*.tsx` (23 صفحة) + `pages/details/umrah-*.tsx` (8 صفحات) + `routes/umrahRoutes.tsx`
- الحوكمة: `eventCatalog.ts`، `eventListeners.ts`، `rbac/featureCatalog.ts`، `rbacCatalog.ts`، `systemGovernor.ts`
- المخطط: `db/schema_pre.sql` + `migrations/*.sql` (~33 ملف umrah)

**التركيب (mounting):** كلا الراوترين على البادئة `/umrah` مع:
`router.use("/umrah", umrahUserLimiter)` ثم
`requireModule("operations")` + `requireGuards("financial")` (راجع `routes/index.ts:356-358`).

---

## 2. خريطة المسار التشغيلي

```
الموسم (season:open) ─┬─ الباقات (packages) ─┬─ المعتمر (pilgrim:pending)
                      ├─ الأسعار (pricing)   │      │
                      ├─ الوكلاء (agents)    │      ├─ run-daily-status (يدوي) → arrived/overstayed/departed
                      └─ الوكلاء الفرعيون   │      ├─ run-penalty-engine (يدوي) → umrah_penalties + GL
                          (sub-agents)      │      └─ cron overstay/absconder → umrah_violations (مسار منفصل!)
                                            │
الاستيراد (NUSK Excel) → import-wizard ─────┘
   ├─ /import, /import/mutamers → umrah_pilgrims
   └─ /import/vouchers → umrah_nusk_invoices + AP journal (GL)

المجموعات (groups) → فاتورة مبيعات (umrah_sales_invoices) → دفعات (umrah_payments) → كشف حساب (statement)
الوكيل (agent) → فاتورة وكيل (umrah_agent_invoices: draft ✗) → record-payment ✗
المرفقات (attachments) · التقارير (daily-runsheet · reconciliation) · العمولات (commission-plans)
```

موضع الكسر معلَّم بـ ✗.

---

## 3. Route-by-Route Matrix

الرموز: ✅ يعمل · 🟡 جزئي/ملاحظة · ❌ مكسور/مفقود · — لا ينطبق.

### 3.1 المواسم — Seasons

| البند | الحالة | ملاحظة |
|---|---|---|
| الصفحة | ✅ | `seasons.tsx` + `details/umrah-season-detail.tsx` |
| API | ✅ | `GET/POST /seasons`, `GET/PATCH /seasons/:id` |
| CRUD | 🟡 | لا يوجد `DELETE /seasons/:id` في الـ backend — لكن صفحة التفاصيل تناديه (مكسور) |
| Lifecycle | ✅ | `open→closed→archived` عبر STATE_MACHINE + فحص blockers (معتمرون نشطون / فواتير غير مسددة) |
| Events/Audit | 🟡 | `POST` يصدر `umrah.season.opened`؛ `PATCH` يصدر ديناميكيًا `umrah.season.${status}` — `closed`/`archived` غير مُصنّفة في catalog |
| Scope | 🟡 | `companyId` مطبّق (تفاصيل scope مؤجَّلة لـ #685) |
| Field mismatch | 🟡 | صفحة التفاصيل تقرأ `name/year/capacity` بينما الـ API يُرجع `title/startDate/endDate` |

### 3.2 الوكلاء الرئيسيون — Agents

| البند | الحالة | ملاحظة |
|---|---|---|
| الصفحة | ✅ | `agents.tsx` + `details/umrah-agent-detail.tsx` |
| API | ✅ | `GET/POST /agents`, `GET/PATCH/DELETE /agents/:id` |
| CRUD | ✅ | CRUD كامل؛ `DELETE` يمنع الحذف عند ارتباط معتمرين |
| Lifecycle | ✅ | `active/inactive/suspended/blocked` عبر STATE_MACHINE |
| Events/Audit | ✅ | `umrah.agent.created/updated/deleted` |

### 3.3 الوكلاء الفرعيون — Sub-Agents

| البند | الحالة | ملاحظة |
|---|---|---|
| الصفحة | ✅ | `sub-agents.tsx` + `details/umrah-sub-agent-detail.tsx` |
| API | ✅ | CRUD كامل + `link`/`link-by-nusk`/`link-client` + `unlinked` |
| Lifecycle | — | لا توجد حالة (`isActive` boolean فقط) |
| Events/Audit | ✅ | `umrah.sub_agent.*` + `umrah.agent.linked` |

### 3.4 المجموعات — Groups

| البند | الحالة | ملاحظة |
|---|---|---|
| الصفحة | ✅ | `groups.tsx` — **غير موجودة في الـ sidebar** (تُفتح بالرابط فقط) |
| API | ✅ | CRUD + `split` + `merge` (داخل transactions صحيحة) |
| Lifecycle | 🟡 | عمود `status` نصّي حر — لا STATE_MACHINE |
| Events/Audit | 🟡 | `PATCH/DELETE /groups/:id` يكتبان audit لكن **لا يصدران event** |

### 3.5 المعتمرون — Pilgrims (يشمل التأشيرات/الوصول/المغادرة)

| البند | الحالة | ملاحظة |
|---|---|---|
| الصفحة | ✅ | `pilgrims.tsx`, `pilgrim-create.tsx`, `details/pilgrim-detail.tsx` |
| API | ✅ | `GET/POST /pilgrims`, `GET/PATCH/DELETE /pilgrims/:id`, `/unassigned`, `/assign-bulk` |
| CRUD | ✅ | تشفير `passportNumber`/`visaNumber` + blind-index للبحث + `logSensitiveAccess` |
| Lifecycle | ✅ | `pending→arrived→active→overstayed→departed/violated/cancelled` عبر `applyTransition`؛ خريطة الراوتر تطابق STATE_MACHINE |
| **التأشيرات (visas)** | 🟡 | **لا يوجد كيان تأشيرة** — مجرد حقول على المعتمر (`visaNumber`, `visaExpiry`)؛ لا CRUD ولا lifecycle؛ cron `umrah_visa_expiry_alerts` فقط |
| **الوصول/المغادرة** | 🟡 | أعمدة `actualArrival/actualDeparture/entryDate/exitDate`؛ لا شاشة check-in؛ التقدّم عبر `run-daily-status` فقط |
| `POST /pilgrims/create` المرفقات | ❌ | `FileDropZone` يلتقط الملفات لكن `save()` لا يرفعها — تُهمَل بصمت |
| Events/Audit | ✅ | كامل |

### 3.6 الباقات والأسعار — Packages & Pricing

| البند | الحالة | ملاحظة |
|---|---|---|
| الصفحة | ✅ | `packages.tsx`, `pricing.tsx` + `details/umrah-package-detail.tsx` |
| API | ✅ | CRUD كامل لكليهما؛ `pricing` يفحص تداخل الفترات |
| Lifecycle | 🟡 | `DELETE /packages/:id` يمرّ عبر `applyTransition(toState:"deleted")` |
| Field mismatch | 🟡 | `umrah-package-detail` يقرأ `price/hotelStars/bookedCount/transportType` — الـ API يُرجع `sellPrice/includes*` |

### 3.7 التجاوزات والغرامات — Overstays & Penalties

| البند | الحالة | ملاحظة |
|---|---|---|
| الصفحة | ✅ | `penalties.tsx` + `details/umrah-penalty-detail.tsx` |
| API | ✅ | `GET /penalties`, `/penalties/:id`, `POST /penalties`, `/run-penalty-engine`, `PATCH /penalties/:id/waive`, `/penalties/waive-bulk` |
| Lifecycle | ✅ | `pending→invoiced→paid/waived` عبر STATE_MACHINE |
| GL | 🟡 | `postPenaltyGL`/`postPenaltyWaiverGL` — **non-blocking** (الأخطاء تُبتلع) |
| Events/Audit | ✅ | `umrah.penalty.created/waived/waived_bulk`, `umrah.penalty_engine.run` |
| **التكرار** | ❌ | راجع C3 — نظام `umrah_violations` المنفصل أدناه |

### 3.8 المخالفات النظامية — Violations

| البند | الحالة | ملاحظة |
|---|---|---|
| الصفحة | ✅ | `violations.tsx`, `violation-create.tsx` + `details/umrah-violation-detail.tsx` |
| API | ✅ | `GET/POST /violations`, `GET/PATCH/DELETE /violations/:id` |
| Lifecycle | ❌ | `status` نصّي حر — **لا CHECK constraint ولا STATE_MACHINE**؛ `PATCH` يضبط أي قيمة |
| Events/Audit | ❌ | **`PATCH /violations/:id` لا يكتب audit ولا يصدر event** |
| إنشاء آلي | 🟡 | cron `umrahDailyOverstayScan`/`AbsconderCheck` تكتب صفوف violations مباشرة |
| Field mismatch | 🟡 | صفحة التفاصيل تقرأ `violationType/fineAmount` — الـ API يُرجع `type/penaltyAmount` |
| رابط مكسور | ❌ | صف القائمة يربط `/details/umrah-violation/:id` (المسار الصحيح `/umrah/violations/:id`) |

### 3.9 فواتير الوكلاء — Agent Invoices

| البند | الحالة | ملاحظة |
|---|---|---|
| الصفحة | ✅ | `invoices.tsx` (تقرأ `/agent-invoices`) + `details/umrah-invoice-detail.tsx` |
| API | 🟡 | `GET /agent-invoices`, `/agent-invoices/:id`, `POST /agent-invoices/generate`, `/:id/record-payment` |
| **Lifecycle** | ❌ | **C1** — `generate` يُنشئ `status='draft'`؛ STATE_MACHINE لـ `umrah_agent_invoices` **لا يحتوي حالة `draft`** (يبدأ من `sent`)؛ `record-payment` يطلب `fromStates:[sent,partially_paid,overdue]`؛ **لا endpoint ينقل `draft→sent`** → الفاتورة مغلقة للأبد |
| **صفحة التفاصيل** | ❌ | **C2** — `umrah-invoice-detail.tsx` ينادي `GET /umrah/invoices/:id` وهو **غير موجود** (يوجد فقط `GET /invoices` للقائمة و`PATCH /invoices/:id`) → 404 دائمًا |
| GL | 🟡 | `postAgentInvoiceGL` — non-blocking |

### 3.10 فواتير المبيعات / NUSK / الدفعات — Sales Invoices / NUSK / Payments

| البند | الحالة | ملاحظة |
|---|---|---|
| الصفحات | 🟡 | `sales-wizard.tsx` ✅؛ **لا صفحة لـ nusk-invoices ولا لـ payments** |
| API | ✅ | `GET/POST /invoices`, `/invoices/generate`, `/sales-wizard/uninvoiced-groups`, `PATCH /invoices/:id`؛ NUSK CRUD كامل؛ `GET/POST /payments` |
| Lifecycle | 🟡 | STATE_MACHINE لـ `umrah_sales_invoices` موجود لكن **`PATCH /invoices/:id` يضبط `status` عبر `UPDATE` خام — يتجاوز الـ machine** |
| GL | 🟡 | `generateSalesInvoice`/`registerPayment` يرحّلان GL **blocking** لكن **بعد** commit جدول umrah → نافذة فشل جزئي |
| Events/Audit | ✅ | `umrah.invoice.generated/updated`, `umrah.payment.received` (مع listeners ترحّل GL تلقائيًا) |

### 3.11 النقل — Transport

| البند | الحالة | ملاحظة |
|---|---|---|
| الصفحة | ✅ | `transport.tsx` + `details/umrah-transport-detail.tsx` |
| API | ✅ | `GET/POST /transport`, `GET/PATCH/DELETE /transport/:id`, `POST /transport/:id/assign-pilgrims` |
| Lifecycle | ✅ | `scheduled→in_progress→completed/cancelled` عبر STATE_MACHINE |
| **الربط بالمعتمر** | ❌ | **C4** — لا join table ولا `transportId` على المعتمر؛ `assign-pilgrims` يضبط `transportAssigned=true` فقط؛ `GET /transport/:id` يُرجع **كل** معتمري الشركة بـ `transportAssigned=true` بغضّ النظر عن الرحلة |
| واجهة التخصيص | ❌ | لا صفحة تستدعي `assign-pilgrims` |
| GL | 🟡 | `postTransportExpenseGL` — non-blocking |
| التكامل | ✅ | مستهلِك لخدمة fleet (`fleet_vehicles`/`fleet_drivers`) — لا تكرار |

### 3.12 المرفقات والمستندات — Attachments

| البند | الحالة | ملاحظة |
|---|---|---|
| الصفحة | ✅ | `attachments.tsx` (index للقراءة) — **غير موجودة في الـ sidebar** |
| API | ✅ | `GET/POST /attachments`, `DELETE /attachments/:id`؛ polymorphic مع `assertAttachmentOwner` |
| Events/Audit | 🟡 | `POST` كامل؛ `DELETE` يكتب audit لكن **لا يصدر event** |

### 3.13 الاستيراد — Import

| البند | الحالة | ملاحظة |
|---|---|---|
| الصفحة | ✅ | `import-wizard.tsx` (`/umrah/import`) + `import.tsx` legacy (`/umrah/import/legacy`) |
| API | ✅ | `/import/preview`, `/import/mutamers`, `/import`, `/import/vouchers`, `/import-logs`, `/import/batches(+/:id/changes)` |
| GL | 🟡 | `import/vouchers` → `postNuskJournalEntries` (AP) — **non-blocking** (قد يلتزم voucher بلا JE) |
| Events | ✅ | `umrah.import.completed`, `umrah.mutamers/vouchers.imported`, `umrah.overstay/absconder.detected` |
| تناسق | 🟡 | wizard ينجح ويربط `/admin/import-batches/:id` (وحدة أخرى)؛ `/umrah/import/batches` غير مستخدَم؛ `umrah_agents` المُنشأة آليًا تفتقد `branchId/createdBy` |

### 3.14 التقارير — Reports & Exports

| البند | الحالة | ملاحظة |
|---|---|---|
| daily-runsheet | ✅ | `daily-runsheet.tsx` → `GET /reports/daily-runsheet(+/pdf)` |
| reconciliation | 🟡 | `reconciliation.tsx` → `GET /reports/reconciliation`؛ **فلتر `seasonId` كود ميّت** — `seasonFilter` يُحسب ولا يُطبَّق |
| statements | 🟡 | `GET /statements/:subAgentId(+/pdf)`؛ الصفحة تستخدم `/pdf` فقط، نسخة JSON غير مستخدَمة |
| letters | ❌ | `GET /letters/:id/pdf`, `POST /letters/:id/dispatch` — **لا واجهة للخطابات إطلاقًا** |
| commission-calculations | ❌ | endpoint موجود — لا صفحة قائمة |
| اكتشاف الصفحات | 🟡 | `groups`, `daily-runsheet`, `reconciliation`, `attachments` لها مسارات لكن **لا روابط sidebar** |

### 3.15 العمولات — Commission Plans

| البند | الحالة | ملاحظة |
|---|---|---|
| الصفحة | ✅ | `commission-plans.tsx` + `commission-plan-editor.tsx` |
| API | ✅ | CRUD + `simulate` + `calculate` + `commission-calculations` |
| Governance | ✅ | `POST /commission-plans` يمرّ عبر `initiateApprovalChain` (نوع `umrah_commission_plan`) |
| GL | ✅ | `calculateCommissionForPlan` يرحّل GL **blocking + ذرّي داخل transaction** (الأنظف) |
| واجهة مكسورة | ❌ | `commission-plans.tsx` ينادي `/activate`, `/suspend`, `DELETE /:id` — **لا أحد منها موجود** |

---

## 4. الثغرات الحرجة — Critical Gaps

### C1 — فاتورة الوكيل عالقة في `draft` بلا مخرج
`POST /agent-invoices/generate` (`umrah.ts:1340`) يُنشئ الصف بـ `status='draft'`. لكن STATE_MACHINE في `lifecycleEngine.ts:706` لكيان `umrah_agent_invoices` **لا يعرّف حالة `draft` أصلًا** — يبدأ من `sent`. خريطة الراوتر المحلية `AGENT_INVOICE_TRANSITIONS` (`umrah.ts:94`) فيها `draft→sent` لكن **لا endpoint يستخدمها**. `record-payment` (`umrah.ts:1309`) يطلب `fromStates:["sent","partially_paid","overdue"]`. النتيجة: **كل فاتورة وكيل مُولَّدة لا يمكن أن تستقبل دفعة ولا أن تتقدّم — مسار agent-invoice مغلق end-to-end.**

### C2 — صفحة تفاصيل الفاتورة تنادي endpoint غير موجود
`umrah-invoice-detail.tsx:44` ينادي `GET /umrah/invoices/${id}`. في `umrah-entities.ts` يوجد `GET /invoices` (قائمة)، `POST /invoices/generate`، `PATCH /invoices/:id` — **لا `GET /invoices/:id`**. إضافةً: قائمة `invoices.tsx` تقرأ `/agent-invoices` (كيان مختلف) ثم تنتقل عند النقر إلى `/umrah/invoices/:id`. **كل فتح لصف فاتورة → 404.**

### C3 — نظامان متوازيان غير موحَّدين للتجاوز/الغرامات
- `umrah_penalties`: ينشئها `run-penalty-engine` و`POST /penalties` يدويًا؛ معيارها `departureDate`/`daysOver`؛ حالات `pending/invoiced/paid/waived` مع STATE_MACHINE وترحيل GL.
- `umrah_violations`: ينشئها CRUD اليدوي و**cron** `umrahDailyOverstayScan`/`AbsconderCheck`؛ معيارها `actualStayDays`/`programDuration`؛ `status` نصّي حر بلا state machine بلا GL.

النظامان لا يرتبطان. التقرير `reconciliation` يبحث عن violations بحالة `('detected','open')`. المستخدم يرى قائمتين منفصلتين ("الغرامات" و"المخالفات النظامية") لنفس الحدث الواقعي. **معالجة التجاوز مكررة وغير حاسمة.**

### C4 — لا علاقة فعلية بين النقل والمعتمر
لا join table ولا عمود `transportId` على `umrah_pilgrims` (تأكيد من `schema_pre.sql`). `assign-pilgrims` يضبط boolean `transportAssigned=true` ويزيد `umrah_transport.pilgrimCount`. `GET /transport/:id` يُرجع **كل** معتمري الشركة بـ `transportAssigned=true`. النتيجة: صفحة تفاصيل الرحلة تعرض معتمرين خاطئين، السعة تنحرف، وإعادة التخصيص لرحلة ثانية تُضاعف العدّ. **تخصيص النقل تجميلي.**

### C5 — تقدّم دورة حياة المعتمر يدوي بالكامل
`POST /run-daily-status` (انتقالات `arrived/overstayed/departed`) هو الوسيلة الوحيدة لتقدّم حالة المعتمر، **ولا cron يشغّله** — الـ cron يكتشف overstay ويُنشئ violations لكنه **لا ينقل حالة المعتمر إلى `overstayed`**. وبما أن `run-penalty-engine` يتطلب `status='overstayed'`، فإن خط الغرامات بأكمله معطّل ما لم يضغط مستخدم زر "تشغيل الحالة اليومية" على لوحة العمرة. **التشغيل اليومي يعتمد على ذاكرة المشغّل.**

---

## 5. الثغرات المتوسطة — Medium Gaps

| # | الثغرة | الموقع |
|---|---|---|
| M1 | فلتر `seasonId` في تقرير المطابقة كود ميّت — `seasonFilter` يُحسب ولا يُمرَّر لأيٍّ من الاستعلامات الثلاثة | `umrah-entities.ts:1740` |
| M2 | تضارب سياسة GL: الفوترة/العمولات تُرحّل GL **blocking بعد** commit جدول umrah → نافذة فشل جزئي (صف فاتورة/دفعة بلا JE، وبلا قيد في `financial_posting_failures`) | `umrahInvoicingEngine.ts` |
| M3 | `umrahEngine` (agent-invoice/transport/penalty) يُرحّل GL **non-blocking مبتلَع** — الفشل `logger.error` فقط، لا يُسجَّل في `financial_posting_failures` → قيود GL مفقودة بصمت | `umrahEngine.ts` + مستدعوها |
| M4 | `umrah_violations.status` نصّي حر بلا CHECK بلا state machine؛ مفردات متضاربة (`detected` من cron، `open` افتراضي، التقرير يتوقع كليهما) | `umrah.ts:1767` + cron |
| M5 | `PATCH /invoices/:id` يضبط `status` عبر `UPDATE` خام يتجاوز STATE_MACHINE لـ `umrah_sales_invoices` | `umrah-entities.ts:1343` |
| M6 | `PATCH /violations/:id` لا يكتب audit ولا يصدر event | `umrah.ts:1767` |
| M7 | `PATCH/DELETE /groups/:id` و`DELETE /attachments/:id` تكتب audit لكن لا تصدر event | `umrah-entities.ts` |
| M8 | تعارض أسماء الحقول front↔back على 4 صفحات تفاصيل (season/package/penalty/violation) → الحقول تظهر "—" | راجع §3 |
| M9 | `pilgrim-create.tsx` يلتقط ملفات `FileDropZone` ولا يرفعها — تُهمَل بصمت | `pilgrim-create.tsx` |
| M10 | `umrah_agents` المُنشأة آليًا عبر الاستيراد تفتقد `branchId`/`createdBy` | `umrahImportEngine.ts` |
| M11 | 4 صفحات (groups, daily-runsheet, reconciliation, attachments) لها مسارات لكن بلا روابط sidebar — غير قابلة للاكتشاف | `sidebar-layout.tsx` |
| M12 | لا واجهة للخطابات (`/letters/*`)، ولا قائمة `commission-calculations`، ولا صفحة `nusk-invoices`/`payments` | راجع §6 |

---

## 6. UI-only / API-only Mismatches

### 6.1 واجهة تنادي endpoints غير موجودة (API orphans من جهة UI) — أزرار معطّلة
| الاستدعاء من الواجهة | الملف | الواقع |
|---|---|---|
| `GET /umrah/invoices/:id` | `umrah-invoice-detail.tsx` | غير موجود → **C2** |
| `POST /commission-plans/:id/activate` | `commission-plans.tsx` | غير موجود |
| `POST /commission-plans/:id/suspend` | `commission-plans.tsx` | غير موجود |
| `DELETE /commission-plans/:id` | `commission-plans.tsx` | غير موجود (يوجد `GET/PATCH` فقط) |
| `DELETE /umrah/seasons/:id` | `umrah-season-detail.tsx` | غير موجود (يوجد `GET/PATCH` فقط) |
| تنقّل `/umrah/invoices/:id/edit` | `umrah-invoice-detail.tsx` | مسار غير مسجَّل في `umrahRoutes.tsx` |
| تنقّل `/umrah/penalties/:id/edit` | `umrah-penalty-detail.tsx` | مسار غير مسجَّل |
| رابط `/details/umrah-violation/:id` | `violations.tsx` | مسار خاطئ (الصحيح `/umrah/violations/:id`) |

### 6.2 endpoints في الـ backend بلا أي واجهة (API-only — سطح غير مكشوف)
`POST /transport/:id/assign-pilgrims` · `GET /unassigned` · `POST /assign-bulk` · كامل كيان `nusk-invoices` (`GET/POST` + `:id`) · `GET /commission-calculations` · `POST /commission-plans/:id/calculate` (المحرّر ينادي `simulate` فقط) · `GET/POST /payments` · `POST /agent-invoices/:id/record-payment` · `GET /statements/:id` (JSON) · `GET /letters/:id/pdf` + `POST /letters/:id/dispatch` · `GET /import/batches(+/:id/changes)`.

### 6.3 fake UI
**لا توجد صفحات بيانات وهمية mock.** كل الصفحات موصولة بـ `apiFetch`/`useApiQuery`. العناصر غير الوظيفية محصورة في: مرفقات `pilgrim-create` (M9)، وأزرار §6.1.

---

## 7. ملخص انحراف الأحداث ودورة الحياة — Event / Lifecycle Drift

### 7.1 الأحداث
- catalog يضم **59 حدث `umrah.*`**. تحسّن واضح منذ تقرير #684 (`UMRAH_EVENTS_DRIFT_684.md`): الأحداث التي كانت "مُصنّفة بلا مُصدِر" مثل `group.split/merged`, `attachment.created`, `penalty.waived_bulk`, `letter.dispatched` **أصبحت تُصدَر فعلًا الآن**.
- **مُصدَر ولا يُصنَّف:** `umrah.season.closed`، `umrah.season.archived` (يصدرهما `PATCH /seasons/:id` ديناميكيًا عبر `umrah.season.${status}` ولا يوجدان في catalog) — بالإضافة إلى `umrah.overstay.detected`، `umrah.absconder.detected` (يصدرهما المحرك ولهما listeners لكن خارج catalog).
- **مُصنَّف بلا مُصدِر (orphans):** `umrah.import.previewed`، `umrah.invoice.gl_auto_posted`، `umrah.violation.updated`.
- **`PATCH /violations/:id` لا يصدر أي event** رغم وجود `umrah.violation.updated` في catalog.

### 7.2 دورة الحياة
- **خرائط مزدوجة:** الراوتر يعرّف خرائط محلية (`PILGRIM_TRANSITIONS` ...) و`lifecycleEngine.ts` يعرّف `STATE_MACHINES`. متطابقة لـ pilgrim/season/agent/transport/penalty، **لكنها منحرفة لـ `umrah_agent_invoices`**: الراوتر فيه `draft`، المحرك لا → **C1**.
- **كيانات بلا state machine:** `umrah_violations`، `umrah_groups`، `umrah_nusk_invoices` — `status` نصّي حر.
- **تجاوز الـ machine:** `PATCH /invoices/:id` يكتب `status` خامًا (M5).
- **انحراف معايير التجاوز:** ثلاثة معايير مختلفة لنفس المفهوم — cron يستخدم `actualStayDays/programDuration`، `run-penalty-engine` يستخدم `departureDate`، التقرير يستخدم `overstayDays` (**C3**).

---

## 8. ارتباطات Finance/GL التي يجب عزلها

العمرة مرتبطة بـ Finance عبر **أربع قنوات** + بوابة توجيه:

| القناة | الوصف | blocking? |
|---|---|---|
| بوابة التوجيه | `requireGuards("financial")` تغلّف **كامل بادئة `/umrah`** لكل الكتابات (POST/PATCH/DELETE) — فترة مالية مقفلة قد تمنع حتى إنشاء معتمر أو رحلة نقل | حاجب |
| `journal_entries`/`journal_lines` | 11 نقطة ترحيل GL (فاتورة وكيل، نقل، غرامة، إعفاء، فاتورة مبيعات، دفعة، عمولة، AP نسك، استرداد) عبر `financialEngine`/`createGuardedJournalEntry` | C1/C3/C4 من §المحركات: الفوترة/العمولة blocking؛ البقية non-blocking مبتلَع |
| `account_mappings` | كل ترحيل يقرأ رموز الحسابات (مع fallback رقمي ثابت) | قراءة |
| `financial_posting_failures` | المسار الجَماعي للعمولات يكتب صفًا عند فشل خطة | غير حاجب |
| `treasuryId` على `umrah_nusk_invoices` | استيراد الـ vouchers يربط صندوق نقدية بقيد AP | — |

**Listeners تلقائية:** `umrah.invoice.generated` و`umrah.payment.received` تُشغِّل ترحيل GL تلقائيًا في `eventListeners.ts`.

**توصية العزل (للتنفيذ ضمن مسار Finance لاحقًا، خارج نطاق هذا التقرير):** توحيد كل ترحيل GL خلف واجهة واحدة non-blocking تكتب فشلها في `financial_posting_failures` بدل ابتلاعه؛ ومراجعة ما إذا كان `requireGuards("financial")` يجب أن يحجب الكتابات التشغيلية غير المالية (إنشاء معتمر/نقل).

---

## 9. مسارات القرار — Decision Tracks

قرارات تحتاج موافقة المالك قبل أي PR إصلاح:

| المسار | القرار المطلوب | الخيارات |
|---|---|---|
| **DT-1: فاتورة الوكيل (C1)** | كيف تخرج من `draft`؟ | (أ) إضافة حالة `draft` للـ STATE_MACHINE + endpoint `send`؛ (ب) جعل `generate` يُنشئ مباشرة `sent`؛ (ج) السماح لـ `record-payment` بالقبول من `draft` |
| **DT-2: التجاوز/الغرامات (C3)** | نظام واحد أم اثنان؟ | (أ) دمج `umrah_violations` في `umrah_penalties`؛ (ب) إبقاؤهما مع رابط صريح `penaltyId↔violationId` وتعريف "violation = حدث، penalty = أثر مالي"؛ (ج) إلغاء أحدهما |
| **DT-3: ربط النقل (C4)** | نموذج البيانات | (أ) جدول ربط `umrah_transport_pilgrims`؛ (ب) عمود `transportId` على المعتمر؛ (ج) قبول العدّاد فقط وإزالة واجهة التخصيص — **يحتاج migration → خارج نطاق هذا الوكيل، قرار مالك** |
| **DT-4: التشغيل اليومي (C5)** | أتمتة | (أ) cron يستدعي منطق `run-daily-status`؛ (ب) إبقاؤه يدويًا مع تنبيه واضح |
| **DT-5: واجهة الفاتورة (C2)** | أيّ كيان تعرض صفحة التفاصيل؟ | توحيد القائمة والتفاصيل على `agent-invoices`، أو إضافة `GET /invoices/:id` لفواتير المبيعات وفصل الصفحتين |
| **DT-6: الكيانات بلا lifecycle** | violations/groups/nusk | اعتمادها كـ state machines رسمية أم إبقاؤها نصّية |

---

## 10. ترتيب الـ PRs الموصى به

> **هذا الوكيل لا ينفّذ إصلاحات.** الترتيب أدناه اقتراح تخطيطي بعد حسم §9. DT-3 يتطلب migration → خارج نطاق هذا الوكيل.

| الأولوية | PR | يعالج | الاعتماد |
|---|---|---|---|
| P0 | إصلاح صفحة تفاصيل الفاتورة (C2) — توحيد المسار/الـ endpoint | C2 | DT-5 |
| P0 | فتح مسار `draft→sent` لفاتورة الوكيل (C1) | C1 | DT-1 |
| P1 | توحيد/ربط نظام التجاوز والغرامات (C3) | C3, M4 | DT-2 |
| P1 | cron لتقدّم حالة المعتمر اليومي (C5) | C5 | DT-4 |
| P1 | نموذج ربط النقل↔المعتمر (C4) — **migration، قرار مالك** | C4 | DT-3 |
| P2 | تنظيف واجهة: أزرار §6.1 المعطّلة + روابط مكسورة + رفع مرفقات `pilgrim-create` | §6.1, M9 | — |
| P2 | تصحيح تعارض أسماء الحقول في صفحات التفاصيل الأربع | M8 | — |
| P2 | إصلاح فلتر `seasonId` الميّت في تقرير المطابقة | M1 | — |
| P3 | حوكمة: audit/event لـ `PATCH /violations/:id`، event لـ `groups`/`attachments` delete | M6, M7 | — |
| P3 | catalog: إضافة `season.closed/archived` + معالجة الـ orphans | §7.1 | — |
| P3 | كشف الصفحات المخفية في الـ sidebar + واجهات للسطح غير المكشوف (§6.2) | M11, M12 | — |
| لاحقًا | عزل GL خلف واجهة non-blocking موحَّدة | M2, M3, §8 | **مسار Finance — خارج النطاق** |

---

## 11. الإجابة المباشرة على أسئلة الفحص

| السؤال (لكل route/page) | الإجابة الإجمالية |
|---|---|
| هل الصفحة موجودة؟ | نعم — 23 صفحة + 8 تفاصيل، كلها موجودة وموصولة |
| هل API مربوط؟ | نعم في الغالب — 8 استدعاءات واجهة لـ endpoints غير موجودة (§6.1) |
| هل CRUD يعمل؟ | نعم لمعظم الكيانات؛ مكسور لفاتورة الوكيل (C1) وصفحة الفاتورة (C2) |
| هل workflow واضح؟ | جزئيًا — التجاوز/الغرامة مزدوج (C3)، النقل تجميلي (C4) |
| هل lifecycle صحيح؟ | صحيح لمعظم الكيانات؛ منحرف لـ agent-invoice (C1)؛ غائب لـ violations/groups/nusk |
| هل penalties/invoices مرتبطة؟ | penalties↔agent-invoices مرتبطة عبر `invoiceId`؛ violations↔penalties **غير** مرتبطة (C3) |
| هل الأحداث cataloged/emitted؟ | نعم في الغالب — انحراف بسيط (`season.closed/archived` + 3 orphans) |
| هل audit موجود؟ | نعم في الغالب — الثغرة الأبرز `PATCH /violations/:id` (M6) |
| هل scope/companyId مطبّق؟ | `companyId` مطبّق؛ تفاصيل التطبيع **مؤجَّلة لـ #685 (خارج النطاق)** |
| هل يوجد fake UI أو API orphan؟ | لا fake UI؛ نعم API orphans في الاتجاهين (§6) |
| هل يوجد GL touch يجب عزله؟ | نعم — 4 قنوات + بوابة `requireGuards("financial")` (§8) |

---

*انتهى التقرير — تحليل ثابت فقط، لا تعديلات على الكود. أُنشئ بواسطة وكيل Umrah & Operations Integrity في 2026-05-21.*
