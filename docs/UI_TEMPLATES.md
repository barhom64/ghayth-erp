# UI page templates — canonical catalogue

**Status:** This document describes the templates that already exist in
`artifacts/ghayth-erp/src/components/`. It is not a proposal for new
components. The goal is unification — every new or refactored page should
reach for one of these templates instead of re-assembling the same parts
in a slightly different way.

Before this catalogue, templates existed but discovery was informal:
`PageShell` was used by **18%** of pages; the other 82% rolled their own
header / breadcrumbs / error boundary / toolbar. Same story for forms
(`FormShell` existed but most create pages used `useState` + manual
validation) and for the error-toast path (`useApiMutation` shipped with
typed-error bridging, but only 76 call sites out of hundreds used it).

This document names each canonical template, the file it lives in, the
intended use, and a currently-working reference page so reviewers have a
concrete "look like this" target.

---

## 1. Layout shell (app frame)

| Aspect | Value |
| ------ | ----- |
| Component | `SidebarLayout` |
| File | `src/components/layout/sidebar-layout.tsx` |
| Scope | Mounted once at the router level (`App.tsx`). Every route renders inside it. |
| Concerns | Sidebar nav · header · notifications · profile · command palette · theme toggle · RTL |

Pages **never** render their own sidebar or top-chrome. The sidebar is a
given.

---

## 2. Page template — `PageShell`

| Aspect | Value |
| ------ | ----- |
| Component | `PageShell` |
| File | `src/components/page-shell.tsx` |
| Wraps | `PageErrorBoundary` around the body so one page cannot crash the shell |
| Current adoption | ~18% of pages |

### Slots (props)

| Prop | Type | Purpose |
| ---- | ---- | ------- |
| `title` | `string` | Page `<h1>` — always required |
| `subtitle` | `string?` | Muted subtitle under the title |
| `breadcrumbs` | `Breadcrumb[]?` | Home is prepended automatically |
| `actions` | `ReactNode?` | Right-side buttons (create, export, filters toggle) |
| `filters` | `ReactNode?` | Sticky filter toolbar row below the header |
| `loading` | `boolean?` | Top progress bar, body stays interactive |
| `resetKey` | `string \| number?` | Forwarded to the error boundary |
| `contentClassName` | `string?` | Escape hatch for unusual spacing |
| `children` | `ReactNode` | Page body |

### `PageSection` helper

A card-wrapped labelled section for detail pages that split content into
titled blocks. Use for "البيانات الشخصية", "الأصول المرتبطة", etc.

### Reference usage

```tsx
<PageShell
  title="لوحة المالية"
  subtitle="نظرة عامة على الوضع المالي للشركة"
  breadcrumbs={[{ href: "/finance", label: "المالية" }]}
  actions={
    <Button asChild>
      <Link href="/create/finance/journal-manual">قيد يدوي جديد</Link>
    </Button>
  }
  loading={query.isLoading}
>
  {/* body */}
</PageShell>
```

---

## 3. The six page patterns

Each pattern reuses the same primitives in a predictable way. Pick the
pattern that matches the task, then pick the right components from the
"Uses" column.

### Pattern 1 — **List** (قائمة سجلات)

| Aspect | Value |
| ------ | ----- |
| When to use | Any page that lists rows a user can open, create, filter, or delete |
| Uses | `PageShell` · `DataTable` · `AdvancedFilters` (optional) · `PageStatusBadge` · `useApiQuery` · `ConfirmDeleteDialog` |
| Reference page | `src/pages/employees.tsx` (363 lines) |

**Skeleton:**

