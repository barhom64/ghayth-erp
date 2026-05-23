# Enterprise Hardening Roadmap

> **تاريخ**: 2026-05-22  
> **الفرع**: `claude/enterprise-hardening-roadmap-AOfO7`  
> **المرحلة**: ما بعد Phase 0 (Environment Validation). يحدّد هذا المستند ما
> يلزم لتحويل النظام من *“ناضج وظيفيًا”* إلى *Enterprise-ready* بمعناه
> الصارم: تشغيلي، قابل للتدقيق، قابل للتوسّع، وموحّد.

## الحالة الحالية — ملخص واقعي

النظام تجاوز مرحلة MVP و Demo ERP. التقييم الفعلي:

| المحور | الحالة | الدليل |
| --- | --- | --- |
| Schema + Domain logic | ناضج | 85 lib module · 85 route file · 1131/1131 endpoint على `authorize()` (`docs/REMAINING_ROADMAP.md`) |
| RBAC v2 | ✅ مكتمل | `docs/RBAC_V2.md` §11 |
| Env validation | ✅ Phase 0 | `docs/production-hardening/phase-0-env-validation.md` |
| Event bus + Outbox capture | جزئي | `event_outbox` يلتقط فقط — لا relay. راجع §2 |
| DLQ | موجود + مفهرس | `migrations/110_event_dlq_table.sql` |
| Cron + listeners | داخل HTTP process | `index.ts:129-144` يبدأ السيرفر ثم cron داخل نفس العملية |
| Finance regression suite | متفرّق | golden path test واحد + 14 ملف finance منفصل، بلا scenario harness موحّد |
| UI standardization | منخفض | 429 page · 282 استدعاء FormShell · 499 استدعاء DataTable · 18 صفحة لا تزال تستخدم `<table>` خام · 251 صفحة فيها `useState` (forms غير مهاجَرة) |

النظام دخل مرحلة **Enterprise Hardening**؛ هذا المستند يقسّمها إلى أربع
حُزم متوازية، كل واحدة لها مالك وقابلة للتقطيع إلى PRs.

---

## التنسيق مع الحملات الجارية (لا تعارض)

هناك ثلاث حملات نشطة على `main` تتقاطع مع هذا الـ roadmap. كل Track
هنا مُصمَّم ليبني فوقها لا أن يعيد عملها:

### 1. حملة FND (Foundation defects) — `docs/audit/inventory/foundation.md`

| ID | الحالة | علاقتها بـ tracks |
| --- | --- | --- |
| FND-001 (dead migrations dir) | ✅ #848 | — |
| FND-003 (env → config + lint guard) | ✅ #874 | **مُمكِّن لـ A1** — worker الجديد سيستهلك `config` مباشرة |
| FND-004 (router mount guards) | ✅ #866 (جزئي) | — |
| FND-008 (cron failure alerts) | ✅ #867 | **مُمكِّن لـ A2** — alerting موجود قبل النقل |
| FND-010 (RBAC catalog unification) | ✅ #900 | — |
| FND-002, FND-005, FND-006, FND-007, FND-012, FND-013 | قيد العمل | يجب أن تكتمل قبل أو بالتوازي مع Tracks، لا داخلها |

**القاعدة**: لا يجوز لأي PR من هذا الـ roadmap أن يفتح FND جديدًا أو
يقترب من نطاق FND قائم بلا تنسيق صريح.

### 2. موجة Finance Hardening — Wave 2 (PRs #878-#888 + C/H series)

