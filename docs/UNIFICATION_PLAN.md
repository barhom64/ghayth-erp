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

## P5 — Lint guards (مخطط)

لا يجوز إضافة هذه القواعد إلى `scripts/src/lint-patterns.mjs` إلا
بعد أن يصل عدد المخالفات إلى صفر (راجع نمط `raw-403-in-route` المؤجَّل
بنفس الصفحة سطر 26-33).

| القاعدة | الفجوة الحالية | جاهز للإضافة؟ |
| --- | --- | --- |
| `raw-table-in-page` (يمنع `<table>` خارج `lib/ui-kit/`) | 18 صفحة | لا — يحتاج migration sweep أولًا |
| `useState-in-create-edit-page` (يمنع `useState` خام في صفحات create/edit، اعتمد `FormShell` بدلًا) | ≈196 صفحة (251 page معها `useState` - 55 تستخدم `FormShell`) | لا — يحتاج P4 sweep أوسع |
| `bare-page-without-PageShell` (يفرض `<PageShell>` على pages/) | 250 صفحة | لا — يحتاج وصول ≥80% تبنّي |
| `unscoped-status-badge` (يمنع `<Badge>` خام لقيم status) | غير مُقاس | لا |

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

## P8 — Ghaith UI Standard Kit (Phase 1 منجَز · 2026-05-23)

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
| **Phase 2** | `artifacts/ghayth-erp/package.json` يضيف الحزم الأربع كـ `workspace:*` deps. أول صفحة جديدة (مثل FIN-014) تستهلك من `@workspace/ui-core` كإثبات. |
| **Phase 3** | نقل الملفات فعليًا من `artifacts/ghayth-erp/src/components/...` إلى `lib/<pkg>/src/...`. مكان قديم يصبح re-export shim عكسي. صفحات تُهاجَر تدريجيًا. |
| **Phase 4** | حذف الـ re-exports القديمة من `artifacts/ghayth-erp/src/components/`. كل page تستورد من `@workspace/...` فقط. |
| **Phase 5** | lint rule في `scripts/src/lint-patterns.mjs` يمنع import المُمكِّنات من `@/components/` بدل `@workspace/ui-core`. |

### قاعدة الحوكمة

- كل export جديد يُضاف إلى `lib/<pkg>/src/index.ts` + يُذكر في README الحزمة.
- لا ينتقل ملف فعليًا حتى يكتمل Phase 2 (وجود consumer واحد على الأقل).
- مكوّنات shadcn الخام (`components/ui/button.tsx`, إلخ) تبقى داخل ERP
  app كطبقة أساس (لا تنتقل لحزمة منفصلة).

---

## P7 — `<ListPage>` و `<CreateEditPage>` composites (مخطط)

الفجوة المتبقّية في الـ primitives:

### `<ListPage>` — composite غير موجود

اليوم صفحة list نمطية تكتب:
```tsx
<PageShell title="..." actions={<Button>إضافة</Button>}>
  <Filters {...} />
  <DataTable {...} />
  <Pagination {...} />
</PageShell>
```

≈107 صفحة list تكرّر هذا النمط. `<ListPage>` يجمعها في prop واحد:
```tsx
<ListPage
  title="..."
  query={useEmployees}
  columns={employeeColumns}
  createHref="/create/hr/employee"
  filters={<EmployeeFilters />}
/>
```

### `<CreateEditPage>` — composite غير موجود

اليوم صفحة create تكتب:
```tsx
<PageShell title="..." breadcrumbs={...}>
  <FormShell schema={schema} ...>
    <Fields />
  </FormShell>
</PageShell>
```

`<CreateEditPage>` يجمعها + يضيف dirty-guard + cancel handler موحَّد.

**يُنفَّذ في PR منفصل بعد إقرار signatures مع مالك P4 sweep**.

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