```tsx
<PageShell
  title="الموظفون"
  subtitle="إدارة بيانات الموظفين وتعييناتهم"
  actions={
    canWrite && (
      <Button asChild>
        <Link href="/employees/create">موظف جديد</Link>
      </Button>
    )
  }
  filters={<EmployeeFilters value={filters} onChange={setFilters} />}
>
  <DataTable
    data={rows}
    columns={columns}
    isLoading={query.isLoading}
    isError={query.isError}
    error={query.error}
    onRetry={query.refetch}
    emptyMessage="لا يوجد موظفون"
    emptyAction={{
      label: "إضافة موظف جديد",
      onClick: () => setLocation("/employees/create"),
    }}
  />
</PageShell>
```

**Status column:** always render via `<PageStatusBadge status={row.status} domain="hr" />`.
Never build ad-hoc status chips.

**Delete affordance:** open `ConfirmDeleteDialog` (see §6) — never a
per-page inline delete flow.

---

### Pattern 2 — **Create / Request** (طلب · إنشاء)

| Aspect | Value |
| ------ | ----- |
| When to use | Any form that creates a new entity, submits a request, or opens a workflow |
| Uses | `CreatePageLayout` · `FormShell` · `FormTextField` / `FormSelectField` / `FormTextareaField` / `FormGrid` · `zod` · `useApiMutation` |
| Reference pattern | `src/components/form-shell.tsx` (docstring) |

**Skeleton:**

```tsx
const employeeSchema = z.object({
  name: z.string().min(1, "الاسم مطلوب"),
  email: z.string().email("بريد غير صالح"),
  branchId: z.coerce.number().int().positive(),
});

<CreatePageLayout
  title="إضافة موظف جديد"
  backPath="/employees"
  breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
  isDirty={form.formState.isDirty}
>
  <FormShell
    schema={employeeSchema}
    defaultValues={{ name: "", email: "", branchId: 0 }}
    submitLabel="حفظ الموظف"
    onSubmit={async (values, { setFieldError }) => {
      try {
        await createEmployee.mutateAsync(values);
        toast({ title: "تم إنشاء الموظف بنجاح" });
        setLocation("/employees");
      } catch (err) {
        // FormShell auto-routes ApiError VALIDATION_ERROR with `field`
        // back into the form. Custom handling only needed for other codes.
      }
    }}
  >
    <FormGrid cols={2}>
      <FormTextField name="name" label="الاسم الكامل" required />
      <FormEmailField name="email" label="البريد الإلكتروني" required />
      <FormSelectField name="branchId" label="الفرع" options={branchOptions} required />
    </FormGrid>
  </FormShell>
</CreatePageLayout>
```

**The old way** (still present in many pages): plain `useState` for every
field + manual `handleSubmit` + manual `setFieldErrors`. Newly refactored
pages replace this with the block above.

---

### Pattern 3 — **Detail / View** (الاطلاع · التفاصيل)

| Aspect | Value |
| ------ | ----- |
| When to use | Read-only detail page for a single entity, usually with tabs |
| Uses | `EntityDetailPage` · `PageStatusBadge` · `EntityTimeline` (as a tab) · `PageSection` · `useApiQuery` |
| Reference page | `src/pages/fleet/trip-detail.tsx` |

**Skeleton:**

```tsx
<EntityDetailPage
  title={trip.ref}
  subtitle={`${trip.fromLocation} → ${trip.toLocation}`}
  status={{ label: trip.status, variant: statusVariant(trip.status) }}
  avatar={{ icon: Truck, gradientFrom: "from-sky-500", gradientTo: "to-indigo-600" }}
  metaItems={[
    { icon: Calendar, label: formatDateAr(trip.scheduledDate) },
    { icon: User, label: trip.driverName },
  ]}
  kpis={[
    { label: "المسافة", value: `${trip.distanceKm} كم`, icon: Route },
    { label: "التكلفة", value: formatCurrency(trip.totalCost), icon: Wallet },
  ]}
  actions={[
    { label: "تعديل", icon: Edit, onClick: () => setLocation(`/fleet/trips/${trip.id}/edit`) },
    { label: "إلغاء الرحلة", icon: XCircle, variant: "destructive", onClick: openCancelFlow },
  ]}
  tabs={[
    { key: "overview",   label: "نظرة عامة", icon: FileText,     content: () => <TripOverview trip={trip} /> },
    { key: "fuel",       label: "الوقود",    icon: Fuel,         content: () => <FuelLogs tripId={trip.id} /> },
    { key: "timeline",   label: "السجل",     icon: Clock,        content: () => <EntityTimeline entityType="fleet_trip" entityId={trip.id} /> },
  ]}
  isLoading={query.isLoading}
  isError={query.isError}
  onRetry={query.refetch}
/>
```

