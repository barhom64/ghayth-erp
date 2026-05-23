# @workspace/entity-kit

> **Phase 1 (contract package)** — Entity-level composables.
>
> راجع `docs/UNIFICATION_PLAN.md` §P8 للسياق.

## الغرض

كل ما يحيط بكيان واحد (entity) في صفحة التفاصيل: الـ header، الـ tabs،
الـ timeline، الـ comments، الـ documents، إلخ. هذه ليست مُمكِّنات صفحة
عامة (تلك في `@workspace/ui-core`) — هي مكوّنات تفترض وجود
`entityType` + `entityId` وتقرأ/تكتب البيانات المرتبطة بهما.

## ما يدخل هذه الحزمة

| الفئة | المُمكِّنات |
| --- | --- |
| Detail page | `DetailPageLayout`, `EntityDetailPage` |
| Timeline | `EntityTimeline`, `ProcessStages`, `CollectionStages`, `WorkflowTimeline`, `SlaStatusBadge` |
| Comments | `EntityComments` |
| Documents | `EntityDocuments` |
| Inline edit | `useDetailEditDelete`, `DetailActionButtons`, `InlineEditCard` |

## ما لا يدخل هذه الحزمة

- مكوّنات صفحة عامة: في `@workspace/ui-core`.
- منطق approvals: في `@workspace/workflow-kit`.
- منطق print: في `@workspace/report-kit`.

## الحالة الفعلية (Phase 1)

re-export shim من `artifacts/ghayth-erp/src/components/shared/...`.
الكود الفعلي ينتقل في Phase 2.

## الاستهلاك

```tsx
import {
  EntityDetailPage,
  EntityTimeline,
  EntityComments,
  EntityDocuments,
} from "@workspace/entity-kit";

export function EmployeeDetailPage({ id }: { id: number }) {
  return (
    <EntityDetailPage
      entityType="employee"
      entityId={id}
      // ...
    />
  );
}
```
