# UNIFICATION_PLAN

> **حالة**: مرجع حيّ (restored 2026-05-23). يُحدَّث مع كل phase تكتمل.
>
> **النطاق**: الخطة الواحدة التي تحكم تكامل الـ stack الأمامي + الواجهة
> الخلفية حول مُمكِّنات (primitives) موحَّدة. كل phase معلَّمة `P{major}.{minor}`
> ومستهلَكة في docstrings الكود (`grep "P[0-9]\.[0-9]" artifacts/`).

## غرض الخطة

قبل التوحيد، كل صفحة من 429 صفحة UI و85 ملف route تحمل بصمتها الخاصة:
header مختلف، breadcrumbs مختلفة، status chips بألوان مختلفة لنفس
القيمة، error handling متفرّق، toLocaleString بدون locale، إلخ. الخطة
تُحدّد مُمكِّنًا واحدًا (one primitive) لكل قلق متكرّر — ثم تُهاجِر
الصفحات إليه phase بـ phase.

> **قاعدة الذهب**: المُمكِّنات `opt-in` — لا تكسر الصفحات القائمة.
> الـ phases من P3 و P4 تُهاجِر الصفحات تدريجيًا. الـ lint guards تُضاف
> فقط بعد اكتمال التهجير لمنع الانحدار.

---

## P0 — Foundation primitives (مكتمل)

| الـ phase | المُمكِّن | الموقع | الحالة |
| --- | --- | --- | --- |
| P0.3 | Typed errors في الـ API | `artifacts/api-server/src/lib/errorHandler.ts` | ✅ |
| P0.4 | Runtime schema audit | `artifacts/api-server/src/routes/health.ts:157+` | ✅ |
| P0.5 | PageErrorBoundary | `artifacts/ghayth-erp/src/components/page-error-boundary.tsx` | ✅ |

الفئات: `ValidationError`, `NotFoundError`, `ConflictError`, `ForbiddenError`,
`UnauthorizedError`. تخرج من `handleRouteError` بحقول `code` و`field` و`fix`
المعيارية.

---

## P1 — UI primitives (مكتمل)

| الـ phase | المُمكِّن | الموقع | تبنّي |
| --- | --- | --- | --- |
| P1.1 | `PageShell` | `components/page-shell.tsx` (242 line) | 179/429 صفحة (41.7%) |
| P1.2 | `FormShell` + field components | `components/form-shell.tsx` (433 line) | 55/429 صفحة (12.8%) |
| P1.3 | `ApiError` + typed error pipeline | `lib/api.ts` | عالمي |
| P1.4 | DataTable column presets (`textColumn`, `currencyColumn`, `dateColumn`, `statusColumn`, `linkColumn`, `actionsColumn`) | `components/data-table-presets.tsx` | اختياري |
| P1.5 | `useLifecycleAction` hook | `hooks/use-lifecycle-action.tsx` | عالمي عند الـ approve/reject/post |
| P1.6 | `PageStatusBadge` + STATUS_MAP موحَّد | `components/page-status-badge.tsx` (473 line) | تدريجي |
| — | `DetailPageLayout` | `components/shared/detail-page-layout.tsx` (395 line) | 79/429 صفحة (18.4%) |

### العقد المُختصر لكل مُمكِّن

**`<PageShell>`**: header (title + subtitle + breadcrumbs + actions) +
filter row + PageErrorBoundary + سياق RTL. كل صفحة list/dashboard
تبدأ به.

**`<FormShell>`**: `useForm` + `zodResolver` + submit bar + server
field-error bridge. كل صفحة create/edit تبدأ به. لا تكتب
`useForm` يدويًا.

**`<DetailPageLayout>`**: header (ref + status + dates) + tabs
(Overview/Documents/Timeline/Comments/Tasks/Links/Print) + actions
بإذن. كل صفحة تفاصيل كيان تبدأ به.

**`<PageStatusBadge>`**: قاموس `STATUS_MAP` لكل (`status`, `domain`)
يعيد label عربي + tone. لا تخمّن لون الـ chip محليًا.

**Column presets**: لا تكتب `render: (row) => formatCurrency(row.total)`
يدويًا — `currencyColumn("total", "الإجمالي")` يفعلها.

**`useLifecycleAction`**: استدعاء submit/approve/reject/post مع
toast + invalidate + ApiError dispatch. لا تنسخ هذا الـ wiring في كل
mutation.

---

## P2 — Schema discipline (جزئي)