**Status chip:** `EntityDetailPage` currently supports an inline
`StatusBadge` fallback *and* an explicit variant. New callers should
always pass the variant so `PageStatusBadge` can be substituted in the
next pass (R.1.3 removes the legacy `StatusBadge` import from this file).

---

### Pattern 4 — **Edit** (تعديل)

| Aspect | Value |
| ------ | ----- |
| When to use | Pre-filled form that mutates an existing entity |
| Uses | Same stack as Pattern 2 (Create), with `defaultValues` seeded from the query |
| Reference | Same as Pattern 2 |

An Edit page is a Create page with:

1. `defaultValues` from `useApiQuery` (passed through a `useEffect` with
   `form.reset(data)` once the query resolves — `FormShell` accepts the
   initial defaults on first mount).
2. `submitLabel="حفظ التغييرات"`.
3. `mutate` hits `PATCH /api/<entity>/:id` instead of `POST /api/<entity>`.

No new component. Same `FormShell` + `CreatePageLayout` wrappers.

---

### Pattern 5 — **Approval / Action** (اعتماد · إجراء)

| Aspect | Value |
| ------ | ----- |
| When to use | A detail page that exposes state-machine transitions (approve, reject, post, cancel, release) |
| Uses | `EntityDetailPage` + action buttons + `ConfirmDeleteDialog` (for destructive) + `useApiMutation` + `EntityTimeline` for the history tab |

Pattern 5 = Pattern 3 (Detail) + a dedicated **"actions"** array that
drives `applyTransition()`-backed endpoints on the server. The lifecycle
engine (see `artifacts/api-server/src/lib/lifecycleEngine.ts`) has been
hardened so every transition:

* Reads a fresh row under `FOR UPDATE` inside a transaction
* Validates `fromStates` and throws `LifecycleError` with `field: "status"`
  when the current state doesn't allow the requested transition
* Writes an `event_logs` row inside the same transaction
* Emits on the event bus + creates an audit log row after commit

On the page side, each transition button is:

```tsx
const approveMutation = useApiMutation<{ approvalStatus: string }>(
  `/finance/journal-manual/${je.id}/approve`,
  "PATCH",
  [["finance", "journal-manual", String(je.id)]],
  {
    successMessage: "تم اعتماد القيد",
    onCodeError: (code, err) => {
      if (code === "CONFLICT") {
        // Engine said fromStates mismatch — the toast title is already
        // "لا يمكن تنفيذ هذه العملية الآن" via useApiMutation.
        // Keep the default. Return nothing.
      }
      if (code === "FORBIDDEN") {
        // Reviewer isn't allowed. Default toast still fires.
      }
    },
  },
);
```

The important UX guarantee: **a transition click never leaks a raw
`Error`**. Either the server accepts and the success toast fires, or
`useApiMutation` turns the `ApiError` into a titled toast (and optionally
an inline field error when the engine returns `field: "status"`).

History: mount `<EntityTimeline entityType="journal_entries" entityId={je.id} />`
as a tab. The component already reads from `/audit-logs/:entity/:id` and
`/entity-meta/comments/:entity/:id`, so every `applyTransition()` audit
row shows up automatically.

---

### Pattern 6 — **History / Events** (سجل · أحداث · تاريخ)

