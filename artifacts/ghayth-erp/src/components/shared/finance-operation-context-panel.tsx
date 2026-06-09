import { AllocationTargetSelect, type AllocationTargetValue } from "@/components/shared/allocation-target-select";
import { resolveTargetHint } from "@/lib/finance/scenario-model";
import { Info } from "lucide-react";

/**
 * FinanceOperationContextPanel (#1715 §7) — the single, reusable block that
 * describes WHAT a finance operation is linked to and the OPERATIONAL EFFECT
 * that link will produce. Wraps the hierarchical «ربط العملية بـ» picker
 * (AllocationTargetSelect) and renders a contextual effect summary so the
 * operator sees, before saving, that "لا يوجد ربط بلا أثر" (#1715 §5/§11).
 *
 * Consolidation: composes the existing, proven AllocationTargetSelect rather
 * than re-implementing dimension pickers. The effect / expected accounting /
 * future task it shows are derived from THE central scenario model
 * (src/lib/finance/scenario-model.ts → TARGET_HINTS), not a local duplicate —
 * so the preview can never drift from what the backend actually posts.
 * Finance create pages (expenses, vouchers, receipts, …) adopt this one panel.
 */

interface Props {
  value: AllocationTargetValue;
  onChange: (v: AllocationTargetValue) => void;
  /** Section heading, e.g. «ربط المصروف بـ» / «ربط السند بـ». */
  title?: string;
  /** Optional helper line under the heading. */
  description?: string;
}

// Arabic labels for the expected GL purpose shown in «التوجيه المحاسبي المتوقع».
const PURPOSE_LABELS: Record<string, string> = {
  general_expense: "مصروف عام",
  vehicle_expense: "مصروفات المركبة",
  vehicle_maintenance_expense: "صيانة المركبات",
  vehicle_fuel_expense: "وقود المركبات",
  property_expense: "مصروفات العقار",
  property_maintenance_expense: "صيانة العقارات",
  project_cost: "تكاليف المشروع",
  umrah_cost: "تكاليف العمرة",
  transport_cost: "تكاليف النقل",
  inventory_receipt: "استلام مخزون (رسملة)",
  fixed_asset_purchase: "شراء أصل ثابت (رسملة)",
};

export function FinanceOperationContextPanel({ value, onChange, title = "ربط العملية بـ", description }: Props) {
  // The expected accounting / effect / future task all come from the central
  // scenario model — one source of truth shared with the backend.
  const hint = value.target !== "none" ? resolveTargetHint(value.target) : null;
  return (
    <div className="border rounded-lg p-4 mb-4 space-y-3">
      <h3 className="font-semibold text-sm text-muted-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground">
        {description ?? "اختر ما تُربط به العملية، وستظهر الحقول المناسبة فقط. الربط يُنتج الأبعاد المحاسبية ومركز التكلفة تلقائياً."}
      </p>
      <AllocationTargetSelect value={value} onChange={onChange} label={title} />
      {hint && (
        <div className="space-y-2 rounded-md bg-status-info-surface/40 border border-status-info-surface p-2 text-xs text-status-info-foreground">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <span className="font-medium">التوجيه المحاسبي المتوقع:</span>{" "}
              {PURPOSE_LABELS[hint.accountPurpose] ?? hint.accountPurpose}
              {hint.capitalize ? " — رسملة (ميزانية، لا مصروف)" : ""}
            </span>
          </div>
          {hint.effect && (
            <div className="flex items-start gap-2">
              <span className="font-medium shrink-0">الأثر التشغيلي:</span>
              <span>{hint.effect}</span>
            </div>
          )}
          {hint.futureTask && (
            <div className="flex items-start gap-2">
              <span className="font-medium shrink-0">المهمة المستقبلية:</span>
              <span>{hint.futureTask}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FinanceOperationContextPanel;
