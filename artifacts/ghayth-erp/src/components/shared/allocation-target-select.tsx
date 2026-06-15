import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import {
  VehicleSelect, ProjectSelect, SupplierSelect, ClientSelect,
  EmployeeSelect, DriverSelect,
} from "@/components/shared/entity-selects";
import { SupplierItemPicker } from "@/components/shared/supplier-item-picker";
import type { LineAllocation } from "@/components/shared/line-allocation-panel";
import type { FinanceTarget } from "@/lib/finance/scenario-model";
import { useApiQuery } from "@/lib/api";

/**
 * AllocationTargetSelect — the «ربط العملية بـ» master field (#1715 PR-3).
 *
 * Instead of dumping every dimension field on the operator at once, a
 * single master Select chooses WHAT the operation is linked to, and only
 * the relevant conditional fields render. The component emits a
 * `LineAllocation` (the canonical dim payload the finance backend already
 * consumes via buildAllocationPayload) plus the chosen `target` + the
 * operational extras (maintenance type / odometer / cost bearer / reason)
 * so the caller can drive the maintenance-ticket effect (PR-6).
 *
 * Targets mirror docs/finance/FINANCE_ALLOCATION_TARGETS.md.
 */

// The canonical target union lives in the central scenario model so the
// renderer, the effect/account hints and the backend all agree on one list.
export type AllocationTarget = FinanceTarget;

export interface AllocationTargetValue {
  target: AllocationTarget;
  allocation: LineAllocation;
  // Operational extras (used by the maintenance-ticket effect).
  maintenanceType?: string;
  odometer?: string;
  costBearer?: string;
  reason?: string;
  // #1715 §5 — link to an existing maintenance ticket instead of creating one.
  existingTicketId?: string;
  // #1715 — capital purchase: create a NEW fixed asset (depreciated by the engine).
  createAsset?: boolean;
  assetName?: string;
  assetUsefulLifeYears?: string;
  // #1715 — vehicle fuel: open a fuel log (liters / price / odometer / station).
  createFuelLog?: boolean;
  fuelLiters?: string;
  fuelCostPerLiter?: string;
  fuelOdometer?: string;
  // #2234 — `fuelStation` is now the temporary UNREGISTERED supplier name only;
  // the saved supplier rides on allocation.vendorId. `fuelSupplierUnregistered`
  // toggles the draft-only free-text exception.
  fuelStation?: string;
  fuelSupplierUnregistered?: boolean;
  // #2235 — the chosen supplier item (memory): fills the suggested price/unit.
  fuelItemId?: string;
}

const TARGET_OPTIONS: { value: AllocationTarget; label: string }[] = [
  { value: "none", label: "بدون ربط" },
  { value: "vehicle", label: "مركبة" },
  { value: "vehicle_maintenance", label: "صيانة مركبة" },
  { value: "property", label: "عقار" },
  { value: "property_maintenance", label: "صيانة عقار" },
  { value: "unit", label: "وحدة عقارية" },
  { value: "contract", label: "عقد" },
  { value: "project", label: "مشروع" },
  { value: "umrah_season", label: "موسم عمرة" },
  { value: "umrah_agent", label: "وكيل عمرة" },
  { value: "transport_trip", label: "رحلة نقل" },
  { value: "supplier", label: "مورد" },
  { value: "customer", label: "عميل" },
  { value: "employee", label: "موظف" },
  { value: "fixed_asset", label: "أصل ثابت" },
];

const MAINTENANCE_TYPES = ["دورية", "إصلاح", "طارئة", "وقائية", "حادث"];

interface Props {
  value: AllocationTargetValue;
  onChange: (v: AllocationTargetValue) => void;
  label?: string;
}

