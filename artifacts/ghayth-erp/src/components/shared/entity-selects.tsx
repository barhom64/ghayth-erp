import { useState, useMemo } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { SearchableSelect, SearchableSelectField, type SelectOption } from "./searchable-select";
import { FormFieldWrapper, fieldErrorClass } from "./form-field-wrapper";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormShell, FormTextField } from "@workspace/ui-core";

interface QuickCreateField {
  key: string;
  label: string;
  required?: boolean;
  type?: string;
}

interface QuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: QuickCreateField[];
  apiPath: string;
  invalidateKey: string;
  onCreated?: (data: any) => void;
}

function QuickCreateDialog({
  open,
  onOpenChange,
  title,
  fields,
  apiPath,
  invalidateKey,
  onCreated,
}: QuickCreateDialogProps) {
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, any>>(apiPath, "POST", [[invalidateKey]]);

  // Build a runtime zod schema and default values from the fields prop.
  // Required fields gate the submit button via FormShell's built-in
  // validation — no more "missing fields" toast list.
  const schemaShape: Record<string, z.ZodString> = {};
  const defaults: Record<string, string> = {};
  for (const f of fields) {
    const s = z.string().trim();
    schemaShape[f.key] = f.required ? s.min(1, "مطلوب") : s;
    defaults[f.key] = "";
  }
  const quickCreateSchema = z.object(schemaShape);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <FormShell
          // Remount on open so the form clears between consecutive
          // create flows without an explicit reset.
          key={open ? "open" : "closed"}
          schema={quickCreateSchema as unknown as z.ZodType<Record<string, string>>}
          defaultValues={defaults}
          submitLabel={createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}
          secondaryActions={
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          }
          onSubmit={(values) => {
            createMut.mutate(values, {
              onSuccess: (data: any) => {
                onCreated?.(data);
                onOpenChange(false);
                toast({ title: `تم الإنشاء بنجاح` });
              },
              onError: (err: any) => {
                toast({ variant: "destructive", title: "خطأ في الإنشاء", description: err?.fix ?? err?.message });
              },
            });
          }}
        >
          {fields.map((field) => (
            <FormTextField
              key={field.key}
              name={field.key}
              label={field.label}
              required={field.required}
              type={field.type as any}
              placeholder={field.label}
            />
          ))}
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Unified cost-center selector. All finance/purchase/journal forms
 * must use this component so the stored value follows the canonical
 * "{kind}-{name}" convention the backend validates.
 * ------------------------------------------------------------------ */
export interface CostCenterSelectProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
  includeNone?: boolean;
  className?: string;
  error?: string;
}

