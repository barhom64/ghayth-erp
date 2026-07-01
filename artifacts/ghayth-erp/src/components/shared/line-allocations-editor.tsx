import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberField } from "@/components/shared/form-field-wrapper";
import {
  VehicleSelect, EmployeeSelect, UnitSelect, ProjectSelect, ClientSelect, SupplierSelect,
} from "@/components/shared/entity-selects";

/**
 * LineAllocationsEditor — م١-ب: split ONE document line across several
 * operational entities by percentage (e.g. صيانة ٩٬٠٠٠ → ٣ مركبات × ٣٣٫٣٪).
 * Feeds financial_line_allocations (allocationType=percent). Each part picks
 * a REAL entity (smart select, no free text — الدستور) + مَن يتحمّل (costBearer
 * تفريع حوكمي). Reference: docs/finance-audit/25 §١١.١ ; issue #2994.
 */
export type LineAllocation = {
  entityType: string;
  entityId: string;
  percent: number;
  costBearer: string;
};

export const emptyAllocation = (): LineAllocation => ({ entityType: "vehicle", entityId: "", percent: 0, costBearer: "company" });

const ENTITY_TYPES: { value: string; label: string }[] = [
  { value: "vehicle", label: "مركبة" },
  { value: "employee", label: "موظف" },
  { value: "unit", label: "وحدة/عقار" },
  { value: "project", label: "مشروع" },
  { value: "client", label: "عميل" },
  { value: "supplier", label: "مورد" },
];

const COST_BEARERS: { value: string; label: string }[] = [
  { value: "company", label: "الشركة" },
  { value: "driver", label: "موظف/سائق" },
  { value: "tenant", label: "مستأجر" },
  { value: "customer", label: "عميل" },
  { value: "insurance", label: "تأمين" },
  { value: "supplier", label: "مورد/ضمان" },
  { value: "third_party", label: "طرف ثالث" },
];

function EntityValueSelect({ entityType, value, onChange }: { entityType: string; value: string; onChange: (v: string) => void }) {
  const common = { value, onChange, label: "" as const };
  switch (entityType) {
    case "vehicle": return <VehicleSelect {...common} placeholder="اختر المركبة" />;
    case "employee": return <EmployeeSelect {...common} placeholder="اختر الموظف" />;
    case "unit": return <UnitSelect {...common} placeholder="اختر الوحدة" />;
    case "project": return <ProjectSelect {...common} placeholder="اختر المشروع" />;
    case "client": return <ClientSelect {...common} placeholder="اختر العميل" />;
    case "supplier": return <SupplierSelect {...common} placeholder="اختر المورد" />;
    default: return null;
  }
}

export function LineAllocationsEditor({
  value,
  onChange,
}: {
  value: LineAllocation[];
  onChange: (v: LineAllocation[]) => void;
}) {
  const totalPct = value.reduce((s, a) => s + (Number(a.percent) || 0), 0);
  const balanced = value.length === 0 || Math.abs(totalPct - 100) < 0.01;

  const update = (i: number, patch: Partial<LineAllocation>) =>
    onChange(value.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const add = () => onChange([...value, emptyAllocation()]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2" dir="rtl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">توزيع البند على كيانات (اختياري) — نسبة مئوية</span>
        {value.length > 0 && (
          <span className={`text-xs ${balanced ? "text-status-success-foreground" : "text-status-error-foreground"}`}>
            المجموع: {totalPct}% {balanced ? "" : "— يجب أن يساوي ١٠٠٪"}
          </span>
        )}
      </div>

      {value.map((a, i) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-[120px_1fr_90px_140px_auto] gap-2 items-start">
          <Select value={a.entityType} onValueChange={(v) => update(i, { entityType: v, entityId: "" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <EntityValueSelect entityType={a.entityType} value={a.entityId} onChange={(v) => update(i, { entityId: v })} />
          <NumberField label="النسبة" hideLabel className="w-20" min={0} max={100} value={a.percent || ""} onChange={(v) => update(i, { percent: Number(v) || 0 })} placeholder="0" />
          <Select value={a.costBearer} onValueChange={(v) => update(i, { costBearer: v })}>
            <SelectTrigger><SelectValue placeholder="مَن يتحمّل" /></SelectTrigger>
            <SelectContent>
              {COST_BEARERS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-status-error-foreground mt-2" aria-label="حذف الجزء">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" /> إضافة جزء
      </Button>
    </div>
  );
}