| الـ phase | المُمكِّن | الحالة |
| --- | --- | --- |
| P2.4 | CHECK constraints على status enums (تتوافق مع STATUS_MAP) | جزئي — راجع migrations recent |

السياسة: عند إضافة status جديد في `STATUS_MAP` (P1.6)، يجب إضافة
CHECK constraint مطابق على العمود قبل الـ deploy.

---

## P3 — Server-side adoption (مكتمل)

نُقلت الـ routes تدريجيًا إلى:
- `authorize()` middleware (1131/1131 endpoint — راجع `docs/RBAC_V2.md` §11)
- Typed errors throw بدل `res.status(...).json(...)`
- `assertRole` بدل local `function requireRole`

الـ lint rules النشطة (`scripts/src/lint-patterns.mjs`):
- `local-requireRole`
- `legacy-validationError-call`
- `legacy-validationError-import`
- `direct-gl-import-in-domain-route`
- `direct-account-mapping-in-domain-route`
- `direct-process-env-read` (FND-003)

---

## P4 — Domain sweep (مستمر)

كل دومين يُسحب إلى المُمكِّنات في sweep مستقل:

| دومين | الـ phase | الحالة |
| --- | --- | --- |
| Support | P4.1 | sweep جرى |
| HR (hub) | P4.2 | sweep جرى |
| CRM | P4.3 | sweep جرى |
| (آخر) | P4.4 | — |
| (آخر) | P4.5 | — |
| Legal | P4.7 | sweep جرى |
| (آخر) | P4.8 | — |
| (آخر) | P4.9 | — |

النمط في كل sweep:
1. صفحة hub الدومين تستخدم `<PageShell>` + chips من STATUS_MAP.
2. صفحات list تستخدم `<PageShell>` + DataTable مع column presets.
3. صفحات detail تستخدم `<DetailPageLayout>`.
4. صفحات create/edit تستخدم `<FormShell>`.

---

## P5 — Lint guards (Phase 1 منجَز · 2026-05-23)

### الـ ratchet pattern

`scripts/src/lint-patterns.mjs` يدعم الآن **counted rules** بـ
`countBaseline`. النمط: لا تُحظَر الـ legacy imports كليًا (سيكسر 700+
استيراد قائم)، بل يُثبَّت العدد الحالي كـ ceiling. أي PR يضيف import
قديم جديد → CI يفشل فورًا. أي PR يهاجِر صفحة → العدد ينخفض، تطبع
الأداة تنبيهًا "يمكن خفض الـ baseline لـ N".

### القواعد النشطة

| Rule | Baseline | الحالة |
| --- | --- | --- |
**ui-core**:
| `page-shell-from-legacy-path` | 143 | نشط |
| `form-shell-from-legacy-path` | 53 | نشط |
| `data-table-from-legacy-path` | 155 | نشط |
| `page-status-badge-from-legacy-path` | 20 | نشط |
| `create-page-layout-from-legacy-path` | 81 | نشط |
| `advanced-filters-from-legacy-path` | 64 | نشط |
| `data-table-presets-from-legacy-path` | 1 | نشط |
| `data-table-wrapper-from-legacy-path` | 2 | نشط |
| `page-header-from-legacy-path` | 3 | نشط |

**entity-kit**:
| `detail-page-layout-from-legacy-path` | 9 | نشط |
| `entity-timeline-from-legacy-path` | 2 | نشط |
| `entity-comments-from-legacy-path` | 0 | نشط |
| `entity-documents-from-legacy-path` | 0 | نشط |

**workflow-kit**:
| `approval-actions-from-legacy-path` | 5 | نشط |

**report-kit**:
| `print-layout-from-legacy-path` | 12 | نشط |

**الإجمالي**: **547 موضع** legacy import مغطّى بـ ratchet (هبط من 906
الأولي بعد عاشر sweep — هبوط 94 نقطة في sweep واحد عبر pages/ كاملة،
entity-comments و entity-documents وصلت إلى صفر). كل واحد لا يمكنه
الزيادة. كل migration يخفض العدد بمقدار 1 ويستوجب تحديث baseline في
نفس الـ PR.

### آلية العمل (للمساهمين)

1. **PR يضيف import قديم** → CI fails. الرسالة: "Ratchet exceeded:
   count is 180, baseline is 179 (+1 new violation)".
2. **PR يهاجِر صفحة من القديم** → CI يطبع ℹ بالـ baseline الجديد. على
   المُساهم خفض `countBaseline` في `scripts/src/lint-patterns.mjs`
   بنفس المقدار. لا يكسر CI لو نسي (التراجع لا يفشل)، لكن CI
   التالي يظل ينبّه حتى يتوافق العدد.
