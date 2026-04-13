# خطة توحيد النظام — بدون كسر

> مرجع: هذه الوثيقة المصدر الوحيد للحقيقة لخارطة إعادة التوحيد.
> كل PR يتعلق بالخطة يجب أن يشير إلى رقم المرحلة (P0.3، P1.1، …).
>
> **المبدأ الأساسي**: كل مرحلة تُشحَن مستقلة، تمرّ بالـ CI، والقديم يعمل جنب الجديد حتى التبنّي الكامل.
> لا نحذف شيئاً قبل أن يُستبدل بديله بالكامل.

---

## 🔴 الوضع الراهن (baseline)

| مقياس | الحالي | الهدف |
|---|---|---|
| صفحات تستخدم `sidebar-layout` | 17.7% (57 / 321) | 100% |
| Routes تستخدم `applyTransition` | 5.4% (4 / 74) | 100% |
| استخدامات `fetch()` خام في pages | 121 | 0 |
| استخدامات `<table>` خام في pages | 60 | 0 |
| `catch { console.error }` فقط | 323 | 0 |
| جداول مُعرَّفة في `src/migrations/` | 57 | 263 |
| جداول مُستخدمة في الكود | 263 | — |
| مسارات migrations منفصلة | 3 | 1 |
| Drizzle schema coverage | 24 جدول | 263 جدول |
| Golden path tests | 0 | domain لكل domain |

---

## 📐 المرحلة 0 — Safety Net (تثبيت الأساس)

**الهدف**: بنية تحمي كل ما يأتي بعدها. صفر كسر.

| # | الإجراء | اختبار الاستلام |
|---|---|---|
| P0.1 | Tag `baseline/unification-start` على main | `git tag -l` يعرض الـ tag |
| P0.2 | إطار golden-path tests (Vitest + supertest + DB setup) | `pnpm test` يكتشف الإخفاقات الحقيقية لكل domain |
| P0.3 | Typed errors: `ValidationError` / `NotFoundError` / `ConflictError` / `ForbiddenError` / `IntegrationError` | أخطاء معلومة، لا "حدث خطأ" عامة |
| P0.4 | `/health/schema` endpoint يتحقق أن كل جدول يشير إليه الكود موجود في DB | أول رؤية حقيقية لفجوة الـ schema |
| P0.5 | `<ErrorBoundary>` موحّد في الـ frontend مع fallback عربي RTL | صفحات لا تتوقّف صامتة |

### طريقة العمل
كل نقطة في commit منفصل. كل commit يمرّ typecheck + lint + tests قبل الدفع.

---

## 🧱 المرحلة 1 — بناء الـ Primitives الموحَّدة

الـ primitives تُبنى **بجانب** القديم. لا تفرض استخدامها على أي صفحة موجودة. كل صفحة جديدة أو مُعاد بناؤها تستخدم الجديد.

### P1.1 — `<PageShell>`
قالب الصفحة الموحّد: `sidebar-layout` + `<Breadcrumbs>` + `<PageTitle>` + `<PageActions>` + `<PageFilters>` + `<PageBody>` + `<ErrorBoundary>`.

```tsx
<PageShell
  title="الموظفون"
  breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
  actions={<Button>موظف جديد</Button>}
  filters={<EmployeeFilters />}
>
  <DataTable data={rows} columns={columns} />
</PageShell>
```

### P1.2 — `<FormShell>` + `<FormField>`
لف `react-hook-form` + `zod` + validation موحّدة + رسائل خطأ عربية + زر submit ذكي.

### P1.3 — `useApiMutation` hook
```ts
const createLeave = useApiMutation("/hr/leave-requests", {
  onSuccess: { toast: "تم تقديم الإجازة", invalidate: ["leaves"] },
  onError: "auto",   // typed error → arabic message
});
```

### P1.4 — `DataTable` improvements
الحالي يستخدمه 107 صفحة. نضيف:
- column presets (currency, date, status-badge, actions)
- empty state + loading skeleton موحّدان
- RTL default + export Excel/PDF