الأسبوع الأخير شهد:
- C1 reconcile financial statements (#879)
- C2 stamp gl/posting with accounting date (#886)
- C3 atomic expense entry + approval chain (#885)
- H1 reverse rejected-entry balances in lifecycle txn (#881)
- H2 closed-period guard on deferred balances (#882)
- H3 rounding line balance movement (#884)
- H4 stable idempotency key on POST mutations (#887)
- #878 dead-letter from async event listeners
- #888 journal entries balance to cent (drop auto-plug)

**نتائج التنسيق**:
- **Track C يجب أن يلتقط هذه الـ 9 إصلاحات كأول 9 golden scenarios**
  (C2 من الـ roadmap = «20 scenario أولى»). أي regression
  مستقبلي على نفس السطح يجب أن يكسر سيناريو واحد منها على الأقل.
- **#878 يخفّض حِمل Track A.3** — DLQ للـ async listener failures
  أصبح موجودًا؛ A.3 (relay daemon) يبني فوقه لا يستبدله.

### 3. قائمة عمل RESCAN v3 — صفحات UI جديدة

من `docs/audit/RESCAN_2026-05-22-v3.md` §2، هذه الصفحات ستُبنى قريبًا:

- FIN-013 (journal-manual approval buttons)
- FIN-014 (period close UI)
- FIN-015 (unify fiscal-periods v1/v2)
- FIN-016 (GRN/match/pay UI)
- CRM-004 (opportunity activities)
- COM-001, COM-002 (communications log + routing rules)
- UMR-005, UMR-016 (umrah invoice pages)
- HR-010 (attendance policy / accruals / delegations)
- FLT-006 (fleet alerts)

**خطر التعارض الأكبر**: لو بُنيَت هذه الصفحات قبل **B1** (UI kit
abstractions)، سنضيف ≈12 صفحة جديدة بأنماط متفرّقة — والديون التي
يحاربها Track B تتضاعف.

**القرار الموصى به**: **B1 يصبح P0 فوق Track A**، حتى تُبنى صفحات
FIN-014/FIN-016/HR-010 على `<ListPage>`/`<CreateEditPage>` الجديدين
مباشرة. هذا أيضًا يلغي حاجة تهجيرها لاحقًا في B3.

### 4. Track dependencies على عيوب FND/FIN قائمة

| Track | يتطلّب اكتمال |
| --- | --- |
| A.4 (transactional outbox) | FND-006 (auditMiddleware coverage) — وإلا أحداث legal/store/governance لن تُكتب outbox |
| C.5 (period closing suite) | FIN-014 + FIN-015 — لا يصحّ كتابة tests لنظامَي فترات متوازيين |
| C.4 (ledger replay) | FND-007 (PERSIST_ALL_EVENTS) — replay يحتاج completeness في `event_logs` |
| D.2 (workflow engine adoption) | يستفيد من نمط `lib/supportSlaEscalation.ts` (SUP-015 #869) — لا تعيد بناءه، عمّمه |

---

## Track A — Runtime Separation (worker + outbox relay)

### المشكلة

كل ما يلي يعمل داخل عملية `api-server` نفسها:

- `startCronScheduler()` (`index.ts:133`) — يسجّل ≈ كل cron jobs النظام
  داخل HTTP process.
- `registerEventListeners()` + `registerRulesEngineListener()`
  (`index.ts:105-106`) — listeners تتنفّذ في نفس event loop الذي يخدم
  الطلبات.
- `event_outbox` يلتقط الأحداث (`lib/eventBus.ts:captureToOutbox`) لكن
  الـ **relay الذي يصرّفها لا يوجد** — الملاحظة موثّقة داخل التعليق نفسه
  («Phase 1 captures only — the dispatcher … is unchanged»، راجع
  `migrations/187_event_outbox.sql:6-8`).
- DLQ replay يعتمد على endpoints يدوية داخل `admin.ts` بدل consumer
  مستقل.

النتيجة: deploy للـ API = إعادة تشغيل cron + listeners + relay. أي
قمة طلبات تنافس الأحداث الخلفية على نفس event loop. ضمانات التسليم
الفعلية ضعيفة لأن capture بدون relay = اعتماد على in-process dispatch
الذي يفنى مع العملية.

### النتائج المرجوّة

1. **`worker` process مستقل** يُبنى من نفس monorepo، يستورد نفس
   `lib/`، يبدأ مع علم `WORKER_ROLE=cron|relay|listener` ولا يفتح HTTP
   port (إلا `/healthz` فقط للـ liveness).
2. **Outbox relay daemon** — حلقة تختار batch من `event_outbox` حيث
   `status='pending'`، تنفّذ الـ listener المعنيّ، تحدّث الحالة atomically،
   وعند الفشل ترفع `attempts` ثم تنقل للـ DLQ بعد `MAX_ATTEMPTS`.
3. **Dispatch source switch** — `eventBus.emit` يكتب outbox أولًا داخل
   نفس الـ DB transaction للـ command (حقيقي transactional outbox)،
   ثم relay وحده يطلق listeners. في فترة الانتقال: feature flag
   `OUTBOX_DISPATCH_ENABLED` يسمح بالعودة للسلوك القديم.
4. **HTTP process يصبح stateless تمامًا** — لا cron، لا proactive
   listeners، لا startup work غير الـ migrations + RBAC sync.

### Phases

| Phase | المخرج | ملفات متأثرة | معيار النجاح |
| --- | --- | --- | --- |
| A1 | `artifacts/worker/` workspace جديد + Dockerfile.worker + ecosystem entry | `artifacts/worker/src/index.ts`, `Dockerfile.worker`, `ecosystem.config.cjs`, `pnpm-workspace.yaml` | `pnpm --filter worker dev` يبدأ ويتصل بـ DB |
| A2 | نقل `startCronScheduler` خلف `WORKER_ROLE=cron` فقط؛ HTTP process يتخطّاه | `artifacts/api-server/src/index.ts:129-144`, `artifacts/worker/src/cron.ts` | api-server boot بدون cron logs؛ worker يطبع نفس الـ jobs |
| A3 | Outbox relay daemon | `artifacts/worker/src/relay.ts`, `lib/eventBus.ts` (إضافة `dispatchFromOutbox`) | metric `outbox.pending` يبقى < threshold تحت حِمل |
| A4 | Transactional outbox: emit يكتب outbox داخل نفس transaction الـ command | `lib/eventBus.ts`, مواقع `emit` الحرجة (finance posting, journal entries) | اختبار: kill الـ relay، أعد التشغيل، الحدث يُسلَّم بالضبط مرة واحدة |
| A5 | Listeners ينتقلون من in-process إلى relay-driven | `lib/eventListeners.ts`, `lib/rulesEngine.ts`, `lib/proactiveEngine.ts` | api-server لا يحتوي أي listener registration بعد A5 |

### Acceptance gate

- `grep -n "startCronScheduler\|registerEventListeners\|registerRulesEngineListener" artifacts/api-server/src/index.ts` → ينتج 0 hits.
- `WORKER_ROLE=cron` و `WORKER_ROLE=relay` و `WORKER_ROLE=listener` لكل
  منها container مستقل و health check خاص.
- chaos test: kill `-9` على api-server أثناء إصدار فاتورة → relay يلتقط
  ويصدر event عند إعادة التشغيل دون فقدان.

---

## Track B — UI Standardization Layer

### المشكلة (أكبر دين تقني مرئي حاليًا)

429 صفحة · لا قواعد مفروضة على:

- الجداول: 499 استخدام `DataTable` لكن 18 صفحة لا تزال raw `<table>`.
- النماذج: 282 استخدام `FormShell` مقابل 251 صفحة تحمل `useState` —
  ≈58% من الصفحات لم تهاجَر إلى `react-hook-form + zod` الموحّد
  (راجع `docs/REMAINING_ROADMAP.md` §3).
- Filters / Drawers / Actions / Statuses / Audit views: كل دومين
  أعاد اختراعها بنكهة مختلفة (راجع `components/shared/` — هناك
  `crm-tabs-nav`, `hr-tabs-nav`, `fleet-tabs-nav`, `finance-tabs-nav`
  بدلًا من واحد generic).

### المخرج

1. **`@ghayth/ui-kit`** ضمن `lib/` — مكتبة داخلية تُصدّر:
   - `<ListPage>` = filters + table + bulk actions + pagination + empty/error states.
   - `<DetailPage>` = header + status badge + timeline + tabs + actions.
   - `<CreateEditPage>` = `FormShell` معياري + validation + dirty-guard + autosave.
   - `<EntityDrawer>` للـ inline edits.
   - `<StatusPill>` بقاموس واحد للحالات عبر الدومينات.
   - `<AuditTrail>` يقرأ من `auditLogs` API ويعرض diff موحّد.
2. **Page generator** = `scripts/scaffold-page.mjs` يولّد ListPage جديدة
   متوافقة من spec بسيط (entity, columns, actions).
3. **ESLint rule محلية** تمنع import مباشر لـ raw `<table>` أو
   `<form>` خارج `lib/ui-kit/`.

### Phases

| Phase | المخرج | ملفات | معيار النجاح |
| --- | --- | --- | --- |
| B1 | استخراج 4 abstractions الأساسية إلى `lib/ui-kit/` | `lib/ui-kit/src/list-page.tsx`, `detail-page.tsx`, `create-edit-page.tsx`, `status-pill.tsx` | finance + hr يستوردان منه دون أي UI regression |
| B2 | تهجير 18 صفحة raw `<table>` (المُعدّ سلفًا في metric أعلاه) إلى `<ListPage>` | يحدّدها `grep -rln "<table" artifacts/ghayth-erp/src/pages` | 0 raw `<table>` خارج `lib/ui-kit/` |
| B3 | Forms migration sweep أولى: 80 صفحة finance + HR من `useState` إلى `<CreateEditPage>` | حسب `docs/forms-migration-report.md` | عدّاد `useState in pages` ينخفض من 251 → ≤170 |
| B4 | توحيد التبويبات: حذف `*-tabs-nav.tsx` المتفرّقة لصالح `<DomainTabs>` واحد | `components/shared/*-tabs-nav.tsx` | حذف 4 ملفات؛ كل دومين يستهلك tabs config |
| B5 | ESLint guard + scaffold script | `eslint-plugin-ghayth/rules/no-raw-table.js`, `scripts/scaffold-page.mjs` | CI يرفض raw `<table>` جديد |

### ملاحظة scope

تهجير الـ 280+ صفحة الكاملة (`REMAINING_ROADMAP.md §3`) خارج نطاق هذه
الخطة — هنا نضع الأساس فقط، ثم التهجير يجري incremental وفق نفس
الأولوية المقترحة (20-30 صفحة/سبرنت).

---

## Track C — Finance Stabilization Phase

### المشكلة

كثافة التعديلات على invoices · journals · budgets · VAT · reports ·
reversals تفوق طاقة الـ test suite الحالي:

- `financeGoldenPath.test.ts` غطّى السيناريوهات الأساسية فقط.
- لا يوجد **scenario harness** يشغّل دورة كاملة (PO → GRN → invoice →
  payment → reversal → period close) ويتحقق من ledger النهائي.
- لا **ledger replay** — لا نستطيع إعادة بناء أرصدة من event_logs
  والمقارنة مع snapshots.
- VAT verification متناثر داخل `umrahMarginVatSmoke.test.ts` فقط.
- Period closing بلا snapshot tests.
- Reversal integrity يعتمد على code review.

هذا الـ gap هو الأخطر تشغيليًا حاليًا — تغيير صغير في GL posting قد
يفسد أرصدة بصمت ولن يكتشفه أي test موجود.

### المخرج

`artifacts/api-server/tests/finance-regression/` كحقيبة مستقلة:

1. **Golden scenarios** — YAML/JSON ملفات تصف سيناريو كامل (الفاتورة،
   البنود، الضرائب، الدفعة، التسوية). Harness يقرأها ويشغّلها على DB
   مؤقت ثم يقارن الـ ledger النهائي.
2. **Snapshot accounting tests** — كل سيناريو يحفظ snapshot للأرصدة
   لكل GL account؛ تغيير غير مقصود → diff واضح في PR.
3. **Reconciliation suite** — يولّد transactions عشوائية ضمن قيود مالية،
   ثم يتحقق أن المعادلة المحاسبية محفوظة (Σ debits = Σ credits لكل
   فترة، لكل company، لكل branch).
4. **Ledger replay tests** — يأخذ event_logs لفترة، يعيد تطبيقها على DB
   نظيف، يقارن النتيجة بـ snapshot.
5. **VAT verification suite** — يولّد سلال فواتير متنوعة (standard,
   zero, exempt, mixed) ويتحقق من VAT return الناتج مقابل قيم متوقعة.
6. **Period closing suite** — يفتح/يغلق فترات، يحاول posting إلى فترة
   مغلقة، يتأكد من رفع الخطأ + audit trail.
7. **Reversal integrity suite** — كل reversal يجب أن يولّد journal
   معاكس بالضبط؛ test يمسح المسار للجولة الكاملة.

### Phases

| Phase | المخرج | ملفات | معيار النجاح |
| --- | --- | --- | --- |
| C1 | Scenario harness (loader + runner + snapshot comparator) | `tests/finance-regression/harness/` | سيناريو واحد yaml يمر |
| C2 | 20 golden scenarios أولى (AR/AP/Payroll/Umrah-package) | `tests/finance-regression/scenarios/*.yaml` | كل سيناريو ينتج snapshot ثابت |
| C3 | Reconciliation invariant suite | `tests/finance-regression/invariants.test.ts` | property-based: 1000 transaction، Σ debits = Σ credits |
| C4 | Ledger replay | `tests/finance-regression/replay.test.ts` | event_logs لشهر يُعاد تطبيقها → نفس الأرصدة |
| C5 | VAT + period close + reversal suites | `tests/finance-regression/vat.test.ts` + `period-close.test.ts` + `reversals.test.ts` | كل سيناريو يولّد VAT return صحيح |
| C6 | CI gate: PR يلمس `finance-*.ts` أو `gl/*` أو `engines/accounting*` يجب أن يمرّر `finance-regression` كاملة | `.github/workflows/finance-regression.yml` | required check قبل merge |

### Acceptance gate

- `pnpm --filter api-server test:finance-regression` يكتمل في < 5 دقائق.
- coverage لـ `lib/gl/*` + `lib/engines/accounting*` ≥ 90% line coverage.
- تغيير عشوائي في `glJournalPoster` يكسر ≥ 3 سيناريوهات (regression
  caught early).

---

## Track D — Workflow + Document/Print Standardization

### Workflow Engine

حاليًا approvals مبعثرة عبر `approvalActions.ts` + `hr-loans.ts` +
`finance-purchase.ts` + `hr-exit.ts` + `hr-discipline.ts` + … (راجع
نتائج `grep -rln "approvalActions"` أعلاه). كل دومين أعاد بناء:
escalation timers، delegation، SLA tracking.

**المخرج**: `lib/workflow/` engine موحّد:
- `defineWorkflow({ steps, slas, escalations, delegations })`.
- جدول `workflow_instances` + `workflow_steps` + `workflow_events`.
- listeners تربط الـ engine بـ outbox relay (Track A).
- SLA breach يولّد escalation event بدل cron مخصص.

### Document/Print Engine

21 ملف يلمس print/PDF، لكن template engine غير موحد. الفاتورة، عرض
السعر، contract، payslip — كل واحد له render path مستقل.

**المخرج**: `lib/print/`:
- `<DocumentTemplate>` API يأخذ template id + variables + locale.
- محرّك variables موحّد (`{{company.name}}`, `{{invoice.total | currency}}`).
- renderer واحد (Puppeteer أو @react-pdf) خلف interface — السلوك ثابت
  بغض النظر عن الـ implementation.
- جدول `document_templates` يخزّن النسخ (versioning للقوالب).

### Phases

| Phase | المخرج | معيار النجاح |
| --- | --- | --- |
| D1 | `lib/workflow/` engine + 3 جداول + adapter من approvalActions الحالي | كل approval موجود يعمل بدون تغيير سلوكي |
| D2 | تهجير hr-loans + hr-exit + hr-discipline إلى الـ engine الجديد | حذف escalation cron-jobs المخصصة |
| D3 | `lib/print/` + 3 templates أوّليّة (invoice, quote, payslip) | PDF متطابق byte-for-byte عبر runs |
| D4 | Templates UI لـ admin لإدارة النسخ + متغيرات الشركة | غير-مطوّر يستطيع تعديل header الفاتورة دون deploy |

---

## التسلسل المقترح بين الـ Tracks

```
A1 ─┬─> A2 ─> A3 ─> A4 ─> A5            (Runtime separation, مسار حرج)
    │
C1 ─┴─> C2 ─> C3 ─> C4 ─> C5 ─> C6     (Finance suite، ابدأ بالتوازي)
                                          (يحمي من regression خلال D1-D2)
B1 ─> B2 ─> B3 ─> B4 ─> B5              (UI، مسار طويل، أقل خطورة)

D1 ─> D2 (يعتمد على A3 — workflow يستخدم relay)
D3 ─> D4 (مستقل)
```

**الترتيب الموصى به** (مُحدَّث بعد رصد حملات FND + Wave-2 + RESCAN v3):

1. **P0 الفوري — قبل أي شيء آخر**: **B1** (استخراج abstractions إلى
   `lib/ui-kit/`). السبب: ≈12 صفحة جديدة في طريقها (FIN-014, FIN-016,
   HR-010, COM-001/002, CRM-004, UMR-005/016, FLT-006) — كل صفحة
   تُبنى على النمط القديم تضاعف دين B3 لاحقًا.
2. **P0 بالتوازي مع B1**: **C1+C2** (scenario harness + التقاط 9 fix
   الأخيرة C1-C3/H1-H4/#878/#888 كأول سيناريوهات). هذا يقفل قفل
   regression على الإصلاحات الطازجة قبل أن تختفي من الذاكرة.
3. **P1 — بعد B1**: **A1+A2** (worker process + نقل cron). يستفيد من
   FND-003 (env via config) و FND-008 (cron alerts) المُنجَزَين.
4. **P1 بالتوازي**: B2 (تهجير 18 raw `<table>`) + توجيه تطبيق الـ
   ui-kit في صفحات RESCAN v3 الجديدة.
5. **P2**: A3+A4 (transactional outbox الحقيقي) — يبني فوق DLQ في
   #878، يحتاج FND-006 لتغطية كاملة.
6. **P2**: C3-C6 (إكمال finance regression) — لزم قبل أي تغيير
   هيكلي في GL. C5 (period close) يتطلّب FIN-014 + FIN-015 جاهزَين.
7. **P3**: D1-D2 (workflow engine، يحتاج A3 + يستلهم `lib/supportSlaEscalation.ts`)،
   D3-D4 (print engine)، B3-B5 (forms sweep).

## تقدير حجم العمل

| Track | الجهد | فريق |
| --- | --- | --- |
| A — Runtime separation | 4-6 أسابيع | 1 backend + 1 DevOps |
| B — UI standardization (foundation فقط) | 6-8 أسابيع | 2 frontend |
| C — Finance regression suite | 5-7 أسابيع | 1 backend + finance SME |
| D — Workflow + print | 6-8 أسابيع | 1 backend + 1 frontend |

الإجمالي مع التوازي: **~3-4 شهور** بفريق 4-5 مطوّرين.

## ما هو **خارج** هذا الـ Roadmap (لا تخلطه)

البنود التالية موثّقة في `docs/REMAINING_ROADMAP.md` ولا تتداخل مع
hardening:

- ZATCA Phase 2
- Multi-currency في GL
- i18n الكامل
- Inventory advanced (lots/serials)
- Saudi labor compliance (WPS/Mudad)
- as any cleanup
- WCAG audit
- CSRF explicit

هذه **مزايا أعمال أو compliance** — مسار مختلف عن hardening
التشغيلي/المعماري الموصوف هنا.

## معايير "Enterprise-ready" النهائية

النظام يُعتبر Enterprise-ready عند تحقّق كل ما يلي مجتمعًا:

- [ ] api-server stateless (لا cron، لا listeners) — Track A
- [ ] Outbox relay يضمن exactly-once delivery — Track A
- [ ] Finance regression suite gates كل PR يلمس GL — Track C
- [ ] UI kit موحّد + ESLint guard — Track B
- [ ] Workflow + print engines موحّدين — Track D
- [ ] Phase 0 env validation ✅ (مكتمل سلفًا)
- [ ] RBAC v2 على 100% endpoints ✅ (مكتمل سلفًا)

---

**هذا المستند مرافق لـ**:
- `docs/REMAINING_ROADMAP.md` — مزايا الأعمال المتبقية
- `docs/production-hardening/phase-0-env-validation.md` — أساس الـ hardening
- `docs/ARCHITECTURE.md` — البنية الحالية
- `docs/MONITORING.md` — observability stack
- `docs/audit/inventory/foundation.md` — سجل FND النشط
- `docs/audit/RESCAN_2026-05-22-v3.md` — حالة موجة الإصلاحات الثانية
- `docs/audit/inventory/finance.md` — سجل FIN النشط
