import { useState, useMemo } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [form, setForm] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, any>>(apiPath, "POST", [[invalidateKey]]);

  const handleCreate = () => {
    const missing = fields.filter((f) => f.required && !form[f.key]?.trim()).map((f) => f.label);
    if (missing.length > 0) {
      toast({ variant: "destructive", title: `يرجى إدخال: ${missing.join("، ")}` });
      return;
    }
    createMut.mutate(form, {
      onSuccess: (data: any) => {
        onCreated?.(data);
        onOpenChange(false);
        setForm({});
        toast({ title: `تم الإنشاء بنجاح` });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "خطأ في الإنشاء", description: err?.fix ?? err?.message });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1">
              <Label className="text-sm">
                {field.label}
                {field.required && <span className="text-red-500 mr-1">*</span>}
              </Label>
              <Input
                type={field.type || "text"}
                value={form[field.key] || ""}
                onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                placeholder={field.label}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleCreate} disabled={createMut.isPending} rateLimitAware>
            {createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}
          </Button>
        </div>
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

export const VehicleSelect = buildEntitySelect({
  queryKey: "fleet-list",
  endpoint: "/fleet?limit=500",
  defaultLabel: "المركبة",
  defaultPlaceholder: "اختر المركبة",
  searchPlaceholder: "ابحث عن مركبة...",
  createTitle: "إضافة مركبة جديدة",
  createLabel: "+ مركبة جديدة",
  createApiPath: "/fleet",
  createFields: [
    { key: "plateNumber", label: "رقم اللوحة", required: true },
    { key: "make", label: "الشركة المصنعة" },
    { key: "model", label: "الموديل" },
  ],
  getName: (r) => r?.plateNumber ? `${r.plateNumber}${r.make ? ` - ${r.make}` : ""}` : `#${r?.id}`,
  getSublabel: (r) => r?.model || "",
});