3. **عند وصول baseline لصفر** → القاعدة تتحوّل لـ hard rule (نزع
   `countBaseline`)؛ أي مخالفة جديدة تفشل مباشرة.

### قواعد مستقبلية (لم تُضَف بعد)

| القاعدة | الفجوة | جاهز؟ |
| --- | --- | --- |
| `raw-table-in-page` (يمنع `<table>` خارج DataTable) | 18 صفحة | يحتاج migration sweep أولًا |
| `useState-in-create-edit-page` (يفرض FormShell) | ~196 صفحة | لا — حجم كبير |
| `unscoped-status-badge` (`<Badge>` خام لـ status) | غير مُقاس | لا — يحتاج جرد أولًا |

---

## P6 — Standardization على RESCAN-v3 backlog (نشط)

`docs/audit/RESCAN_2026-05-22-v3.md` §2 يدرج 12 صفحة UI ستُبنى قريبًا:

- FIN-013 (journal-manual approval buttons)
- FIN-014 (period close UI)
- FIN-015 (unify fiscal-periods v1/v2)
- FIN-016 (GRN/match/pay UI)
- CRM-004, COM-001, COM-002
- UMR-005, UMR-016
- HR-010
- FLT-006

**قاعدة P6**: كل صفحة جديدة في هذه القائمة **يجب** أن:
1. تبدأ بـ `<PageShell>` أو `<DetailPageLayout>` (لا تبني wrapper محلي)
2. كل form فيها يستهلك `<FormShell>` (لا `useState` خام للحقول)
3. كل status chip يستهلك `<PageStatusBadge>` (لا `<Badge>` خام بـ
   color logic محلي)
4. كل جدول يستهلك `<DataTable>` مع column presets (لا `<table>` خام)

PR review checklist يجب أن يفرض هذه القواعد يدويًا حتى تُضاف lint
guards في P5.

---

## P9 — Typography Contract (Phase 1 منجَز · 2026-05-23)

### المشكلة قبل P9

مقاسات الخط لم تكن مركزية:
- `text-xs` (12px): **2616** استخدام عبر pages+components ← ≈58% من النصوص
- `text-sm` (14px): **1897** استخدام ← 26%
- `text-base` (16px) فأعلى: ≈16% فقط

النتيجة: النظام يبدو "صغيرًا" بصريًا. أي محاولة تكبير عالمي كانت تتطلب
تعديل 4500+ موضع.

### الحل

**root font-size كـ knob واحد**. كل Tailwind utilities (`text-*`,
`p-*`, `m-*`, `gap-*`, `w-*`, `h-*`) تستخدم `rem`، فهي نسبية للـ
`html { font-size }`. تغيير هذه القيمة يكبّر/يصغّر كل شيء متناسقًا.

| العنصر | الموقع | التحكم |
| --- | --- | --- |
| Font family | `artifacts/ghayth-erp/src/index.css` `--app-font-sans` | تغيير واحد ينقل كل النظام إلى خط آخر |
| Font scale | `artifacts/ghayth-erp/src/index.css` `html { font-size }` | تغيير واحد يكبّر/يصغّر كل النظام |
| Semantic tokens (`text-page-title`, `text-table-cell`, إلخ) | غير منفّذ بعد | **Phase 2 من P9** |

### الحالة الفعلية بعد Phase 1

- `html { font-size: 18px; }` (كان browser default 16px → +12%).
- `text-xs` يعرض الآن ≈13.5px (بدل 12px).
- `text-sm` يعرض الآن ≈15.75px (بدل 14px).
- `text-base` يعرض الآن 18px (بدل 16px).
- المسافات (padding/margin/gap) تتناسب تلقائيًا.

### Phase 2 — Semantic tokens (مخطط)

مقاسات Tailwind (`text-xs`/`text-sm`/إلخ) أرقام، ليست دلالات. عند الحاجة
لتغيير "كل عناوين الجداول" أو "كل تسميات الحقول"، لا نجد ما نلمسه.

**الحل المخطط**: tokens دلالية في `@theme inline`:

```css
@theme inline {
  --text-page-title: 1.5rem;       /* h1 */
  --text-section-title: 1.25rem;   /* h2 */
  --text-card-title: 1.125rem;     /* h3 / card headers */
  --text-body: 1rem;               /* body paragraphs */
  --text-table-cell: 0.9375rem;    /* table rows */
  --text-form-label: 0.875rem;     /* form labels */
  --text-caption: 0.8125rem;       /* hints / meta */
  --text-status-pill: 0.75rem;     /* badges */
}
```

