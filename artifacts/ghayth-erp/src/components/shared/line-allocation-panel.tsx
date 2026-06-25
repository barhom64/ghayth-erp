import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { AccountSelect, CostCenterSelect, VehicleSelect, ProjectSelect, EmployeeSelect, ClientSelect, VendorSelect, DriverSelect } from "@/components/shared/entity-selects";
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Pencil } from "lucide-react";

/**
 * Per-line accounting allocation panel — exposes the dimensional fields
 * that migration 200 added to invoice_lines (and 202 to purchase lines)
 * so the operator can route each line to a specific account + cost
 * center + business entity (vehicle / property / project / etc).
 *
 * Defaults to collapsed; expand only when the operator needs to override
 * the auto-resolved allocation. The status badge ('mapped' / 'unmapped'
 * / 'manual_override') gives an at-a-glance signal without the operator
 * having to expand every line.
 */

export type AllocationStatus = "mapped" | "unmapped" | "manual_override" | "auto_resolved";

export interface LineAllocation {
  accountCode?: string;
  costCenterId?: string;
  activityType?: string;
  projectId?: string;
  vehicleId?: string;
  propertyId?: string;
  unitId?: string;
  assetId?: string;
  contractId?: string;
  umrahAgentId?: string;
  // Dim parity with journal_lines — the 7 fields below were missing,
  // so Manual JE created via journal-create.tsx silently dropped
  // employeeId/driverId/productId/vendorId/clientId/umrahSeasonId/
  // departmentId on every line even though the backend INSERT accepts
  // them. Entity-360 profile tabs for employee/driver/product/vendor/
  // client/umrahSeason showed zero data from manual journals.
  employeeId?: string;
  driverId?: string;
  productId?: string;
  vendorId?: string;
  clientId?: string;
  umrahSeasonId?: string;
  departmentId?: string;
  manualOverrideReason?: string;
}

interface Props {
  value: LineAllocation;
  onChange: (next: LineAllocation) => void;
  status?: AllocationStatus;
  warnings?: string[];
  required?: boolean;
}

const STATUS_BADGE: Record<AllocationStatus, { label: string; tone: string }> = {
  mapped: { label: "موجَّه", tone: "bg-emerald-100 text-emerald-800" },
  auto_resolved: { label: "موجَّه تلقائياً", tone: "bg-status-info-surface text-status-info-foreground" },
  unmapped: { label: "غير موجَّه", tone: "bg-amber-100 text-status-warning-foreground" },
  manual_override: { label: "تعديل يدوي", tone: "bg-purple-100 text-purple-800" },
};

const ACTIVITY_TYPES = [
  { value: "transport",        label: "نقل" },
  { value: "equipment_rental", label: "تأجير معدات" },
  { value: "property_rental",  label: "إيجار عقاري" },
  { value: "umrah",            label: "عمرة" },
  { value: "contracting",      label: "مقاولات" },
  { value: "services",         label: "خدمات عامة" },
  { value: "trading",          label: "تجارة" },
  { value: "other",            label: "أخرى" },
];

