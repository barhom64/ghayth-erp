# @workspace/ui-core

> **Phase 1 (contract package)** — Ghaith UI Standard Kit, طبقة الأساس.
>
> راجع `docs/UNIFICATION_PLAN.md` §P8 للسياق الكامل.

## الغرض

الحزمة المرجعية الواحدة لـ **مُمكِّنات الصفحة العامة** (page-level
primitives) عبر كل تطبيقات Ghaith. كل صفحة UI جديدة تستهلك من هنا — لا
تستورد من `@/components/...` مباشرة.

## ما يدخل هذه الحزمة

| الفئة | المُمكِّنات |
| --- | --- |
| Page layout | `PageShell`, `PageSection`, `PageHeader`, `PageErrorBoundary` |
| Tables | `DataTable`, `DataTableWrapper`, `PaginationBar`, column presets (`textColumn`, `currencyColumn`, `dateColumn`, `statusColumn`, `linkColumn`, `actionsColumn`, `booleanColumn`, `numberColumn`) |
| Forms | `FormShell`, `FormTextField`, `FormEmailField`, `FormPhoneField`, `FormNumberField`, `FormDateField`, `FormTextareaField`, `FormSelectField`, `FormGrid` |
| Status | `PageStatusBadge`, `STATUS_MAP`, `resolveStatus`, `StatusTone`, `StatusDomain` |
| Filters | `AdvancedFilters`, `useFilters`, `useAdvancedFilters`, `applyFilters`, `exportToCSV` |

## ما لا يدخل هذه الحزمة

- مكوّنات مرتبطة بكيان (Entity-level): `EntityDetailPage`,
  `EntityTimeline`, إلخ — هذه في `@workspace/entity-kit`.
- منطق الـ workflow/approvals: في `@workspace/workflow-kit`.
- منطق الـ print/PDF: في `@workspace/report-kit`.
- مكوّنات shadcn الخام (`Button`, `Dialog`, `Sheet`, إلخ): تبقى في
  `artifacts/ghayth-erp/src/components/ui/` كطبقة أساس مشتركة.

## الحالة الفعلية (Phase 1)

هذه الحزمة الآن **re-export shim**. الكود الفعلي للمُمكِّنات لا يزال
في `artifacts/ghayth-erp/src/components/...`. تستخدم هذه الحزمة
deep-relative imports للوصول إليه.

**يعني**: عند استيراد `import { PageShell } from "@workspace/ui-core"`
في consumer جديد، Vite يحلّ المسار → `lib/ui-core/src/index.ts`
→ يعيد التصدير من `artifacts/ghayth-erp/src/components/page-shell.tsx`.
لا يوجد كود مكرّر.

## الـ Phases التالية

| Phase | المخرج |
| --- | --- |
| **Phase 2** | نقل الملفات فعليًا إلى `lib/ui-core/src/`؛ `artifacts/ghayth-erp/src/components/` تتحول إلى re-export shim بدورها أثناء الترحيل. |
| **Phase 3** | حذف الـ re-exports من `artifacts/ghayth-erp/src/components/`؛ كل صفحة تستورد من `@workspace/ui-core`. |
| **Phase 4** | إضافة lint rule في `scripts/src/lint-patterns.mjs` يمنع استيراد المُمكِّنات من `@/components/` بدل `@workspace/ui-core`. |

## كيفية الاستهلاك

```tsx
import {
  PageShell,
  DataTable,
  textColumn,
  currencyColumn,
  statusColumn,
  PageStatusBadge,
} from "@workspace/ui-core";

export function EmployeesPage() {
  return (
    <PageShell title="الموظفون" breadcrumbs={[...]}>
      <DataTable
        data={rows}
        columns={[
          textColumn("name", "الاسم"),
          currencyColumn("salary", "الراتب"),
          statusColumn("status", "الحالة", "employee"),
        ]}
      />
    </PageShell>
  );
}
```

## قواعد المساهمة

1. كل export جديد يضاف إلى `src/index.ts` + يُذكر في README.
2. لا تنقل الملفات حتى يكتمل migration الـ consumers (Phase 3).
3. لا تضف هنا مكوّنًا له بُعد كيان (entity-level) — اذهب لـ `entity-kit`.
4. كل breaking change في prop signature يحتاج major version bump +
   migration note في `docs/UNIFICATION_PLAN.md`.
