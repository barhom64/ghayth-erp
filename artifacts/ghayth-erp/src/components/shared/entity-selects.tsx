import { useState, useMemo, useEffect } from "react";
import { useApiQuery } from "@/lib/api";
import { SearchableSelect, SearchableSelectField, type SelectOption } from "./searchable-select";
import { FormFieldWrapper, fieldErrorClass } from "./form-field-wrapper";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AllowCreateDrawer, type EntityKind } from "./allow-create-drawer";
import { useAppContextOptional } from "@/contexts/app-context";

interface QuickCreateField {
  key: string;
  label: string;
  required?: boolean;
  type?: string;
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
  /**
   * #2134 — when set, typing in the dropdown also queries the endpoint with
   * `&search=...` (server-side) and merges the matches into the options. The
   * preloaded list is capped (e.g. /clients?limit=500 sorted by name), so an
   * entity beyond that window — like a freshly added client — was invisible
   * AND unfindable, since cmdk only filters what's already loaded.
   */
  serverSearch?: boolean;
  /**
   * When set, "+ جديد" opens the entity's registered FULL embedded create form
   * in the unified drawer (`AllowCreateDrawer`). When omitted, the same drawer
   * hosts a generic field-driven form built from `createFields`. Either way
   * there is ONE create surface (the retired `QuickCreateDialog` is gone).
   * See allow-create-drawer.tsx.
   */
  createEntityKind?: EntityKind;
  /**
   * Default value for the component's `allowCreate` prop. Defaults to true.
   * Set false for selects with NO working create endpoint (e.g.
   * EmployeeCategorySelect → no POST /org/employee-categories) so a call site
   * that forgets `allowCreate={false}` doesn't expose a "+ create" that 404s.
   */
  allowCreateDefault?: boolean;
}

/**
 * Merge picker options from the three sources, deduped by value, in priority
 * order: just-created entities first (they must appear instantly, before any
 * refetch lands — #2134 acceptance), then the preloaded window, then
 * server-side search matches. Pure — unit-tested in entity-selects.test.tsx.
 */