Tailwind v4 يولّد `text-page-title`, `text-section-title`, إلخ تلقائيًا من
هذه المتغيرات. الـ migration تدريجي مع P4 sweeps.

### قاعدة الحوكمة

- لا تضف أي `font-size` inline في component أو page. استخدم
  Tailwind utility فقط.
- عند Phase 2: لا تستخدم `text-xs/sm/base` مباشرة في صفحة جديدة —
  اختر الـ token الدلالي المناسب.
- تغيير حجم/خط عالميًا = تعديل **سطر واحد** في `index.css`. أي PR
  يلمس font-size في أكثر من ذلك المكان يُرفض في review.

---

## P8 — Ghaith UI Standard Kit (Phase 3 جزئي · 2026-05-23)

### الخلاصة

نُشئت 4 حزم workspace كـ **contract packages** (re-export shims) تحت
`lib/`:

| الحزمة | الموقع | الغرض |
| --- | --- | --- |
| `@workspace/ui-core` | `lib/ui-core/` | Page layout, tables, forms, status, filters |
| `@workspace/entity-kit` | `lib/entity-kit/` | DetailPage, EntityTimeline, EntityComments, EntityDocuments, inline edit |
| `@workspace/workflow-kit` | `lib/workflow-kit/` | ApprovalActions, ApprovalTimeline, useLifecycleAction |
| `@workspace/report-kit` | `lib/report-kit/` | Print, export, letterhead |

### الـ invariant في Phase 1

- الحزم **re-export shims** فقط — الكود الفعلي لا يزال في
  `artifacts/ghayth-erp/src/components/...`.
- `src/index.ts` يستخدم deep-relative imports للوصول إليه.
- **لم يُضَف أي dependency** على هذه الحزم في `artifacts/ghayth-erp/package.json`
  (لا consumer نشط حتى Phase 2).
- لا تكسر هذه الحزم أي import قائم. `pnpm typecheck` و`pnpm build` لا
  يتأثران.

### المراحل التالية

| Phase | المخرج |
| --- | --- |
| **Phase 2** ✅ | `artifacts/ghayth-erp/package.json` يضيف الحزم الأربع كـ `workspace:*` deps (مكتمل 2026-05-23). الحزم مرتبطة في `artifacts/ghayth-erp/node_modules/@workspace/`. typecheck + build خضراء. |
| **Phase 3** 🟡 | **أول consumer مكتمل**: `pages/finance/fiscal-periods-v2.tsx` (FIN-014) يستهلك `PageShell`, `DataTable`, column presets, `FormShell`, `AdvancedFilters` كلها من `@workspace/ui-core`. الـ chunk الجديد 8.64 KB. proof end-to-end أن الـ kit يعمل. **الجزء المتبقي**: نقل الملفات فعليًا من `artifacts/ghayth-erp/src/components/...` إلى `lib/<pkg>/src/...` (لم يُنفَّذ بعد — re-export shim لا يزال نشطًا). |
| **Phase 4** | حذف الـ re-exports القديمة من `artifacts/ghayth-erp/src/components/`. كل page تستورد من `@workspace/...` فقط. |
| **Phase 5** | lint rule في `scripts/src/lint-patterns.mjs` يمنع import المُمكِّنات من `@/components/` بدل `@workspace/ui-core`. |

### قاعدة الحوكمة

- كل export جديد يُضاف إلى `lib/<pkg>/src/index.ts` + يُذكر في README الحزمة.
- لا ينتقل ملف فعليًا حتى يكتمل Phase 2 (وجود consumer واحد على الأقل).
- مكوّنات shadcn الخام (`components/ui/button.tsx`, إلخ) تبقى داخل ERP
  app كطبقة أساس (لا تنتقل لحزمة منفصلة).

---

## P7 — `<ListPage>` و `<CreateEditPage>` composites

### `<ListPage>` ✅ Phase 1 منجَز · 2026-05-23

**الموقع**: `artifacts/ghayth-erp/src/components/list-page.tsx` · مُعاد
تصديره من `@workspace/ui-core`.

**أول composite حقيقي في الـ kit** (ليس re-export). يضغط النمط المتكرّر
في 107 صفحة list:

قبل (PageShell + AdvancedFilters + DataTable يدويًا):
```tsx
<PageShell title="..." actions={<Button>...</Button>} loading={isLoading}>
  <div className="grid gap-3 grid-cols-3"><StatTile .../>...</div>
  <AdvancedFilters config={...} values={filters} onChange={setFilters} />
  <DataTable columns={...} data={filtered} isLoading={...} onRetry={...}
             noToolbar rowKey={...} emptyMessage="..." pageSize={20} />
</PageShell>
```

بعد:
```tsx
<ListPage<Row>
  title="..."
  queryKey={["my-data"]}
  endpoint="/api/my-data"
  columns={[textColumn("name"), statusColumn(...)]}
  rowKey={(r) => String(r.id)}
  rowActions={(r) => <RowButtons row={r} />}
  filters={{ config: {...}, searchFields: ["name"], statusField: "status" }}
  primaryAction={{ label: "جديد", onClick: () => setOpen(true) }}
  stats={[{ label: "إجمالي", value: rows.length, tone: "info" }]}
  emptyMessage="لا يوجد"
>
  <CreateDialog ... />
</ListPage>
```

**ما يملكه ListPage**: query عبر `queryKey + endpoint`، حالة الـ filter،
PageShell layout، grid الـ stats، loading/empty/error fallbacks في
DataTable.

**ما يحتفظ به المستهلك**: الأعمدة، الإجراءات لكل صف، الـ dialogs (تُمرَّر
كـ children). الـ cache invalidation عبر `useApiMutation`'s `invalidateKeys`
على نفس الـ queryKey — تلقائي.

**Consumers**:
- `pages/finance/fiscal-periods-v2.tsx` (FIN-014) — list مع dialogs،
  هاجَر من ~470 سطر إلى 441.
- `pages/finance/journal-manual.tsx` — proof أن ListPage يحتمل التعقيد:
  server-side filtering، pill-style filter bar، per-row actions
  بـ permission gates، row click navigation، modal للإجراءات. التوسعتان
  المضافتان للـ composite (`customFilterBar` + `onRowClick`) جاءتا
  استجابةً لاحتياج هذه الصفحة (مبدأ "نمو reactive لا speculative").

### `<CreatePageLayout>` ✅ موجود سلفًا · أُضيف للـ kit 2026-05-23

`CreatePageLayout` (في `components/create-page-layout.tsx`) كان يلفّ
PageShell + يضيف back-button + isDirty guard + unsaved-changes dialog
منذ مدة. أُضيف للـ kit عبر re-export في `@workspace/ui-core` (بدون
إعادة اختراع). الـ ~80 صفحة create لها الآن مسار واحد للاستيراد.

أول consumer مُهاجَر: `pages/create/finance/vendors-create.tsx`
تستهلك `CreatePageLayout` و`CreationDateField` من `@workspace/ui-core`
بدل `@/components/create-page-layout`.

### `<CreateEditPage>` — مخطط (لم يُبنَ بعد)

composite أعلى من CreatePageLayout يجمع: CreatePageLayout +
FormShell + auto-wired `isDirty` (يقرأ من `useFormContext().formState.isDirty`)
+ defaults للـ submitLabel + standard Cancel button. يُبنى عند 3+
صفحات تطلب نفس النمط — لا قبلها (مبدأ: لا abstractions speculative).

### قواعد composites

1. كل composite جديد في `@workspace/ui-core` يحتاج consumer واحد على
   الأقل في نفس الـ PR كإثبات (لا abstractions بلا استخدام).
2. لا تضف props ليست مطلوبة من consumer قائم. النمو reactive لا
   speculative.
3. composites يبنون على re-exports القائمة (PageShell, FormShell,
   DataTable) ولا يعيدون اختراعها.

---

## ما هذا الـ doc **ليس** عنه

- ليس roadmap الأعمال (راجع `docs/REMAINING_ROADMAP.md`).
- ليس FND/Finance hardening (راجع `docs/audit/inventory/foundation.md` +
  `docs/audit/inventory/finance.md`).
- ليس Enterprise-ready criteria (راجع `docs/production-hardening/enterprise-hardening-roadmap.md`
  Track B).

---

## كيف تساهم

1. عند إضافة صفحة UI جديدة → اقرأ §P6.
2. عند إضافة status جديد → أضِف إلى `STATUS_MAP` (P1.6) + CHECK
   constraint (P2.4).
3. عند sweep دومين كامل → أضِف صفًا جديدًا تحت §P4 بـ phase number.
4. عند تجاوز عتبة 0 violation لقاعدة من §P5 → افتح PR يضيف القاعدة
   إلى `scripts/src/lint-patterns.mjs`.
