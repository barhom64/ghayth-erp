import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { useLocation } from "wouter";
import { ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { FormShell, FormTextField } from "@workspace/ui-core";

/**
 * The contract every embedded create form fulfils so it can be hosted inside
 * the unified create drawer. The form owns its own state / validation /
 * mutation / audit-event side-effects (server-side), so an inline create is
 * IDENTICAL to a full-page create — no truncated quick-add ("لا كيان نصف منشأ").
 */
export interface EmbeddedCreateFormProps {
  /** Called with the freshly-created row after a successful save. */
  onCreated: (created: any) => void;
  /** Called when the operator cancels (إلغاء). */
  onCancel: () => void;
}

/** Field descriptor for the generic (field-driven) create form — the unified
 *  successor to the retired QuickCreateDialog, for entities without a
 *  registered full form. */
export interface GenericCreateField {
  key: string;
  label: string;
  required?: boolean;
  type?: string;
}
/** Config for the generic create form, hosted inside the SAME unified drawer. */
export interface GenericCreateConfig {
  title: string;
  fields: GenericCreateField[];
  apiPath: string;
  invalidateKey: string;
}

/**
 * Entity kinds that have a registered FULL embedded create form. Extend this
 * union — and the registry below — one entry per migration batch, inside the
 * owner module. Selectors opt in via `EntitySelectConfig.createEntityKind`.
 */
export type EntityKind = "department" | "branch" | "project" | "client" | "driver" | "vehicle" | "account" | "vendor" | "cost-center" | "employee" | "building" | "property-owner" | "unit";

interface RegistryEntry {
  /** Drawer header (Arabic, user-facing). */
  title: string;
  /** The full create-form body, lazy-loaded only when its drawer opens. */
  Form: LazyExoticComponent<ComponentType<EmbeddedCreateFormProps>>;
  /**
   * Verified route of the standalone full create page, if one exists. When set,
   * the drawer offers «فتح الصفحة الكاملة» for operators who want the wider
   * surface. Omitted for entities managed inside a tab/list (no create route),
   * so the link is never dead.
   */
  fullPagePath?: string;
}

/**
 * Registry of the unified create forms, keyed by entity kind. Each form is
 * code-split via `React.lazy` so a host form that never opens the drawer
 * pays nothing for the registered bodies.
 */
const ENTITY_CREATE_FORMS: Record<EntityKind, RegistryEntry> = {
  department: {
    title: "إضافة قسم جديد",
    Form: lazy(() =>
      import("@/pages/settings/department-form").then((m) => ({
        default: m.DepartmentForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  branch: {
    title: "إضافة فرع جديد",
    Form: lazy(() =>
      import("@/pages/settings/branch-form").then((m) => ({
        default: m.BranchForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  project: {
    title: "مشروع جديد",
    fullPagePath: "/projects/create",
    Form: lazy(() =>
      import("@/pages/create/project-create-form").then((m) => ({
        default: m.ProjectCreateForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  client: {
    title: "إضافة عميل جديد",
    fullPagePath: "/clients/create",
    Form: lazy(() =>
      import("@/pages/create/client-create-form").then((m) => ({
        default: m.ClientCreateForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  driver: {
    title: "إضافة سائق جديد",
    fullPagePath: "/fleet/drivers/create",
    Form: lazy(() =>
      import("@/pages/create/fleet/driver-create-form").then((m) => ({
        default: m.DriverCreateForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  vehicle: {
    title: "إضافة مركبة جديدة",
    fullPagePath: "/fleet/vehicles/create",
    Form: lazy(() =>
      import("@/pages/create/fleet/vehicle-create-form").then((m) => ({
        default: m.VehicleCreateForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  account: {
    title: "إضافة حساب جديد",
    fullPagePath: "/finance/accounts/create",
    Form: lazy(() =>
      import("@/pages/create/finance/account-create-form").then((m) => ({
        default: m.AccountCreateForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  vendor: {
    title: "إضافة مورد جديد",
    fullPagePath: "/finance/vendors/create",
    Form: lazy(() =>
      import("@/pages/create/finance/vendor-create-form").then((m) => ({
        default: m.VendorCreateForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  "cost-center": {
    title: "إضافة مركز تكلفة جديد",
    Form: lazy(() =>
      import("@/pages/finance/cost-center-form").then((m) => ({
        default: m.CostCenterForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  employee: {
    title: "إضافة موظف جديد",
    fullPagePath: "/employees/create",
    Form: lazy(() =>
      import("@/pages/create/employee-create-form").then((m) => ({
        default: m.EmployeeCreateDrawerForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  building: {
    title: "إضافة مبنى جديد",
    fullPagePath: "/properties/buildings/create",
    Form: lazy(() =>
      import("@/pages/create/properties/building-form").then((m) => ({
        default: m.BuildingForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  "property-owner": {
    title: "إضافة مالك عقار",
    fullPagePath: "/properties/owners/create",
    Form: lazy(() =>
      import("@/pages/create/properties/owner-form").then((m) => ({
        default: m.OwnerForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  unit: {
    title: "إضافة وحدة عقارية",
    fullPagePath: "/properties/create",
    Form: lazy(() =>
      import("@/pages/create/properties/unit-form").then((m) => ({
        default: m.UnitForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
};

/**
 * Generic field-driven create form (absorbs the retired QuickCreateDialog):
 * same FormShell + zod-from-fields + mutation, but hosted inside the unified
 * drawer so there is ONE create surface (دستور §15/§5). Fulfils the same
 * EmbeddedCreateFormProps contract as the registered forms.
 */
function GenericCreateForm({
  config,
  onCreated,
  onCancel,
}: { config: GenericCreateConfig } & EmbeddedCreateFormProps) {
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, any>>(config.apiPath, "POST", [[config.invalidateKey]]);
  const schemaShape: Record<string, z.ZodString> = {};
  const defaults: Record<string, string> = {};
  for (const f of config.fields) {
    const s = z.string().trim();
    schemaShape[f.key] = f.required ? s.min(1, "مطلوب") : s;
    defaults[f.key] = "";
  }
  const schema = z.object(schemaShape);
  return (
    <FormShell
      schema={schema as unknown as z.ZodType<Record<string, string>>}
      defaultValues={defaults}
      submitLabel={createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}
      secondaryActions={
        <Button type="button" variant="outline" onClick={onCancel}>إلغاء</Button>
      }
      onSubmit={(values) => {
        // #2134 — drop untouched optional fields instead of sending "".
        const payload = Object.fromEntries(
          Object.entries(values).filter(([, v]) => String(v ?? "").trim() !== ""),
        );
        createMut.mutate(payload, {
          onSuccess: (data: any) => onCreated(data),
          onError: (err: any) =>
            toast({ variant: "destructive", title: "خطأ في الإنشاء", description: err?.fix ?? err?.message }),
        });
      }}
    >
      {config.fields.map((field) => (
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
  );
}

export interface AllowCreateDrawerProps {
  /** Registered entity to create with its FULL form. Omit when using genericConfig. */
  kind?: EntityKind;
  /** Generic field-driven create for entities without a registered full form. */
  genericConfig?: GenericCreateConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bubbles the created row up; the drawer closes itself afterwards. */
  onCreated: (created: any) => void;
  /**
   * Optional context line under the header (e.g. «لاستخدامه في الفاتورة
   * الحالية») so the operator knows why they are creating this entity now.
   */
  contextLabel?: string;
}

/**
 * Generalised "create-in-drawer" host. When a selector's "+ جديد" action
 * fires, this opens a Sheet that mounts the FULL unified create form for the
 * chosen entity; on save it returns the new row to the parent (which selects
 * it) and closes. Hosts either a registered full form (by `kind`) or a generic
 * field-driven form (`genericConfig`); the truncated `QuickCreateDialog` is
 * retired — see docs/finance/FINANCE_PRODUCTSELECT_AND_ALLOWCREATE_DRAWER_PLAN.md.
 */
export function AllowCreateDrawer({ kind, genericConfig, open, onOpenChange, onCreated, contextLabel }: AllowCreateDrawerProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const entry = kind ? ENTITY_CREATE_FORMS[kind] : undefined;
  if (!entry && !genericConfig) return null;
  const title = entry?.title ?? genericConfig!.title;
  const fullPagePath = entry?.fullPagePath;
  const Form = entry?.Form;
  const handleCreated = (created: any) => {
    toast({ title: "تم الإنشاء", description: "تم إنشاء السجل وتحديده في الحقل." });
    onCreated(created);
    onOpenChange(false);
  };
  const handleCancel = () => onOpenChange(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle>{title}</SheetTitle>
              {contextLabel && <SheetDescription className="mt-1">{contextLabel}</SheetDescription>}
            </div>
            {fullPagePath && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0 gap-1 text-xs"
                onClick={() => {
                  onOpenChange(false);
                  navigate(fullPagePath);
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                فتح الصفحة الكاملة
              </Button>
            )}
          </div>
        </SheetHeader>
        {open && (
          Form ? (
            <Suspense fallback={<LoadingSpinner />}>
              <Form onCreated={handleCreated} onCancel={handleCancel} />
            </Suspense>
          ) : (
            <GenericCreateForm config={genericConfig!} onCreated={handleCreated} onCancel={handleCancel} />
          )
        )}
      </SheetContent>
    </Sheet>
  );
}