### P1.5 — `useLifecycleAction` hook
```ts
const { approve, reject, cancel } = useLifecycleAction("hr_leave_requests", leaveId);
```
يستدعي `applyTransition` على الـ backend، يعرض toast، يُحدِّث الـ cache.

### P1.6 — `PageStatusBadge` + لوحة حالات مركزية
محل واحد يترجم كل status إلى لون + نص عربي. كل الصفحات تستورد من هنا.

**صفر كسر**: أي صفحة قديمة تظل كما هي. تشكيل اختياري.

---

## 🔒 المرحلة 2 — Schema = مصدر وحيد للحقيقة

### P2.1 — تدقيق واقعي
سكربت `scripts/auditSchema.ts` يمرّ على كل SQL query في الكود ويتحقق من وجود الجدول والأعمدة في DB. نتيجته تذهب إلى `/health/schema`.

### P2.2 — توحيد المسار
- الإبقاء على `src/migrations/` فقط
- نقل المحتوى المُستخدم من `artifacts/api-server/migrations/` بأسماء جديدة (080+)
- إضافة `artifacts/api-server/migrations/DEAD.md` يمنع الإضافة

### P2.3 — Drizzle schema شامل
توسيع `lib/db/src/schema/index.ts` من 24 إلى 263 جدول تدريجياً. PR واحد لكل domain، يُولِّد types للـ TypeScript.

### P2.4 — CHECK constraints على الـ status columns
كل entity له lifecycle يكتسب CHECK constraint مطابق للـ state machine المعرَّف في `lib/lifecycleEngine.ts`.

**صفر كسر**: كل إضافات. لا حذف حتى P5.

---

## 🎯 المرحلة 3 — Pilot: HR Leave

اختيار هذا الـ sub-domain لأنه:
- lifecycle واضح (submit → approve / reject → complete)
- متوسط الحجم (~8 صفحات، 12 route)
- أُصلح جزئياً في جلسات سابقة

### P3.1 — Golden path test
```ts
test("HR leave happy path", async () => {
  const leave = await createLeave({ days: 3 });
  await approveLeave(leave.id);
  // advance cron clock
  expect(await getLeave(leave.id)).toMatchObject({ status: "completed" });
});
```
**يجب أن يمرّ قبل أي refactor**.

### P3.2 — Route refactor
- `/hr/leave-requests/:id/approve` → `applyTransition`
- `/hr/leave-requests/:id/reject` → مثله
- `/hr/leave-requests/:id/cancel` → مثله
- `emitEvent` + `createAuditLog` تُحذف (لأن `applyTransition` تفعلها)
- الـ errors تصبح typed

### P3.3 — Page refactor
- `pages/hr/leaves.tsx` → `<PageShell>` + `<DataTable>` + `useApiQuery`
- `pages/create/hr/leave-create.tsx` → `<FormShell>` + `useApiMutation`
- `pages/hr/leave-detail.tsx` → `<PageShell>` + `useLifecycleAction`

### P3.4 — قياس الوفر
| قبل | بعد | وفر |
|---|---|---|
| x سطر في route | y سطر في route | z سطر |
| 3 listeners | 0 (lifecycle engine) | 3 |
| custom error handling | typed | — |

هذا الرقم = المتوقَّع من كل domain في المرحلة 4.

---

## 🔄 المرحلة 4 — Domain Sweep

ترتيب مقترح حسب التعقيد التصاعدي (تعلُّم ثم تطبيق على الأضخم أخيراً):

| # | Domain | سبب الترتيب |
|---|---|---|
| 4.1 | Support | الأصغر — إثبات الـ pattern |
| 4.2 | HR (كامل) | توسع من 3.x |
| 4.3 | CRM | start/end states واضحة |
| 4.4 | Fleet | lifecycle متعدد (trip + maintenance + violation) |
| 4.5 | Property | lease + rent + deposit |
| 4.6 | Projects | WIP + milestones |
| 4.7 | Legal | case lifecycle متعدد المراحل |
| 4.8 | Finance | GL + phases + budgets — الأضخم |
| 4.9 | Warehouse | integration-heavy — أخيراً |