| Aspect | Value |
| ------ | ----- |
| When to use | Either as a tab inside a detail page, or as a standalone page ("سجل أحداث الشركة") |
| Uses | `EntityTimeline` (single entity) · `ProcessStages` (workflow-centric) · `WorkflowTimeline` (workflow instances) · `CollectionStages` (invoice collection phases) |
| File | `src/components/shared/entity-timeline.tsx` |

The timeline component already:

* Fetches `/audit-logs/:entity/:id` and merges with
  `/entity-meta/comments/:entity/:id`
* Maps ~30 known action strings to an Arabic label + icon + tone
  (`create`, `update`, `approve`, `reject`, `status_change`, `leave.*`,
  `invoice.*`, `payroll.*`, …)
* Shows "منذ X دقيقة/ساعة/يوم" time-ago for each row
* Defaults to 20 items, truncates with `maxItems` prop

For pages that want the full lifecycle picture (e.g. a manual journal
going draft → pending_review → approved → posted) prefer
`WorkflowTimeline` — it also renders the stage dots via `ProcessStages`.

---

## 4. Status chip — `PageStatusBadge`

| Aspect | Value |
| ------ | ----- |
| Component | `PageStatusBadge` |
| File | `src/components/page-status-badge.tsx` |
| Purpose | The single source of truth for status → arabic label + tone mapping |

Every status chip everywhere should be:

```tsx
<PageStatusBadge status={row.status} domain="invoice" />
```

The `domain` prop disambiguates overloaded statuses (e.g. `draft` in
`invoice` vs `journal` vs `purchase`). Omit it and the resolver falls
back to `shared`, then any other domain.

**Deprecated:** `components/ui/status-badge.tsx` (legacy). R.1.3 in this
iteration deletes it and routes all imports through `PageStatusBadge`.
The lint-patterns guard grows a rule that flags `from ".*ui/status-badge"`
to prevent regressions.

---

## 5. Form primitives — `FormShell` family

| Aspect | Value |
| ------ | ----- |
| File | `src/components/form-shell.tsx` |
| Primitives | `FormShell` · `FormTextField` · `FormEmailField` · `FormPhoneField` · `FormNumberField` · `FormDateField` · `FormTextareaField` · `FormSelectField` · `FormGrid` · `FormActions` |

`FormShell` wraps `useForm` + `zodResolver` + `handleSubmit`, renders a
submit bar with a loading spinner, and **auto-forwards `ApiError`
validation errors onto the matching `form.setError(field, ...)`**. That
last part is the reason Pattern 2's `onSubmit` doesn't need a manual
`try/catch` for `VALIDATION_ERROR` — it's handled.

Use the thin wrappers (`FormTextField`, `FormSelectField`, etc.) instead
of raw `<Input>` so every field in the system has the same label layout,
the same required-star treatment, and the same error message row.

---

## 6. Destructive actions — `ConfirmDeleteDialog`

| Aspect | Value |
| ------ | ----- |
| Component | **New in R.1.4** — `components/shared/confirm-delete-dialog.tsx` |
| Wraps | `AlertDialog` (radix) · `apiFetch("/impact-preview")` · `useApiMutation` |

Legacy inline card: `src/components/delete-confirm-impact.tsx` (still
present, used by a handful of pages). R.1.4 introduces a true modal
dialog that:

1. Opens in response to a delete click.
2. Fetches `/impact-preview` to list affected rows (keeps the existing
   backend contract — no new endpoint).
3. On confirm, calls the delete endpoint via `useApiMutation`.
4. If the delete returns `409 CONFLICT` with `meta.blockers` (the Phase
   C.7b delete guards — vendors with open POs, accounts with GL lines,
   budgets with used amount, etc.), the dialog surfaces the blockers
   list as a red card so the user knows exactly what to close first.
5. Closes with a success toast on 2xx.

Usage:

```tsx
<ConfirmDeleteDialog
  open={deleting !== null}
  onOpenChange={(v) => !v && setDeleting(null)}
  entity={{ type: "supplier", id: deleting?.id ?? 0, name: deleting?.name ?? "" }}
  deletePath={`/finance/vendors/${deleting?.id}`}
  invalidateKeys={[["finance", "vendors"]]}
/>
```

---

## 7. Error toasts — `useApiMutation`

| Aspect | Value |
| ------ | ----- |
| Hook | `useApiMutation` |
| File | `src/lib/api.ts` |
| Current adoption | 76 call sites (finance module: 5 of 40 pages) |

**Already implemented.** Reads `{code, field, fix, meta}` from `ApiError`.
Picks toast titles by error code (`VALIDATION_ERROR` → "البيانات غير
صالحة", `CONFLICT` → "لا يمكن تنفيذ هذه العملية الآن", `FORBIDDEN` →
"غير مصرح بهذه العملية", `NOT_FOUND` → "السجل غير موجود",
`INTEGRATION_ERROR` → "خدمة خارجية متعطّلة"). Supports:

| Option | Effect |
| ------ | ------ |
| `silent: true` | Suppress the default error toast (caller shows inline) |
| `successMessage: string \| false` | Override / disable success toast |
| `onFieldError(field, msg, fix)` | Route `VALIDATION_ERROR`/`CONFLICT` with `field` to a specific input |
| `onCodeError(code, err, body)` | Intercept an error code; return `true` to suppress the default toast |
| `onSuccess(data, body)` | Side-effect on success (navigate, invalidate, etc.) |
| `onError(err, body)` | Always fires after the structured handlers, even when `silent` |

**The rule:** any mutation that hits a finance endpoint (or any endpoint
covered by Phase C's typed-error contract) **must** go through
`useApiMutation`. Never `try/catch` + manual toast. The hook is the
single choke point that turns `{code, field, fix, meta}` into UX.

R.1.2 in this iteration adds one enhancement: when `CONFLICT` carries
`meta.blockers: string[]`, the default toast `description` concatenates
them so the user sees the first blocker without having to open a dialog.

---

## 8. What NOT to do

* ❌ **Do not** render a page title as a raw `<h1>`. Use `PageShell title=...`.
* ❌ **Do not** render a sidebar or top header in a page. That's
  `SidebarLayout`'s job.
* ❌ **Do not** roll a status chip with inline tailwind classes. Use
  `PageStatusBadge`.
* ❌ **Do not** import `StatusBadge` from `components/ui/status-badge`.
  That file is being removed in R.1.3.
* ❌ **Do not** `try { await mutate(...) } catch(err) { toast(...) }`.
  Use `useApiMutation` with `onFieldError` / `onCodeError` / `silent`.
* ❌ **Do not** copy-paste a new delete-confirm block into a new page.
  Use `ConfirmDeleteDialog`.
* ❌ **Do not** build a new timeline. `EntityTimeline` + `ProcessStages`
  + `WorkflowTimeline` already cover the three real cases.

---

## 9. Migration guardrails (Phase 6 lint)

`scripts/src/lint-patterns.mjs` enforces the API-side rules from Phase 5
(no local `requireRole`, no `validationError(res, ...)` calls or
imports). R.1.3 extends it with a frontend rule:

| Rule ID | Effect |
| ------- | ------ |
| `legacy-status-badge-import` | Fails the build if any file under `src/` imports `from "@/components/ui/status-badge"` |

More frontend rules may be added in later iterations (e.g. forbid raw
`fetch(/api/...)` outside `lib/api.ts`, forbid `<h1>` outside `PageShell`
subcomponents), but **not in R.1**. The goal of this iteration is a
*reference application*, not a sweep.

---

## 10. Adoption plan (outside R.1)

R.1 iteration 1 uses these templates on **one new page**:
`src/pages/finance/dashboard.tsx`. That's intentional — the rest of the
82% doesn't get refactored in this iteration. It gets cascaded in later
R.x iterations, one module at a time, using this document as the
target state.
