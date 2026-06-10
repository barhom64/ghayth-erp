// active-context-gate.tsx
//
// Wave 0.1 — السياق النشط للمدخِل. كل إدخال مالي يجب أن يُربط بسياق نشط واحد
// (شركة + فرع) لمستخدم الإدخال: يحدّد مكان السجل وصلاحيته. إن كان للمدخِل أكثر
// من تعيين/فرع نشط (أو لا فرع) تظهر ملاحظة مختصرة لاختيار فرع واحد قبل الإدخال.
//
// هذا يخص المدخِل لا الموضوع: بيانات السجل المُنشأ (العميل/المركبة/…) حقول
// مستقلة في النموذج، لا تُخلط بسياق المدخِل.

import { useAppContext } from "@/contexts/app-context";
import { AlertTriangle } from "lucide-react";

export interface ActiveFinanceContext {
  /** True when exactly one active branch is in scope — entry is allowed. */
  ready: boolean;
  /** The active branch's company (derived), when resolvable. */
  companyId: number | null;
  /** The single active branch, or null when none/multiple are selected. */
  branchId: number | null;
  /** Arabic notice to show when not ready. */
  message: string | null;
}

/**
 * Resolve the entering user's active finance context. Entry is "ready" only
 * when a single active branch is chosen (selectedBranchId). A single branch
 * implies a single company, so the record lands in one unambiguous scope.
 */
export function useActiveFinanceContext(): ActiveFinanceContext {
  const { selectedBranchId, selectedCompanyIds, filteredBranches } = useAppContext();
  const branchId = selectedBranchId ?? null;
  if (branchId == null) {
    return {
      ready: false,
      companyId: selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : null,
      branchId: null,
      message: "اختر فرعًا واحدًا نشطًا قبل الإدخال المالي — سياق المدخِل (الفرع/الشركة) يحدّد مكان السجل وصلاحيته.",
    };
  }
  const branch = filteredBranches.find((b) => b.id === branchId);
  const companyId = branch?.companyId ?? (selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : null);
  return { ready: true, companyId, branchId, message: null };
}

/**
 * Inline notice rendered at the top of a finance create form when the entering
 * user's active context isn't a single branch. Pair it with disabling «حفظ»
 * via `useActiveFinanceContext().ready` so nothing is saved into an ambiguous
 * scope.
 */
export function ActiveContextNotice({ ctx }: { ctx?: ActiveFinanceContext }) {
  const fallback = useActiveFinanceContext();
  const c = ctx ?? fallback;
  if (c.ready) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-status-warning-surface bg-status-warning-surface px-4 py-3 text-sm text-status-warning-foreground">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{c.message}</span>
    </div>
  );
}