**قاعدة**: domain واحد في كل PR.

---

## 🧹 المرحلة 5 — الحذف

**لا تبدأ إلا بعد تبنّي 100%** في المرحلة 4. قبل ذلك، الحذف محظور.

- P5.1 حذف `<table>` الخام
- P5.2 حذف `fetch()` الخام
- P5.3 حذف `UPDATE ... SET status` المباشر
- P5.4 دمج الجداول المُكرَّرة (rent_payments vs contract_payment_schedule، …)
- P5.5 حذف `artifacts/api-server/migrations/`

### P5.6 — Lint rules تمنع الرجوع
```js
// scripts/lintPatterns.mjs
forbid("<table", "Use <DataTable> instead");
forbid('fetch("/api', "Use useApiQuery or useApiMutation");
forbid('UPDATE [a-z_]+ SET status', "Use applyTransition");
forbid('catch\\s*{\\s*console\\.error', "Use typed errors");
```
CI يرفض أي PR يرجع للنمط القديم.

---

## 📊 المرحلة 6 — الحوكمة المستمرة

لوحة في `/admin/system-health`:

| مقياس | هدف | قياس |
|---|---|---|
| Pages using PageShell | 100% | عدّ imports |
| Routes using applyTransition | 100% | عدّ imports |
| Raw fetch usage | 0 | grep |
| Raw `<table>` usage | 0 | grep |
| `catch { console.error }` | 0 | grep |
| Schema coverage | 100% | `/health/schema` |
| Golden paths per domain | ≥1 | عدّ اختبارات |

كل PR يحدّث الأرقام. الفرق بين "يعمل" و"موحَّد" مرئي.

---

## 🛡️ الضمانات ضد الكسر

1. **Golden path test قبل أي refactor** — لو فشل، توقّف
2. **Parallel implementations** — جديد وقديم جنب بعض حتى التبنّي الكامل
3. **Additive-only DB** — لا DROP COLUMN / DROP TABLE حتى تأكيد عدم الاستخدام
4. **كل PR يمرّ**: typecheck + lint + tests + golden path
5. **Feature flags** حين الحاجة — تفعيل lifecycle engine لـ entity بدون أثر على غيره
6. **Rollback نظيف**: كل PR قابل للـ `git revert` بلا تداعيات

---

## 🗓️ وتيرة العمل

| المرحلة | أحجام PRs | كسر؟ |
|---|---|---|
| 0 | 5 PRs صغيرة | لا — إضافة بحتة |
| 1 | 6 PRs (primitive لكل) | لا |
| 2 | ≥10 PRs (domain-by-domain) | لا — additive |
| 3 | 4-6 PRs، محمية بـ golden path | مراقَب |
| 4 | 10-20 PR لكل domain، بالتتابع | مراقَب |
| 5 | PR لكل نمط، بعد تبنّي 100% | صفر |
| 6 | متواصلة | لا |

---

## 📎 ملحق — المسار إلى domain مكتمل

لكل domain في المرحلة 4:

1. **قبل البدء** — `bootstrap` commit: إضافة golden path test يُثبت السلوك الحالي
2. **Schema** — CHECK constraints + Drizzle types
3. **Route** — `applyTransition` لكل state transition + typed errors
4. **Listeners** — تبسيط إلى `logEvent + logAudit` معياري (cleanup post-lifecycle-engine)
5. **Pages** — PageShell + FormShell + DataTable + useApiQuery + useApiMutation
6. **Cleanup** — حذف الـ legacy لذلك domain فقط (غير مسموح قبل تبنّي كل صفحاته)
7. **Sign-off** — تحديث جدول القياسات في هذه الوثيقة

---

## جهات الاتصال والسياق

- المصدر الوحيد للخطة: هذا الملف
- Baseline: `git tag baseline/unification-start` (المرحلة 0)
- كل PR: في وصفه، الإشارة لرقم المرحلة والنقطة (مثل `P3.2 HR leave refactor`)
- التقدّم المستمر: لوحة `/admin/system-health`

*Generated: 2026-04-13 — start of unification effort.*
