import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LoadingSpinner } from "@/components/shared/loading-error-states";

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

/**
 * Entity kinds that have a registered FULL embedded create form. Extend this
 * union — and the registry below — one entry per migration batch, inside the
 * owner module. Selectors opt in via `EntitySelectConfig.createEntityKind`.
 */
export type EntityKind = "department" | "branch" | "project" | "client" | "driver" | "vehicle" | "account" | "vendor" | "cost-center" | "employee";

interface RegistryEntry {
  /** Drawer header (Arabic, user-facing). */
  title: string;
  /** The full create-form body, lazy-loaded only when its drawer opens. */
  Form: LazyExoticComponent<ComponentType<EmbeddedCreateFormProps>>;
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
    Form: lazy(() =>
      import("@/pages/create/project-create-form").then((m) => ({
        default: m.ProjectCreateForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  client: {
    title: "إضافة عميل جديد",
    Form: lazy(() =>
      import("@/pages/create/client-create-form").then((m) => ({
        default: m.ClientCreateForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  driver: {
    title: "إضافة سائق جديد",
    Form: lazy(() =>
      import("@/pages/create/fleet/driver-create-form").then((m) => ({
        default: m.DriverCreateForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  vehicle: {
    title: "إضافة مركبة جديدة",
    Form: lazy(() =>
      import("@/pages/create/fleet/vehicle-create-form").then((m) => ({
        default: m.VehicleCreateForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  account: {
    title: "إضافة حساب جديد",
    Form: lazy(() =>
      import("@/pages/create/finance/account-create-form").then((m) => ({
        default: m.AccountCreateForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
  vendor: {
    title: "إضافة مورد جديد",
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
    Form: lazy(() =>
      import("@/pages/create/employee-create-form").then((m) => ({
        default: m.EmployeeCreateDrawerForm as ComponentType<EmbeddedCreateFormProps>,
      })),
    ),
  },
};

export interface AllowCreateDrawerProps {
  /** Which registered entity to create. */
  kind: EntityKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bubbles the created row up; the drawer closes itself afterwards. */
  onCreated: (created: any) => void;
}

/**
 * Generalised "create-in-drawer" host. When a selector's "+ جديد" action
 * fires, this opens a Sheet that mounts the FULL unified create form for the
 * chosen entity; on save it returns the new row to the parent (which selects
 * it) and closes. Replaces the truncated `QuickCreateDialog` selector by
 * selector — see docs/finance/FINANCE_PRODUCTSELECT_AND_ALLOWCREATE_DRAWER_PLAN.md.
 */
export function AllowCreateDrawer({ kind, open, onOpenChange, onCreated }: AllowCreateDrawerProps) {
  const entry = ENTITY_CREATE_FORMS[kind];
  if (!entry) return null;
  const { title, Form } = entry;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {open && (
          <Suspense fallback={<LoadingSpinner />}>
            <Form
              onCreated={(created) => {
                onCreated(created);
                onOpenChange(false);
              }}
              onCancel={() => onOpenChange(false)}
            />
          </Suspense>
        )}
      </SheetContent>
    </Sheet>
  );
}