export function mergeEntityOptions(
  created: SelectOption[],
  base: SelectOption[],
  searchResults: SelectOption[],
): SelectOption[] {
  const seen = new Set<string>();
  const out: SelectOption[] = [];
  for (const list of [created, base, searchResults]) {
    for (const o of list) {
      if (!o.value || seen.has(o.value)) continue;
      seen.add(o.value);
      out.push(o);
    }
  }
  return out;
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
  /** Visually hide the label (sr-only) for dense inline/toolbar contexts. */
  hideLabel?: boolean;
  /** Render the picker locked (read-only). Used by BranchSelect's
   *  autoSelectOwnBranch lock; also available to any caller that needs it. */
  disabled?: boolean;
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
    // Default per-select via config.allowCreateDefault (true unless the select
    // has no working create endpoint, e.g. EmployeeCategorySelect). A call site
    // can still override explicitly.
    allowCreate = config.allowCreateDefault ?? true,
    filter,
    hideLabel,
    disabled,
  }: EntitySelectProps) {
    const [showCreate, setShowCreate] = useState(false);
    // #2134 — entities created from «+ جديد» are appended locally so they
    // show (and stay selected) the instant the dialog closes, independent of
    // the list refetch round-trip or the 500-row preload window.
    const [createdOptions, setCreatedOptions] = useState<SelectOption[]>([]);
    const [searchText, setSearchText] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    useEffect(() => {
      const t = setTimeout(() => setDebouncedSearch(searchText.trim()), 250);
      return () => clearTimeout(t);
    }, [searchText]);

    const { data, refetch } = useApiQuery<{ data: any[] }>([config.queryKey], config.endpoint);
    // #2134 — server-side search companion query: the preloaded list is a
    // capped window, so typing also asks the server (same scope injection,
    // same company filters) and the matches are merged in below.
    const searchActive = !!config.serverSearch && debouncedSearch.length >= 2;
    const searchPath = searchActive
      ? `${config.endpoint}${config.endpoint.includes("?") ? "&" : "?"}search=${encodeURIComponent(debouncedSearch)}`
      : null;
    const { data: searchData } = useApiQuery<{ data: any[] }>(
      [`${config.queryKey}-search`, debouncedSearch],
      searchPath,
      { enabled: searchActive },
    );

    let rows = data?.data || [];
    if (filter) rows = rows.filter(filter);
    let searchRows = searchData?.data || [];
    if (filter) searchRows = searchRows.filter(filter);

    const options = useMemo(() => {
      const toOption = (r: any): SelectOption => ({
        value: String(r[config.getValueField || "id"]),
        label: config.getName(r),
        sublabel: config.getSublabel?.(r),
      });
      return mergeEntityOptions(createdOptions, rows.map(toOption), searchRows.map(toOption));
    }, [rows, searchRows, createdOptions]);

    // #2134 — append + select the new entity instantly, before the refetch
    // round-trip lands. Shared by both create surfaces (drawer / dialog).
    const handleCreated = (res: any) => {
      const row = res?.data && res.data.id ? res.data : res;
      // Select by the configured value field (e.g. accounts store the code,
      // not the id) so an inline-created entity is actually selected.
      const newId = String(row?.[config.getValueField || "id"] ?? row?.id ?? "");
      if (newId) {
        setCreatedOptions((prev) => mergeEntityOptions(
          [{ value: newId, label: config.getName(row), sublabel: config.getSublabel?.(row) }],
          prev, [],
        ));
        onChange(newId);
      }
      refetch();
    };

    return (
      <>
        <SearchableSelectField
          label={label}
          required={required}
          error={error}
          hideLabel={hideLabel}
          disabled={disabled}
          options={options}
          value={value}
          onValueChange={onChange}
          placeholder={placeholder}
          searchPlaceholder={config.searchPlaceholder}
          emptyText={`لا توجد نتائج`}
          fieldClassName={className}
          onCreateNew={allowCreate && !disabled ? () => setShowCreate(true) : undefined}
          createNewLabel={config.createLabel}
          onSearchChange={config.serverSearch ? setSearchText : undefined}
        />
        {allowCreate && (
          <AllowCreateDrawer
            kind={config.createEntityKind}
            genericConfig={config.createEntityKind ? undefined : {
              title: config.createTitle,
              fields: config.createFields,
              apiPath: config.createApiPath,
              invalidateKey: config.queryKey,
            }}
            open={showCreate}
            onOpenChange={setShowCreate}
            onCreated={handleCreated}
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
  // AllowCreateDrawer: full employee form (embedded — wizard/success-view are
  // page-only; nested inline-create is disabled to avoid recursive drawers).
  createEntityKind: "employee",
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
  // #2134 — the client master can exceed the 500-row preload window (sorted
  // by name), making a newly added client invisible and unfindable in the
  // invoice form. GET /clients supports ?search= over name/email/phone.
  serverSearch: true,
  defaultLabel: "العميل",
  defaultPlaceholder: "اختر العميل",
  searchPlaceholder: "ابحث عن عميل...",
  createTitle: "إضافة عميل جديد",
  createLabel: "+ عميل جديد",
  createApiPath: "/clients",
  // AllowCreateDrawer: full client form (type/classification/source/portal
  // account…) vs the 3-field quick-add.
  createEntityKind: "client",
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
  // AllowCreateDrawer: full AP-aware vendor form (incl. WHT) vs the 3-field quick-add.
  createEntityKind: "vendor",
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
  // Warehouse suppliers and finance vendors are the SAME `suppliers` table
  // (both INSERT INTO suppliers — finance-vendors.ts:160 / warehouse.ts:1591),
  // so the quick-add opens the SAME full AP-aware vendor form (name, contact,
  // phone, email, tax number, address, payment terms, WHT) instead of the
  // stripped 2-field generic. createFields stays only as the legacy fallback.
  createEntityKind: "vendor",
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
  // AllowCreateDrawer: full driver form (KSA license identity + employee link)
  // vs the 3-field quick-add.
  createEntityKind: "driver",
  createFields: [
    { key: "name", label: "اسم السائق", required: true },
    { key: "phone", label: "الهاتف" },
    { key: "licenseNumber", label: "رقم الرخصة" },
  ],
  getName: (r) => r?.name || `#${r?.id}`,
  getSublabel: (r) => r?.licenseNumber || r?.phone || "",
});

const BranchSelectBase = buildEntitySelect({
  queryKey: "branches-list",
  endpoint: "/settings/branches",
  defaultLabel: "الفرع",
  defaultPlaceholder: "اختر الفرع",
  searchPlaceholder: "ابحث عن فرع...",
  createTitle: "إضافة فرع جديد",
  createLabel: "+ فرع جديد",
  createApiPath: "/settings/branches",
  // AllowCreateDrawer: full branch form (incl. the required companyId the
  // truncated quick-add dropped). createFields kept as fallback.
  createEntityKind: "branch",
  createFields: [
    { key: "name", label: "اسم الفرع", required: true },
    { key: "city", label: "المدينة" },
  ],
  getName: (r) => r?.name || `#${r?.id}`,
  getSublabel: (r) => r?.city || "",
});

interface BranchSelectProps extends EntitySelectProps {
  /**
   * B2 (توجيه إبراهيم) — «الفرع مقفل يختار فرعي تلقائيًا، فرع الإدخال تلقائي».
   * تفعيل اختياري لشاشات الإدخال فقط (لا المرشِّحات / الشاشات عبر-الفروع):
   *  - يُهيّئ القيمة تلقائيًّا بفرع المستخدم الفعّال (`selectedBranchId`) متى كان
   *    الحقل فارغًا.
   *  - يقفل المنتقي (read-only) متى كان للمستخدم فرع واحد متاح فقط — فلا خيار
   *    فعليًّا، والقفل يمنع إدخالًا خاطئًا على فرع لا يملكه.
   * المستخدم متعدّد الفروع يحصل على تهيئة تلقائية قابلة للتغيير (لا قفل).
   */
  autoSelectOwnBranch?: boolean;
}

export interface OwnBranchDecision {
  /** القيمة التي يجب تثبيتها تلقائيًّا (مرة واحدة)، أو null لا تفعل شيئًا. */
  autoSelectTo: string | null;
  /** اقفل المنتقي (خيار وحيد فعليًّا). */
  locked: boolean;
}

/**
 * B2 — القرار النقي خلف `autoSelectOwnBranch` (وحدة قابلة للاختبار بمعزل عن React):
 *  - معطّل ⇒ لا تهيئة ولا قفل.
 *  - الفرع الفعّال = `selectedBranchId` إن وُجد، وإلا الفرع الوحيد المتاح، وإلا «».
 *  - يُهيّئ فقط متى كان الحقل فارغًا (لا يدوس على نسخ/تعديل قائم).
 *  - يقفل فقط متى فرع واحد متاح والقيمة مُثبّتة (لا قفل عند تعدّد الفروع).
 */
export function decideOwnBranch(opts: {
  enabled?: boolean;
  value: string;
  selectedBranchId: number | null | undefined;
  branches: { id: number }[];
}): OwnBranchDecision {
  const { enabled, value, selectedBranchId, branches } = opts;
  if (!enabled) return { autoSelectTo: null, locked: false };
  const own =
    selectedBranchId != null
      ? String(selectedBranchId)
      : branches.length === 1
        ? String(branches[0].id)
        : "";
  return {
    autoSelectTo: !value && own ? own : null,
    locked: branches.length === 1 && !!value,
  };
}

export function BranchSelect({ autoSelectOwnBranch, value, onChange, disabled, ...rest }: BranchSelectProps) {
  const ctx = useAppContextOptional();
  const { autoSelectTo, locked } = decideOwnBranch({
    enabled: autoSelectOwnBranch,
    value,
    selectedBranchId: ctx?.selectedBranchId,
    branches: ctx?.branches ?? [],
  });

  useEffect(() => {
    if (autoSelectTo) onChange(autoSelectTo);
  }, [autoSelectTo, onChange]);

  return <BranchSelectBase value={value} onChange={onChange} disabled={disabled || locked} {...rest} />;
}

export const DepartmentSelect = buildEntitySelect({
  queryKey: "departments-list",
  endpoint: "/settings/departments",
  defaultLabel: "القسم",
  defaultPlaceholder: "اختر القسم",
  searchPlaceholder: "ابحث عن قسم...",
  createTitle: "إضافة قسم جديد",
  createLabel: "+ قسم جديد",
  createApiPath: "/settings/departments",
  // Pilot of the AllowCreateDrawer generalisation: "+ قسم جديد" now opens the
  // FULL department form (name + branch + parent + manager + status) in a
  // drawer, not the 1-field quick-add. `createFields` stays as the fallback
  // for any caller that hasn't been migrated.
  createEntityKind: "department",
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
  // AllowCreateDrawer: full project form (client/manager/budget/dates/description)
  // vs the 2-field quick-add (whose bogus `code` the backend ignores).
  createEntityKind: "project",
  createFields: [
    { key: "name", label: "اسم المشروع", required: true },
    { key: "code", label: "رمز المشروع" },
  ],
  getName: (r) => r?.name || r?.title || `#${r?.id}`,
  getSublabel: (r) => r?.code || "",
});

export const UnitSelect = buildEntitySelect({
  queryKey: "property-units-list",
  endpoint: "/properties/units?limit=500",
  defaultLabel: "الوحدة العقارية",
  defaultPlaceholder: "اختر الوحدة",
  searchPlaceholder: "ابحث عن وحدة...",
  createTitle: "إضافة وحدة",
  createLabel: "+ وحدة جديدة",
  createApiPath: "/properties/units",
  // B1-b (توجيه إبراهيم «أ») — «+ وحدة جديدة» يفتح النموذج الكامل (المبنى/النوع/
  // الحالة/المساحة/الغرف/الإيجار/المالك/العدادات/المرافق) عبر AllowCreateDrawer،
  // لا [رقم الوحدة] المبتور وحده.
  createEntityKind: "unit",
  createFields: [{ key: "unitNumber", label: "رقم الوحدة", required: true }],
  getName: (r) => [r?.buildingName, r?.unitNumber].filter(Boolean).join(" - ") || `#${r?.id}`,
  getSublabel: (r) => r?.unitType || r?.status || "",
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
  // AllowCreateDrawer: full chart-of-accounts form (parent/type/usage/branch)
  // vs the 2-field quick-add. Selection respects getValueField (code or id).
  createEntityKind: "account",
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
  // AllowCreateDrawer: full chart-of-accounts form (parent/type/usage/branch)
  // vs the 2-field quick-add. Selection respects getValueField (code or id).
  createEntityKind: "account",
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
  // AllowCreateDrawer: full chart-of-accounts form (parent/type/usage/branch)
  // vs the 2-field quick-add. Selection respects getValueField (code or id).
  createEntityKind: "account",
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
  // AllowCreateDrawer: full vehicle technical profile vs the 3-field quick-add.
  createEntityKind: "vehicle",
  createFields: [
    { key: "plateNumber", label: "رقم اللوحة", required: true },
    { key: "make", label: "الشركة المصنعة" },
    { key: "model", label: "الموديل" },
  ],
  getName: (r) => r?.plateNumber ? `${r.plateNumber}${r.make ? ` - ${r.make}` : ""}` : `#${r?.id}`,
  getSublabel: (r) => r?.model || "",
});

// HR-Wave-0/0.4 — JobTitleSelect: master-data picker for hr.job_titles.
// The inline `<Select>` in employees-create.tsx (line ~565) hand-rolls
// the same data source; once that form moves to the canonical scaffold
// it will use this picker. allowCreate=true lets HR coin a new title
// from inside the employee form without leaving the page, which the
// mandate's «نمط الإنشاء الداخلي الموحّد» rule requires. Backend
// endpoint is POST /employees/job-titles (authorize hr.employees:create).
export const JobTitleSelect = buildEntitySelect({
  queryKey: "job-titles-list",
  endpoint: "/employees/job-titles",
  defaultLabel: "المسمى الوظيفي",
  defaultPlaceholder: "اختر المسمى الوظيفي",
  searchPlaceholder: "ابحث عن مسمى وظيفي...",
  createTitle: "إضافة مسمى وظيفي جديد",
  createLabel: "+ مسمى وظيفي جديد",
  createApiPath: "/employees/job-titles",
  createFields: [
    { key: "name", label: "اسم المسمى", required: true },
    { key: "category", label: "الفئة" },
  ],
  getName: (r) => r?.name || `#${r?.id}`,
  getSublabel: (r) => r?.defaultRoleKey || r?.category || "",
});

// HR-Wave-0/0.4 — CostCenterMasterSelect: master-data picker for the
// `cost_centers` table (real CC id/code/name). Distinct from the
// legacy `CostCenterSelect` above, which composes synthetic «فرع/قسم/مشروع»
// labels for forms that still store free-text cost-center tags.
// Used by payroll/expense/advance forms to bind HR-touching financial
// movements to a cost center. allowCreate=true lets finance open a
// missing center from inside the form. Backend endpoint is POST
// /finance/cost-centers (authorize finance.cost_centers:create).
export const CostCenterMasterSelect = buildEntitySelect({
  queryKey: "cost-centers-list",
  endpoint: "/finance/cost-centers?limit=500",
  defaultLabel: "مركز التكلفة",
  defaultPlaceholder: "اختر مركز التكلفة",
  searchPlaceholder: "ابحث عن مركز تكلفة (اسم أو رمز)...",
  createTitle: "إضافة مركز تكلفة جديد",
  createLabel: "+ مركز تكلفة جديد",
  createApiPath: "/finance/cost-centers",
  // AllowCreateDrawer: full cost-center form (code + type + name + budget) vs
  // the 2-field quick-add.
  createEntityKind: "cost-center",
  createFields: [
    { key: "code", label: "رمز المركز", required: true },
    { key: "name", label: "اسم المركز", required: true },
  ],
  getName: (r) => r?.name ? `${r.code ?? ""}${r.code ? " - " : ""}${r.name}` : r?.code || `#${r?.id}`,
  getSublabel: (r) => r?.type || "",
});

// PR-1 (#2077) — PositionSelect: master-data picker for `positions`
// (institutional matrix). The new-employee wizard binds the user via
// `employee_assignments.positionId`. Backend: /org/positions.
export const PositionSelect = buildEntitySelect({
  queryKey: "positions-list",
  endpoint: "/org/positions",
  defaultLabel: "المنصب الإداري",
  defaultPlaceholder: "اختر المنصب",
  searchPlaceholder: "ابحث عن منصب...",
  createTitle: "إضافة منصب جديد",
  createLabel: "+ منصب جديد",
  createApiPath: "/org/positions",
  createFields: [
    { key: "positionKey", label: "مفتاح المنصب", required: true },
    { key: "labelAr", label: "الاسم بالعربية", required: true },
  ],
  getName: (r) => r?.labelAr || r?.labelEn || r?.positionKey || `#${r?.id}`,
  getSublabel: (r) => r?.level != null ? `مستوى ${r.level}` : "",
});

// PR-1 (#2077) — TeamSelect: master-data picker for `teams` (sub-unit
// within a department). The wizard binds the new employee to one team
// via `employee_team_memberships`. Backend: /org/teams.
export const TeamSelect = buildEntitySelect({
  queryKey: "teams-list",
  endpoint: "/org/teams",
  defaultLabel: "الفريق",
  defaultPlaceholder: "اختر الفريق",
  searchPlaceholder: "ابحث عن فريق...",
  createTitle: "إضافة فريق جديد",
  createLabel: "+ فريق جديد",
  createApiPath: "/org/teams",
  createFields: [
    { key: "name", label: "اسم الفريق", required: true },
  ],
  getName: (r) => r?.name || `#${r?.id}`,
  getSublabel: (r) => r?.departmentName || "",
});

// PR-1 (#2077) — CommitteeSelect: master-data picker for `committees`
// (cross-department, time-bounded). Optional binding via
// `employee_committee_memberships`. Backend: /org/committees.
export const CommitteeSelect = buildEntitySelect({
  queryKey: "committees-list",
  endpoint: "/org/committees",
  defaultLabel: "اللجنة",
  defaultPlaceholder: "اختر اللجنة",
  searchPlaceholder: "ابحث عن لجنة...",
  createTitle: "إضافة لجنة جديدة",
  createLabel: "+ لجنة جديدة",
  createApiPath: "/org/committees",
  createFields: [
    { key: "name", label: "اسم اللجنة", required: true },
    { key: "type", label: "نوع اللجنة", required: true },
  ],
  getName: (r) => r?.name || `#${r?.id}`,
  getSublabel: (r) => r?.type || "",
});

// PR-1 (#2077) — EmployeeCategorySelect: master-data picker for
// `employee_categories` (workforce type: worker / driver / manager …).
// Binds via `employee_assignments.categoryKey` (VARCHAR(40)), NOT the
// id, since the per-category attendance policy keys off the string key.
// Backend: /org/employee-categories. Quick-create disabled here — the
// 6 system categories are seeded by migration 270 and a per-company
// override needs a richer form than the generic field-driven create offers.
export const EmployeeCategorySelect = buildEntitySelect({
  queryKey: "employee-categories-list",
  endpoint: "/org/employee-categories",
  defaultLabel: "فئة الموظف",
  defaultPlaceholder: "اختر الفئة",
  searchPlaceholder: "ابحث عن فئة...",
  createTitle: "إضافة فئة موظفين",
  createLabel: "+ فئة جديدة",
  createApiPath: "/org/employee-categories",
  // لا يوجد POST /org/employee-categories (الفئات مبذورة بالهجرة) — فالإنشاء
  // معطّل افتراضيًا كي لا يظهر «+» يُرجع 404 من أي موضع استخدام.
  allowCreateDefault: false,
  createFields: [
    { key: "categoryKey", label: "مفتاح الفئة", required: true },
    { key: "labelAr", label: "الاسم بالعربية", required: true },
  ],
  getValueField: "categoryKey",
  getName: (r) => r?.labelAr || r?.labelEn || r?.categoryKey || `#${r?.id}`,
  getSublabel: (r) => r?.exemptFromAutoDeduction ? "مُعفاة من الخصم التلقائي" : "",
});

// ── كيانات جذرية كانت بلا مُحدِّد موحّد (الخطوة C) — بحث + إنشاء «+» خفيف ────────
export const UmrahAgentSelect = buildEntitySelect({
  queryKey: "umrah-agents-list",
  endpoint: "/umrah/agents",
  defaultLabel: "وكيل العمرة",
  defaultPlaceholder: "اختر الوكيل",
  searchPlaceholder: "ابحث عن وكيل...",
  createTitle: "إضافة وكيل عمرة",
  createLabel: "+ وكيل جديد",
  createApiPath: "/umrah/agents",
  createFields: [
    { key: "name", label: "اسم الوكيل", required: true },
    { key: "phone", label: "الهاتف" },
    { key: "country", label: "الدولة" },
  ],
  getName: (r) => r?.name || `#${r?.id}`,
  getSublabel: (r) => r?.country || "",
});

export const UmrahSeasonSelect = buildEntitySelect({
  queryKey: "umrah-seasons-list",
  endpoint: "/umrah/seasons",
  defaultLabel: "موسم العمرة",
  defaultPlaceholder: "اختر الموسم",
  searchPlaceholder: "ابحث عن موسم...",
  createTitle: "إضافة موسم عمرة",
  createLabel: "+ موسم جديد",
  createApiPath: "/umrah/seasons",
  createFields: [
    { key: "title", label: "اسم الموسم", required: true },
    { key: "startDate", label: "تاريخ البداية", required: true, type: "date" },
    { key: "endDate", label: "تاريخ النهاية", required: true, type: "date" },
  ],
  getName: (r) => r?.title || `#${r?.id}`,
  getSublabel: (r) => r?.startDate ? `${r.startDate}${r.endDate ? ` → ${r.endDate}` : ""}` : "",
});

export const BuildingSelect = buildEntitySelect({
  queryKey: "property-buildings-list",
  endpoint: "/properties/buildings",
  defaultLabel: "المبنى",
  defaultPlaceholder: "اختر المبنى",
  searchPlaceholder: "ابحث عن مبنى...",
  createTitle: "إضافة مبنى",
  createLabel: "+ مبنى جديد",
  createApiPath: "/properties/buildings",
  // B1-b (توجيه إبراهيم «أ») — «+ مبنى جديد» يفتح النموذج الكامل المعتمد
  // (نوع المبنى/الصك/المالك/العنوان الوطني/الإحداثيات) عبر AllowCreateDrawer،
  // لا الإضافة المبتورة [اسم، مدينة]. createFields يبقى احتياطًا.
  createEntityKind: "building",
  createFields: [
    { key: "name", label: "اسم المبنى", required: true },
    { key: "city", label: "المدينة" },
  ],
  getName: (r) => r?.name || `#${r?.id}`,
  getSublabel: (r) => r?.city || r?.address || "",
});

export const PropertyOwnerSelect = buildEntitySelect({
  queryKey: "property-owners-list",
  endpoint: "/properties/owners",
  defaultLabel: "مالك العقار",
  defaultPlaceholder: "اختر المالك",
  searchPlaceholder: "ابحث عن مالك...",
  createTitle: "إضافة مالك عقار",
  createLabel: "+ مالك جديد",
  createApiPath: "/properties/owners",
  // B1-b (توجيه إبراهيم «أ») — «+ مالك جديد» يفتح النموذج الكامل (نوع المالك/
  // الهوية/البنك/الوكالة/العنوان) عبر AllowCreateDrawer، لا [اسم، هاتف] المبتور.
  createEntityKind: "property-owner",
  createFields: [
    { key: "name", label: "اسم المالك", required: true },
    { key: "phone", label: "الهاتف" },
  ],
  getName: (r) => r?.name || `#${r?.id}`,
  getSublabel: (r) => r?.phone || "",
});
