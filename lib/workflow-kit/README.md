# @workspace/workflow-kit

> **Phase 1 (contract package)** — Approvals, lifecycle, SLA, escalation.
>
> راجع `docs/UNIFICATION_PLAN.md` §P8.

## الغرض

كل ما يخص دورة حياة الكيانات: approve / reject / return / refer /
escalate، عرض timeline الاعتماد، تشغيل lifecycle actions بتنسيق
موحَّد مع ApiError handling.

## ما يدخل هذه الحزمة

| الفئة | المُمكِّنات |
| --- | --- |
| Approval UI | `ApprovalActions`, `ActionHistory`, `NotesDisplay` |
| Approval timeline | `ApprovalTimeline` |
| Lifecycle hook | `useLifecycleAction` (P1.5) |

## ما لا يدخل هذه الحزمة (مخطط للنمو)

المُمكِّنات الإضافية التالية ستضاف لاحقًا عند جاهزية كل من
الـ engines المقابلة في الـ backend:

- `SLAIndicator` — يقرأ SLA من `lib/supportSlaEscalation.ts` pattern
- `DelegationBadge` — لعرض من فُوِّض إليه المهمة
- `EscalationView` — مسار التصعيد الكامل
- `ApprovalFlow` — visualisation لـ flow tree

## الحالة الفعلية (Phase 1)

re-export shim من
`artifacts/ghayth-erp/src/components/approval-actions.tsx` +
`shared/approval-timeline.tsx` + `hooks/use-lifecycle-action.tsx`.
الكود الفعلي ينتقل في Phase 2.

## الاستهلاك

```tsx
import {
  ApprovalActions,
  ApprovalTimeline,
  useLifecycleAction,
} from "@workspace/workflow-kit";

export function InvoiceApprovalSection({ invoiceId }: { invoiceId: number }) {
  const action = useLifecycleAction({
    endpoint: `/api/finance/invoices/${invoiceId}/approve`,
    invalidates: ["invoices", invoiceId],
  });

  return (
    <>
      <ApprovalActions
        entityType="invoice"
        entityId={invoiceId}
        onApprove={() => action.run({ method: "POST" })}
      />
      <ApprovalTimeline entityType="invoice" entityId={invoiceId} />
    </>
  );
}
```