export function AllocationTargetSelect({ value, onChange, label = "ربط العملية بـ" }: Props) {
  const set = (patch: Partial<AllocationTargetValue>) => onChange({ ...value, ...patch });
  const setAlloc = (patch: Partial<LineAllocation>) =>
    onChange({ ...value, allocation: { ...value.allocation, ...patch } });

  // Lazy reference data for targets without a dedicated entity-select.
  const { data: propertiesData } = useApiQuery<{ data: any[] }>(["properties-list"], "/properties/buildings", value.target === "property" || value.target === "property_maintenance" || value.target === "unit");
  const { data: unitsData } = useApiQuery<{ data: any[] }>(["units-list"], "/properties/units", value.target === "unit" || value.target === "property_maintenance");
  const { data: contractsData } = useApiQuery<{ data: any[] }>(["contracts-list"], "/properties/contracts", value.target === "contract" || value.target === "property_maintenance");
  const { data: seasonsData } = useApiQuery<{ data: any[] }>(["umrah-seasons"], "/umrah/seasons", value.target === "umrah_season" || value.target === "umrah_agent");
  const { data: agentsData } = useApiQuery<{ data: any[] }>(["umrah-agents"], "/umrah/agents", value.target === "umrah_agent");
  const { data: tripsData } = useApiQuery<{ data: any[] }>(["fleet-trips"], "/fleet/trips", value.target === "transport_trip");
  const { data: assetsData } = useApiQuery<{ data: any[] }>(["fixed-assets"], "/finance/fixed-assets", value.target === "fixed_asset");

  // #1715 §5 — open maintenance tickets the operator can link to (finance-owned
  // endpoint, so no fleet/properties permission needed). Loaded once the
  // maintenance target + its key dimension are chosen.
  const ticketTarget = value.target === "vehicle_maintenance" ? "vehicle" : value.target === "property_maintenance" ? "property" : "";
  const ticketDimId = ticketTarget === "vehicle" ? value.allocation.vehicleId : ticketTarget === "property" ? value.allocation.unitId : undefined;
  const ticketOptsUrl = ticketTarget && ticketDimId
    ? `/finance/maintenance-ticket-options?target=${ticketTarget}&${ticketTarget === "vehicle" ? "vehicleId" : "unitId"}=${ticketDimId}`
    : "/finance/maintenance-ticket-options";
  const { data: ticketOptsData } = useApiQuery<{ data: { id: number; label: string }[] }>(
    ["maint-ticket-opts", ticketTarget, String(ticketDimId ?? "")],
    ticketOptsUrl,
    Boolean(ticketTarget && ticketDimId),
  );
  const ticketOptions = ticketOptsData?.data ?? [];

  const onTargetChange = (t: AllocationTarget) => {
    // Reset the allocation when switching target so stale dims don't leak.
    onChange({ target: t, allocation: value.allocation.manualOverrideReason ? { manualOverrideReason: value.allocation.manualOverrideReason } : {} });
  };

  return (
    <div className="space-y-3">
      <FormFieldWrapper label={label}>
        <Select value={value.target} onValueChange={(v) => onTargetChange(v as AllocationTarget)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {TARGET_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormFieldWrapper>

      {(value.target === "vehicle" || value.target === "vehicle_maintenance") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <VehicleSelect value={value.allocation.vehicleId ?? ""} onChange={(v) => onChange({ ...value, allocation: { ...value.allocation, vehicleId: v }, existingTicketId: undefined })} label="المركبة" allowCreate={false} />
          <DriverSelect value={value.allocation.driverId ?? ""} onChange={(v) => setAlloc({ driverId: v })} label="السائق" allowCreate={false} />
          {value.target === "vehicle_maintenance" && (
            <>
              {ticketOptions.length > 0 && (
                <FormFieldWrapper label="ربط بتذكرة قائمة (اختياري)">
                  <Select value={value.existingTicketId ?? ""} onValueChange={(v) => set({ existingTicketId: v })}>
                    <SelectTrigger><SelectValue placeholder="إنشاء تذكرة جديدة" /></SelectTrigger>
                    <SelectContent>{ticketOptions.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </FormFieldWrapper>
              )}
              <FormFieldWrapper label="قراءة العداد">
                <Input value={value.odometer ?? ""} onChange={(e) => set({ odometer: e.target.value })} placeholder="كم" />
              </FormFieldWrapper>
              <FormFieldWrapper label="نوع الصيانة">
                <Select value={value.maintenanceType ?? ""} onValueChange={(v) => set({ maintenanceType: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{MAINTENANCE_TYPES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </FormFieldWrapper>
              <FormFieldWrapper label="المسبّب / السبب">
                <Input value={value.reason ?? ""} onChange={(e) => set({ reason: e.target.value })} placeholder="سبب الصيانة" />
              </FormFieldWrapper>
              {/* #2234 (عقد المورد التشغيلي) — الورشة/الفني طرف تجاري = مورد محفوظ
                  يصل القيد كـvendorId (تقارير الصيانة حسب المورد). مُوصى لا إلزامي. */}
              <SupplierSelect value={value.allocation.vendorId ?? ""} onChange={(v) => setAlloc({ vendorId: v })} label="الورشة / المورد" allowCreate={false} />
            </>
          )}
          {value.target === "vehicle" && (
            <div className="md:col-span-2 space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={value.createFuelLog ?? false} onChange={(e) => set({ createFuelLog: e.target.checked })} />
                تسجيل تعبئة وقود (يفتح سجل وقود ويحدّث عدّاد المركبة)
              </label>
              {value.createFuelLog && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormFieldWrapper label="عدد اللترات">
                    <Input type="number" step="0.01" value={value.fuelLiters ?? ""} onChange={(e) => set({ fuelLiters: e.target.value })} placeholder="لتر" />
                  </FormFieldWrapper>
                  <FormFieldWrapper label="سعر اللتر">
                    <Input type="number" step="0.01" value={value.fuelCostPerLiter ?? ""} onChange={(e) => set({ fuelCostPerLiter: e.target.value })} placeholder="ر.س/لتر" />
                  </FormFieldWrapper>
                  <FormFieldWrapper label="قراءة العداد (الممشى)">
                    <Input type="number" value={value.fuelOdometer ?? ""} onChange={(e) => set({ fuelOdometer: e.target.value })} placeholder="كم" />
                  </FormFieldWrapper>
                  {/* #2234 — المورد (محطة الوقود المحفوظة) هو الطرف التجاري الصحيح،
                      لا نص حر. يُربط على allocation.vendorId فيصل القيد كـvendorId.
                      «مورد غير مسجّل» استثناء مؤقت (مسودة) يظهر تحذيرًا. */}
                  <div className="md:col-span-2 space-y-2">
                    {!value.fuelSupplierUnregistered ? (
                      <SupplierSelect
                        value={value.allocation.vendorId ?? ""}
                        onChange={(v) => setAlloc({ vendorId: v })}
                        label="المورد (محطة الوقود)"
                        required
                        allowCreate={false}
                      />
                    ) : (
                      <FormFieldWrapper label="اسم المورد غير المسجّل (مؤقت — مسودة فقط)">
                        <Input value={value.fuelStation ?? ""} onChange={(e) => set({ fuelStation: e.target.value })} placeholder="اسم المحطة/المورد" />
                      </FormFieldWrapper>
                    )}
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={value.fuelSupplierUnregistered ?? false}
                        onChange={(e) => onChange({ ...value, fuelSupplierUnregistered: e.target.checked, allocation: { ...value.allocation, vendorId: e.target.checked ? undefined : value.allocation.vendorId } })}
                      />
                      مورد غير مسجّل (استثناء مؤقت)
                    </label>
                    {value.fuelSupplierUnregistered && (
                      <p className="text-xs text-yellow-700 bg-status-warning-surface border border-yellow-300 rounded p-2">
                        ⚠ المورد غير محفوظ — لا يُسمح بالترحيل النهائي إلا إذا سمحت سياسة الشركة. يُفضَّل حفظ المحطة كمورد.
                      </p>
                    )}
                    {/* #2235 — بعد اختيار المورد، تظهر بنوده المعتادة لسيناريو الوقود؛
                        اختيار البند يملأ السعر المقترح (آخر سعر). يعيد accountPurpose
                        لا حسابًا نهائيًا — financialEngine يشتق الحساب. */}
                    {!value.fuelSupplierUnregistered && value.allocation.vendorId && (
                      <SupplierItemPicker
                        supplierId={value.allocation.vendorId}
                        scenario="vehicle_fuel"
                        value={value.fuelItemId ?? ""}
                        onPick={(item) =>
                          onChange({
                            ...value,
                            fuelItemId: item ? String(item.id) : undefined,
                            fuelCostPerLiter:
                              item?.lastPrice != null ? String(item.lastPrice) : value.fuelCostPerLiter,
                          })
                        }
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(value.target === "property" || value.target === "property_maintenance" || value.target === "unit") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormFieldWrapper label="العقار">
            <Select value={value.allocation.propertyId ?? ""} onValueChange={(v) => setAlloc({ propertyId: v })}>
              <SelectTrigger><SelectValue placeholder="اختر العقار" /></SelectTrigger>
              <SelectContent>
                {(propertiesData?.data ?? []).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name ?? `مبنى #${p.id}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          {(value.target === "unit" || value.target === "property_maintenance") && (
            <FormFieldWrapper label="الوحدة">
              <Select value={value.allocation.unitId ?? ""} onValueChange={(v) => onChange({ ...value, allocation: { ...value.allocation, unitId: v }, existingTicketId: undefined })}>
                <SelectTrigger><SelectValue placeholder="اختر الوحدة" /></SelectTrigger>
                <SelectContent>
                  {(unitsData?.data ?? []).map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.unitNumber ?? u.name ?? `وحدة #${u.id}`}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
          )}
          {value.target === "property_maintenance" && (
            <>
              {ticketOptions.length > 0 && (
                <FormFieldWrapper label="ربط بتذكرة قائمة (اختياري)">
                  <Select value={value.existingTicketId ?? ""} onValueChange={(v) => set({ existingTicketId: v })}>
                    <SelectTrigger><SelectValue placeholder="إنشاء تذكرة جديدة" /></SelectTrigger>
                    <SelectContent>{ticketOptions.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </FormFieldWrapper>
              )}
              <FormFieldWrapper label="العقد / المستأجر">
                <Select value={value.allocation.contractId ?? ""} onValueChange={(v) => setAlloc({ contractId: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر العقد" /></SelectTrigger>
                  <SelectContent>
                    {(contractsData?.data ?? []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.tenantName ?? `عقد #${c.id}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormFieldWrapper>
              <FormFieldWrapper label="نوع الصيانة">
                <Select value={value.maintenanceType ?? ""} onValueChange={(v) => set({ maintenanceType: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{MAINTENANCE_TYPES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </FormFieldWrapper>
              {/* #2234 (عقد المورد التشغيلي) — المقاول/الفني طرف تجاري = مورد محفوظ
                  يصل القيد كـvendorId (تقارير الصيانة حسب المورد). مُوصى لا إلزامي. */}
              <SupplierSelect value={value.allocation.vendorId ?? ""} onChange={(v) => setAlloc({ vendorId: v })} label="المقاول / المورد" allowCreate={false} />
              <FormFieldWrapper label="من يتحمل التكلفة">
                <Select value={value.costBearer ?? ""} onValueChange={(v) => set({ costBearer: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">المالك</SelectItem>
                    <SelectItem value="tenant">المستأجر</SelectItem>
                    <SelectItem value="shared">مشترك</SelectItem>
                  </SelectContent>
                </Select>
              </FormFieldWrapper>
              <FormFieldWrapper label="المسبّب / السبب">
                <Input value={value.reason ?? ""} onChange={(e) => set({ reason: e.target.value })} placeholder="سبب الصيانة" />
              </FormFieldWrapper>
            </>
          )}
        </div>
      )}

      {value.target === "contract" && (
        <FormFieldWrapper label="العقد">
          <Select value={value.allocation.contractId ?? ""} onValueChange={(v) => setAlloc({ contractId: v })}>
            <SelectTrigger><SelectValue placeholder="اختر العقد" /></SelectTrigger>
            <SelectContent>
              {(contractsData?.data ?? []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.tenantName ?? `عقد #${c.id}`}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
      )}

      {value.target === "project" && (
        <ProjectSelect value={value.allocation.projectId ?? ""} onChange={(v) => setAlloc({ projectId: v })} label="المشروع" />
      )}

      {(value.target === "umrah_season" || value.target === "umrah_agent") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormFieldWrapper label="موسم العمرة">
            <Select value={value.allocation.umrahSeasonId ?? ""} onValueChange={(v) => setAlloc({ umrahSeasonId: v })}>
              <SelectTrigger><SelectValue placeholder="اختر الموسم" /></SelectTrigger>
              <SelectContent>
                {(seasonsData?.data ?? []).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.title ?? s.name ?? `موسم #${s.id}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          {value.target === "umrah_agent" && (
            <FormFieldWrapper label="الوكيل">
              <Select value={value.allocation.umrahAgentId ?? ""} onValueChange={(v) => setAlloc({ umrahAgentId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر الوكيل" /></SelectTrigger>
                <SelectContent>
                  {(agentsData?.data ?? []).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name ?? `وكيل #${a.id}`}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
          )}
        </div>
      )}

      {value.target === "transport_trip" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* A transport trip allocates to its vehicle + driver dims (the
              GL has no tripId dimension). The trip ref is captured in the
              override reason for the audit trail. */}
          <VehicleSelect value={value.allocation.vehicleId ?? ""} onChange={(v) => setAlloc({ vehicleId: v })} label="المركبة" allowCreate={false} />
          <DriverSelect value={value.allocation.driverId ?? ""} onChange={(v) => setAlloc({ driverId: v })} label="السائق" allowCreate={false} />
          <FormFieldWrapper label="رحلة النقل">
            <Select value={value.reason ?? ""} onValueChange={(v) => set({ reason: v })}>
              <SelectTrigger><SelectValue placeholder="اختر الرحلة" /></SelectTrigger>
              <SelectContent>
                {(tripsData?.data ?? []).map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.ref ?? `رحلة #${t.id}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        </div>
      )}

      {value.target === "supplier" && (
        <SupplierSelect value={value.allocation.vendorId ?? ""} onChange={(v) => setAlloc({ vendorId: v })} label="المورد" allowCreate={false} />
      )}

      {value.target === "customer" && (
        <ClientSelect value={value.allocation.clientId ?? ""} onChange={(v) => setAlloc({ clientId: v })} label="العميل" allowCreate={false} />
      )}

      {value.target === "employee" && (
        <EmployeeSelect value={value.allocation.employeeId ?? ""} onChange={(v) => setAlloc({ employeeId: v })} label="الموظف" allowCreate={false} />
      )}

      {value.target === "fixed_asset" && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.createAsset ?? false}
              onChange={(e) => set({ createAsset: e.target.checked })}
            />
            شراء أصل جديد (يفتح أصلاً ثابتاً ويبدأ إهلاكه تلقائياً)
          </label>
          {value.createAsset ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormFieldWrapper label="اسم الأصل *">
                <Input value={value.assetName ?? ""} onChange={(e) => set({ assetName: e.target.value })} placeholder="مثال: سيارة تويوتا 2026" />
              </FormFieldWrapper>
              <FormFieldWrapper label="العمر الإنتاجي (سنوات)">
                <Input type="number" min={1} value={value.assetUsefulLifeYears ?? ""} onChange={(e) => set({ assetUsefulLifeYears: e.target.value })} placeholder="5" />
              </FormFieldWrapper>
            </div>
          ) : (
            <FormFieldWrapper label="الأصل الثابت القائم">
              <Select value={value.allocation.assetId ?? ""} onValueChange={(v) => setAlloc({ assetId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر الأصل" /></SelectTrigger>
                <SelectContent>
                  {(assetsData?.data ?? []).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name ?? `أصل #${a.id}`}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
          )}
        </div>
      )}

      {value.target !== "none" && (
        <FormFieldWrapper label="سبب التجاوز اليدوي (اختياري)">
          <Input
            value={value.allocation.manualOverrideReason ?? ""}
            onChange={(e) => setAlloc({ manualOverrideReason: e.target.value })}
            placeholder="يُسجّل في تقرير التجاوزات اليدوية"
          />
        </FormFieldWrapper>
      )}
    </div>
  );
}

export const EMPTY_ALLOCATION_TARGET: AllocationTargetValue = { target: "none", allocation: {} };

/**
 * #1715 — build the operational-effect payload (maintenance ticket / fixed-asset
 * creation / fuel log) from the chosen allocation target. Shared by the expense
 * AND voucher forms so the mapping can never drift between them. All effects are
 * gated on their toggle; an unrelated target yields all-undefined (omitted).
 */
export function buildOperationalEffectsPayload(t: AllocationTargetValue) {
  return {
    maintenanceTicket:
      t.target === "vehicle_maintenance" || t.target === "property_maintenance"
        ? {
            create: true,
            maintenanceType: t.maintenanceType || undefined,
            odometer: t.odometer ? Number(t.odometer) : undefined,
            costBearer: t.costBearer || undefined,
            existingTicketId: t.existingTicketId ? Number(t.existingTicketId) : undefined,
          }
        : undefined,
    assetCreation:
      t.target === "fixed_asset" && t.createAsset && t.assetName
        ? {
            create: true,
            name: t.assetName,
            usefulLifeYears: t.assetUsefulLifeYears ? Number(t.assetUsefulLifeYears) : undefined,
          }
        : undefined,
    fuelLog:
      t.target === "vehicle" && t.createFuelLog
        ? {
            create: true,
            liters: t.fuelLiters ? Number(t.fuelLiters) : undefined,
            costPerLiter: t.fuelCostPerLiter ? Number(t.fuelCostPerLiter) : undefined,
            odometer: t.fuelOdometer ? Number(t.fuelOdometer) : undefined,
            // #2234 — saved supplier is the truth (vendorId); stationName is a
            // derived label. Unregistered name only when the exception is on.
            supplierId: !t.fuelSupplierUnregistered && t.allocation.vendorId ? Number(t.allocation.vendorId) : undefined,
            unregisteredSupplierName: t.fuelSupplierUnregistered ? (t.fuelStation || undefined) : undefined,
            stationName: t.fuelSupplierUnregistered ? (t.fuelStation || undefined) : undefined,
          }
        : undefined,
  };
}