export function CostCenterSelect({
  value,
  onChange,
  required = false,
  label = "مركز التكلفة",
  placeholder = "اختر مركز التكلفة",
  includeNone = true,
  className,
  error,
}: CostCenterSelectProps) {
  const { data: branchesData } = useApiQuery<{ data: any[] }>(["branches-list"], "/settings/branches");
  const { data: departmentsData } = useApiQuery<{ data: any[] }>(["departments-list"], "/settings/departments");
  const { data: projectsData } = useApiQuery<{ data: any[] }>(["projects-list"], "/projects");

  const branches = branchesData?.data || [];
  const departments = departmentsData?.data || [];
  const projects = projectsData?.data || [];

  const options = useMemo(() => {
    const opts: SelectOption[] = [{ value: "عام", label: "عام (كل الشركة)" }];
    for (const b of branches) opts.push({ value: `فرع-${b.name}`, label: `فرع: ${b.name}`, sublabel: b.city });
    for (const d of departments) opts.push({ value: `قسم-${d.name}`, label: `قسم: ${d.name}` });
    for (const p of projects) opts.push({ value: `مشروع-${p.name || p.title}`, label: `مشروع: ${p.name || p.title}`, sublabel: p.code });
    return opts;
  }, [branches, departments, projects]);

  return (
    <SearchableSelectField
      label={label}
      required={required}
      error={error}
      options={options}
      value={value}
      onValueChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="ابحث عن مركز تكلفة..."
      emptyText="لا توجد مراكز تكلفة"
      fieldClassName={className}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Generic entity selector factory — searchable with quick-create.
 * ------------------------------------------------------------------ */
interface EntitySelectConfig {
  queryKey: string;
  endpoint: string;
  defaultLabel: string;
  defaultPlaceholder: string;
  searchPlaceholder: string;
  createTitle: string;
  createLabel: string;
  createApiPath: string;
  createFields: QuickCreateField[];
  getName: (row: any) => string;
  getSublabel?: (row: any) => string;
  getValueField?: string;
}

interface EntitySelectProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
  error?: string;
  allowCreate?: boolean;
  filter?: (item: any) => boolean;
}

function buildEntitySelect(config: EntitySelectConfig) {
  return function EntitySelectComponent({
    value,
    onChange,
    required = false,
    label = config.defaultLabel,
    placeholder = config.defaultPlaceholder,
    className,
    error,
    allowCreate = true,
    filter,
  }: EntitySelectProps) {
    const [showCreate, setShowCreate] = useState(false);
    const { data, refetch } = useApiQuery<{ data: any[] }>([config.queryKey], config.endpoint);
    let rows = data?.data || [];
    if (filter) rows = rows.filter(filter);

    const options = useMemo(
      () =>
        rows.map((r: any) => ({
          value: String(r[config.getValueField || "id"]),
          label: config.getName(r),
          sublabel: config.getSublabel?.(r),
        })),
      [rows]
    );

    return (
      <>
        <SearchableSelectField
          label={label}
          required={required}
          error={error}
          options={options}
          value={value}
          onValueChange={onChange}
          placeholder={placeholder}
          searchPlaceholder={config.searchPlaceholder}
          emptyText={`لا توجد نتائج`}
          fieldClassName={className}
          onCreateNew={allowCreate ? () => setShowCreate(true) : undefined}
          createNewLabel={config.createLabel}
        />
        {allowCreate && (
          <QuickCreateDialog
            open={showCreate}
            onOpenChange={setShowCreate}
            title={config.createTitle}
            fields={config.createFields}
            apiPath={config.createApiPath}
            invalidateKey={config.queryKey}
            onCreated={(res) => {
              const newId = String(res?.id || res?.data?.id || "");
              if (newId) onChange(newId);
              refetch();
            }}
          />
        )}
      </>
    );
  };
}

export const EmployeeSelect = buildEntitySelect({
  queryKey: "employees-list",
  endpoint: "/employees?limit=500",
  defaultLabel: "الموظف",
  defaultPlaceholder: "اختر الموظف",
  searchPlaceholder: "ابحث عن موظف...",
  createTitle: "إضافة موظف جديد",
  createLabel: "+ موظف جديد",
  createApiPath: "/employees",
  createFields: [
    { key: "name", label: "اسم الموظف", required: true },
    { key: "empNumber", label: "الرقم الوظيفي", required: true },
    { key: "phone", label: "الهاتف" },
  ],
  getName: (r) => r?.name ? `${r.name}${r.empNumber ? ` - ${r.empNumber}` : ""}` : `#${r?.id}`,
  getSublabel: (r) => r?.department || r?.jobTitle || "",
});

export const ClientSelect = buildEntitySelect({
  queryKey: "clients-list",
  endpoint: "/clients?limit=500",
  defaultLabel: "العميل",
  defaultPlaceholder: "اختر العميل",
  searchPlaceholder: "ابحث عن عميل...",
  createTitle: "إضافة عميل جديد",
  createLabel: "+ عميل جديد",
  createApiPath: "/clients",
  createFields: [
    { key: "name", label: "اسم العميل", required: true },
    { key: "phone", label: "الهاتف" },
    { key: "email", label: "البريد", type: "email" },
  ],
  getName: (r) => r?.name || `#${r?.id}`,
  getSublabel: (r) => r?.phone || r?.email || "",
});

export const VendorSelect = buildEntitySelect({
  queryKey: "vendors-list",
  endpoint: "/finance/vendors?limit=500",
  defaultLabel: "المورد",
  defaultPlaceholder: "اختر المورد",
  searchPlaceholder: "ابحث عن مورد...",
  createTitle: "إضافة مورد جديد",
  createLabel: "+ مورد جديد",
  createApiPath: "/finance/vendors",
  createFields: [
    { key: "name", label: "اسم المورد", required: true },
    { key: "taxNumber", label: "الرقم الضريبي" },
    { key: "phone", label: "الهاتف" },
  ],
  getName: (r) => r?.name || `#${r?.id}`,
  getSublabel: (r) => r?.taxNumber || "",
});

export const SupplierSelect = buildEntitySelect({
  queryKey: "suppliers-list",
  endpoint: "/warehouse/suppliers",
  defaultLabel: "المورد",
  defaultPlaceholder: "اختر المورد",
  searchPlaceholder: "ابحث عن مورد...",
  createTitle: "إضافة مورد جديد",
  createLabel: "+ مورد جديد",
  createApiPath: "/warehouse/suppliers",
  createFields: [
    { key: "name", label: "اسم المورد", required: true },
    { key: "phone", label: "الهاتف" },
  ],
  getName: (r) => r?.name || `#${r?.id}`,
});

export const DriverSelect = buildEntitySelect({
  queryKey: "drivers-list",
  endpoint: "/fleet/drivers?limit=500",
  defaultLabel: "السائق",
  defaultPlaceholder: "اختر السائق",
  searchPlaceholder: "ابحث عن سائق...",
  createTitle: "إضافة سائق جديد",
  createLabel: "+ سائق جديد",
  createApiPath: "/fleet/drivers",
  createFields: [
    { key: "name", label: "اسم السائق", required: true },
    { key: "phone", label: "الهاتف" },
    { key: "licenseNumber", label: "رقم الرخصة" },
  ],
  getName: (r) => r?.name || `#${r?.id}`,
  getSublabel: (r) => r?.licenseNumber || r?.phone || "",
});

export const BranchSelect = buildEntitySelect({
  queryKey: "branches-list",
  endpoint: "/settings/branches",
  defaultLabel: "الفرع",
  defaultPlaceholder: "اختر الفرع",
  searchPlaceholder: "ابحث عن فرع...",
  createTitle: "إضافة فرع جديد",
  createLabel: "+ فرع جديد",
  createApiPath: "/settings/branches",
  createFields: [
    { key: "name", label: "اسم الفرع", required: true },
    { key: "city", label: "المدينة" },
  ],
  getName: (r) => r?.name || `#${r?.id}`,
  getSublabel: (r) => r?.city || "",
});

export const DepartmentSelect = buildEntitySelect({
  queryKey: "departments-list",
  endpoint: "/settings/departments",
  defaultLabel: "القسم",
  defaultPlaceholder: "اختر القسم",
  searchPlaceholder: "ابحث عن قسم...",
  createTitle: "إضافة قسم جديد",
  createLabel: "+ قسم جديد",
  createApiPath: "/settings/departments",
  createFields: [
    { key: "name", label: "اسم القسم", required: true },
  ],
  getName: (r) => r?.name || `#${r?.id}`,
});

export const ProjectSelect = buildEntitySelect({
  queryKey: "projects-list",
  endpoint: "/projects?limit=500",
  defaultLabel: "المشروع",
  defaultPlaceholder: "اختر المشروع",
  searchPlaceholder: "ابحث عن مشروع...",
  createTitle: "إضافة مشروع جديد",
  createLabel: "+ مشروع جديد",
  createApiPath: "/projects",
  createFields: [
    { key: "name", label: "اسم المشروع", required: true },
    { key: "code", label: "رمز المشروع" },
  ],
  getName: (r) => r?.name || r?.title || `#${r?.id}`,
  getSublabel: (r) => r?.code || "",
});

export const AccountSelect = buildEntitySelect({
  queryKey: "chart-of-accounts",
  endpoint: "/finance/accounts?limit=500",
  defaultLabel: "الحساب",
  defaultPlaceholder: "اختر الحساب",
  searchPlaceholder: "ابحث عن حساب (اسم أو رقم)...",
  createTitle: "إضافة حساب جديد",
  createLabel: "+ حساب جديد",
  createApiPath: "/finance/accounts",
  createFields: [
    { key: "code", label: "رقم الحساب", required: true },
    { key: "name", label: "اسم الحساب", required: true },
  ],
  getValueField: "code",
  getName: (r) => r?.name ? `${r.code} - ${r.name}` : r?.code || `#${r?.id}`,
  getSublabel: (r) => r?.type || "",
});

// #1715 (module review) — shared variants so the JE + tax/WHT forms stop
// hand-rolling account dropdowns:
//   PostingAccountSelect — postable accounts only (manual-journal lines), by code.
//   AccountIdSelect      — emits the account ID (FK), for forms that store accountId.
export const PostingAccountSelect = buildEntitySelect({
  queryKey: "accounts-posting",
  endpoint: "/finance/accounts?postingOnly=true",
  defaultLabel: "الحساب",
  defaultPlaceholder: "اختر الحساب",
  searchPlaceholder: "ابحث عن حساب (اسم أو رقم)...",
  createTitle: "إضافة حساب جديد",
  createLabel: "+ حساب جديد",
  createApiPath: "/finance/accounts",
  createFields: [
    { key: "code", label: "رقم الحساب", required: true },
    { key: "name", label: "اسم الحساب", required: true },
  ],
  getValueField: "code",
  getName: (r) => r?.name ? `${r.code} - ${r.name}` : r?.code || `#${r?.id}`,
  getSublabel: (r) => r?.type || "",
});

export const AccountIdSelect = buildEntitySelect({
  queryKey: "chart-of-accounts",
  endpoint: "/finance/accounts?limit=500",
  defaultLabel: "الحساب",
  defaultPlaceholder: "اختر الحساب",
  searchPlaceholder: "ابحث عن حساب (اسم أو رقم)...",
  createTitle: "إضافة حساب جديد",
  createLabel: "+ حساب جديد",
  createApiPath: "/finance/accounts",
  createFields: [
    { key: "code", label: "رقم الحساب", required: true },
    { key: "name", label: "اسم الحساب", required: true },
  ],
  getValueField: "id",
  getName: (r) => r?.name ? `${r.code} - ${r.name}` : r?.code || `#${r?.id}`,
  getSublabel: (r) => r?.type || "",
});

export const VehicleSelect = buildEntitySelect({
  queryKey: "fleet-list",
  // Must hit the real vehicles list/create route. `/fleet` has no root GET,
  // so the picker silently returned nothing — newly-added vehicles (and all
  // others) never appeared in «ربط المصروف» (#1715). The fleet page and every
  // other caller use `/fleet/vehicles`; align the picker with that source.
  endpoint: "/fleet/vehicles?limit=500",
  defaultLabel: "المركبة",
  defaultPlaceholder: "اختر المركبة",
  searchPlaceholder: "ابحث عن مركبة...",
  createTitle: "إضافة مركبة جديدة",
  createLabel: "+ مركبة جديدة",
  createApiPath: "/fleet/vehicles",
  createFields: [
    { key: "plateNumber", label: "رقم اللوحة", required: true },
    { key: "make", label: "الشركة المصنعة" },
    { key: "model", label: "الموديل" },
  ],
  getName: (r) => r?.plateNumber ? `${r.plateNumber}${r.make ? ` - ${r.make}` : ""}` : `#${r?.id}`,
  getSublabel: (r) => r?.model || "",
});
