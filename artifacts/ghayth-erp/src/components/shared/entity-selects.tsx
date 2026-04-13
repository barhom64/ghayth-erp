import { useApiQuery } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Unified cost-center selector. All finance/purchase/journal forms must
 * use this component so that the stored value always follows the canonical
 * "{kind}-{name}" convention the backend validates against company_settings.
 *
 * Options aggregated:
 *  - فرع-{branch.name}
 *  - قسم-{department.name}
 *  - مشروع-{project.name}
 *  - عام (generic / company-wide)
 */
export interface CostCenterSelectProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
  includeNone?: boolean;
  className?: string;
}

export function CostCenterSelect({
  value,
  onChange,
  required = false,
  label = "مركز التكلفة",
  placeholder = "اختر مركز التكلفة",
  includeNone = true,
  className,
}: CostCenterSelectProps) {
  const { data: branchesData } = useApiQuery<{ data: any[] }>(["branches-list"], "/settings/branches");
  const { data: departmentsData } = useApiQuery<{ data: any[] }>(["departments-list"], "/settings/departments");
  const { data: projectsData } = useApiQuery<{ data: any[] }>(["projects-list"], "/projects");

  const branches = branchesData?.data || [];
  const departments = departmentsData?.data || [];
  const projects = projectsData?.data || [];

  return (
    <div className={className}>
      {label && (
        <Label>
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
      )}
      <Select
        value={value || "_none"}
        onValueChange={(v) => onChange(v === "_none" ? "" : v)}
      >
        <SelectTrigger className="mt-1">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {includeNone && <SelectItem value="_none">{placeholder}</SelectItem>}
          <SelectItem value="عام">عام (كل الشركة)</SelectItem>
          {branches.map((b: any) => (
            <SelectItem key={`br-${b.id}`} value={`فرع-${b.name}`}>
              فرع: {b.name}
            </SelectItem>
          ))}
          {departments.map((d: any) => (
            <SelectItem key={`dp-${d.id}`} value={`قسم-${d.name}`}>
              قسم: {d.name}
            </SelectItem>
          ))}
          {projects.map((p: any) => (
            <SelectItem key={`pj-${p.id}`} value={`مشروع-${p.name || p.title}`}>
              مشروع: {p.name || p.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Generic entity selector — all id-based dropdowns share the same API
 * so every form looks and behaves identically across the system.
 * ------------------------------------------------------------------ */
interface IdSelectProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
  allowNone?: boolean;
}

function buildIdSelect(
  queryKey: string,
  endpoint: string,
  defaultLabel: string,
  defaultPlaceholder: string,
  getName: (row: any) => string = (r) => r?.name || r?.title || `#${r?.id}`
) {
  return function EntitySelect({
    value,
    onChange,
    required = false,
    label = defaultLabel,
    placeholder = defaultPlaceholder,
    className,
    allowNone = true,
  }: IdSelectProps) {
    const { data } = useApiQuery<{ data: any[] }>([queryKey], endpoint);
    const rows = data?.data || [];
    return (
      <div className={className}>
        {label && (
          <Label>
            {label} {required && <span className="text-red-500">*</span>}
          </Label>
        )}
        <Select value={value || "_none"} onValueChange={(v) => onChange(v === "_none" ? "" : v)}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {allowNone && <SelectItem value="_none">{placeholder}</SelectItem>}
            {rows.map((r: any) => (
              <SelectItem key={r.id} value={String(r.id)}>
                {getName(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };
}

export const BranchSelect = buildIdSelect(
  "branches-list",
  "/settings/branches",
  "الفرع",
  "اختر الفرع"
);

export const DepartmentSelect = buildIdSelect(
  "departments-list",
  "/settings/departments",
  "القسم",
  "اختر القسم"
);

export const EmployeeSelect = buildIdSelect(
  "employees-list",
  "/employees",
  "الموظف",
  "اختر الموظف"
);

export const SupplierSelect = buildIdSelect(
  "suppliers-list",
  "/warehouse/suppliers",
  "المورد",
  "اختر المورد"
);

export const ClientSelect = buildIdSelect(
  "clients-list",
  "/clients",
  "العميل",
  "اختر العميل"
);

/**
 * Unified project selector. Stores the numeric project id as a string.
 */
export interface ProjectSelectProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
}

export function ProjectSelect({
  value,
  onChange,
  required = false,
  label = "المشروع",
  placeholder = "بدون مشروع",
  className,
}: ProjectSelectProps) {
  const { data: projectsData } = useApiQuery<{ data: any[] }>(["projects-list"], "/projects");
  const projects = projectsData?.data || [];

  return (
    <div className={className}>
      {label && (
        <Label>
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
      )}
      <Select value={value || "_none"} onValueChange={(v) => onChange(v === "_none" ? "" : v)}>
        <SelectTrigger className="mt-1">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none">{placeholder}</SelectItem>
          {projects.map((p: any) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.name || p.title || `مشروع #${p.id}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