export function LineAllocationPanel({
  value, onChange, status = "unmapped", warnings = [], required = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const set = (field: keyof LineAllocation, v: any) => onChange({ ...value, [field]: v });

  const badge = STATUS_BADGE[status];
  const hasAccount = !!value.accountCode;
  const hasDimension = !!(value.vehicleId || value.propertyId || value.projectId || value.contractId);

  return (
    <div className="mt-2 border-t pt-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center justify-between w-full text-xs hover:bg-muted/30 rounded px-2 py-1 transition-colors"
      >
        <span className="flex items-center gap-2">
          {status === "mapped" || status === "auto_resolved"
            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            : <AlertTriangle className="h-3.5 w-3.5 text-status-warning-foreground" />}
          <span className="font-medium">التفاصيل المحاسبية للبند</span>
          <Badge className={`text-[10px] ${badge.tone}`}>{badge.label}</Badge>
          {hasAccount && (
            <span className="text-muted-foreground font-mono">
              {value.accountCode}
              {value.costCenterId ? ` / CC ${value.costCenterId}` : ""}
            </span>
          )}
          {required && !hasAccount && (
            <span className="text-destructive text-[10px]">(مطلوب للاعتماد)</span>
          )}
        </span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {warnings.length > 0 && (
        <div className="mt-2 bg-status-warning-surface border border-status-warning-surface rounded px-2 py-1 text-[11px] text-status-warning-foreground">
          {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      {expanded && (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3 bg-muted/20 p-3 rounded">
          <FormFieldWrapper label="حساب الإيراد / المصروف">
            <AccountSelect
              value={value.accountCode ?? ""}
              onChange={(v) => set("accountCode", v)}
              label=""
              allowCreate={false}
            />
          </FormFieldWrapper>

          <CostCenterSelect
            value={value.costCenterId ?? ""}
            onChange={(v) => set("costCenterId", v)}
            label="مركز التكلفة"
          />

          <FormFieldWrapper label="نوع النشاط">
            <Select
              value={value.activityType ?? "_none"}
              onValueChange={(v) => set("activityType", v === "_none" ? undefined : v)}
            >
              <SelectTrigger><SelectValue placeholder="— غير محدد —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— غير محدد —</SelectItem>
                {ACTIVITY_TYPES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormFieldWrapper>

          <VehicleSelect
            value={value.vehicleId ?? ""}
            onChange={(v) => set("vehicleId", v)}
            label="المركبة"
            allowCreate={false}
          />

          <FormFieldWrapper label="العقار">
            <Input
              type="number" dir="ltr"
              value={value.propertyId ?? ""}
              onChange={(e) => set("propertyId", e.target.value)}
              placeholder="رقم العقار"
            />
          </FormFieldWrapper>

          <FormFieldWrapper label="الوحدة">
            <Input
              type="number" dir="ltr"
              value={value.unitId ?? ""}
              onChange={(e) => set("unitId", e.target.value)}
              placeholder="رقم الوحدة"
            />
          </FormFieldWrapper>

          <ProjectSelect
            value={value.projectId ?? ""}
            onChange={(v) => set("projectId", v)}
            label="المشروع"
            allowCreate={false}
          />

          <FormFieldWrapper label="العقد">
            <Input
              type="number" dir="ltr"
              value={value.contractId ?? ""}
              onChange={(e) => set("contractId", e.target.value)}
              placeholder="رقم العقد"
            />
          </FormFieldWrapper>

          <FormFieldWrapper label="الأصل الثابت">
            <Input
              type="number" dir="ltr"
              value={value.assetId ?? ""}
              onChange={(e) => set("assetId", e.target.value)}
              placeholder="رقم الأصل الثابت"
            />
          </FormFieldWrapper>

          <EmployeeSelect
            value={value.employeeId ?? ""}
            onChange={(v) => set("employeeId", v)}
            label="الموظف"
            allowCreate={false}
          />

          <DriverSelect
            value={value.driverId ?? ""}
            onChange={(v) => set("driverId", v)}
            label="السائق"
            allowCreate={false}
          />

          <FormFieldWrapper label="القسم">
            <Input
              type="number" dir="ltr"
              value={value.departmentId ?? ""}
              onChange={(e) => set("departmentId", e.target.value)}
              placeholder="رقم القسم"
            />
          </FormFieldWrapper>

          <FormFieldWrapper label="المنتج">
            <Input
              type="number" dir="ltr"
              value={value.productId ?? ""}
              onChange={(e) => set("productId", e.target.value)}
              placeholder="رقم المنتج"
            />
          </FormFieldWrapper>

          <ClientSelect
            value={value.clientId ?? ""}
            onChange={(v) => set("clientId", v)}
            label="العميل"
            allowCreate={false}
          />

          <VendorSelect
            value={value.vendorId ?? ""}
            onChange={(v) => set("vendorId", v)}
            label="المورد"
            allowCreate={false}
          />

          <FormFieldWrapper label="موسم العمرة">
            <Input
              type="number" dir="ltr"
              value={value.umrahSeasonId ?? ""}
              onChange={(e) => set("umrahSeasonId", e.target.value)}
              placeholder="رقم موسم العمرة"
            />
          </FormFieldWrapper>

          <FormFieldWrapper label="وكيل العمرة">
            <Input
              type="number" dir="ltr"
              value={value.umrahAgentId ?? ""}
              onChange={(e) => set("umrahAgentId", e.target.value)}
              placeholder="رقم وكيل العمرة"
            />
          </FormFieldWrapper>

          {status === "manual_override" && (
            <div className="md:col-span-3">
              <FormFieldWrapper label="سبب التعديل اليدوي">
                <Textarea
                  value={value.manualOverrideReason ?? ""}
                  onChange={(e) => set("manualOverrideReason", e.target.value)}
                  rows={2}
                  placeholder="مثال: تعديل بناءً على طلب المدير المالي / إعادة تصنيف حسب طبيعة الخدمة"
                />
              </FormFieldWrapper>
            </div>
          )}

          {hasAccount && status !== "manual_override" && (
            <div className="md:col-span-3 flex items-center gap-2 text-xs">
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => {
                  if (!value.manualOverrideReason) {
                    onChange({ ...value, manualOverrideReason: "تعديل يدوي بواسطة المستخدم" });
                  }
                }}
              >
                <Pencil className="h-3 w-3 me-1" /> تأكيد كتعديل يدوي
              </Button>
              <span className="text-muted-foreground text-[10px]">
                الـ override يتطلب سبباً ويُسجَّل في الـ audit log.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function deriveAllocationStatus(allocation: LineAllocation): AllocationStatus {
  if (allocation.manualOverrideReason) return "manual_override";
  if (allocation.accountCode) return "mapped";
  return "unmapped";
}

export function buildAllocationPayload(allocation: LineAllocation): Record<string, any> {
  return {
    accountCode: allocation.accountCode || undefined,
    costCenterId: allocation.costCenterId ? Number(allocation.costCenterId) : undefined,
    activityType: allocation.activityType || undefined,
    projectId: allocation.projectId ? Number(allocation.projectId) : undefined,
    vehicleId: allocation.vehicleId ? Number(allocation.vehicleId) : undefined,
    propertyId: allocation.propertyId ? Number(allocation.propertyId) : undefined,
    unitId: allocation.unitId ? Number(allocation.unitId) : undefined,
    assetId: allocation.assetId ? Number(allocation.assetId) : undefined,
    contractId: allocation.contractId ? Number(allocation.contractId) : undefined,
    umrahAgentId: allocation.umrahAgentId ? Number(allocation.umrahAgentId) : undefined,
    employeeId: allocation.employeeId ? Number(allocation.employeeId) : undefined,
    driverId: allocation.driverId ? Number(allocation.driverId) : undefined,
    productId: allocation.productId ? Number(allocation.productId) : undefined,
    vendorId: allocation.vendorId ? Number(allocation.vendorId) : undefined,
    clientId: allocation.clientId ? Number(allocation.clientId) : undefined,
    umrahSeasonId: allocation.umrahSeasonId ? Number(allocation.umrahSeasonId) : undefined,
    departmentId: allocation.departmentId ? Number(allocation.departmentId) : undefined,
    manualOverrideReason: allocation.manualOverrideReason || undefined,
  };
}
