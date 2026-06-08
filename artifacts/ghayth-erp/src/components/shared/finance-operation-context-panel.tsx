import { AllocationTargetSelect, type AllocationTargetValue, type AllocationTarget } from "@/components/shared/allocation-target-select";
import { Info } from "lucide-react";

/**
 * FinanceOperationContextPanel (#1715 §7) — the single, reusable block that
 * describes WHAT a finance operation is linked to and the OPERATIONAL EFFECT
 * that link will produce. Wraps the hierarchical «ربط العملية بـ» picker
 * (AllocationTargetSelect) and renders a contextual effect summary so the
 * operator sees, before saving, that "لا يوجد ربط بلا أثر" (#1715 §5/§11).
 *
 * Consolidation: composes the existing, proven AllocationTargetSelect rather
 * than re-implementing dimension pickers. Finance create pages (expenses,
 * vouchers, receipts, …) adopt this one panel instead of inlining their own.
 */

// Each target → the operational effect the backend produces for it.
const EFFECT_BY_TARGET: Partial<Record<AllocationTarget, string>> = {
  vehicle: "سيُحمَّل المبلغ على المركبة ويظهر في تقرير تكلفة المركبة.",
  vehicle_maintenance: "سيُنشئ تذكرة صيانة مركبة ويربطها بالمصروف، ويحدّث قراءة عدّاد المركبة.",
  property: "سيُحمَّل المبلغ على العقار ويظهر في تقرير ربحية العقار.",
  property_maintenance: "سيُنشئ تذكرة صيانة عقارية مرتبطة بالعقار/الوحدة/العقد.",
  unit: "سيُحمَّل المبلغ على الوحدة العقارية.",
  contract: "سيُحمَّل المبلغ على العقد المرتبط.",
  project: "سيُحمَّل المبلغ على المشروع ويظهر في تكلفة المشروع.",
  umrah_season: "سيُحمَّل المبلغ على موسم العمرة.",
  umrah_agent: "سيُحمَّل المبلغ على وكيل العمرة.",
  transport_trip: "سيُحمَّل المبلغ على رحلة النقل.",
  supplier: "سيُربط المبلغ بالمورد ويظهر في كشف حساب المورد.",
  customer: "سيُربط المبلغ بالعميل ويظهر في كشف حساب العميل.",
  employee: "سيُربط المبلغ بالموظف.",
  fixed_asset: "سيُربط المبلغ بالأصل الثابت.",
};

interface Props {
  value: AllocationTargetValue;
  onChange: (v: AllocationTargetValue) => void;
  /** Section heading, e.g. «ربط المصروف بـ» / «ربط السند بـ». */
  title?: string;
  /** Optional helper line under the heading. */
  description?: string;
}

export function FinanceOperationContextPanel({ value, onChange, title = "ربط العملية بـ", description }: Props) {
  const effect = value.target !== "none" ? EFFECT_BY_TARGET[value.target] : undefined;
  return (
    <div className="border rounded-lg p-4 mb-4 space-y-3">
      <h3 className="font-semibold text-sm text-muted-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground">
        {description ?? "اختر ما تُربط به العملية، وستظهر الحقول المناسبة فقط. الربط يُنتج الأبعاد المحاسبية ومركز التكلفة تلقائياً."}
      </p>
      <AllocationTargetSelect value={value} onChange={onChange} label={title} />
      {effect && (
        <div className="flex items-start gap-2 rounded-md bg-status-info-surface/40 border border-status-info-surface p-2 text-xs text-status-info-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span><span className="font-medium">الأثر المتوقّع:</span> {effect}</span>
        </div>
      )}
    </div>
  );
}

export default FinanceOperationContextPanel;
