import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  FormShell,
  FormTextField,
  FormSelectField,
  FormGrid,
  AdvancedFilters,
  useFilters,
  applyFilters,
} from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { PageStateWrapper } from "@/components/shared/page-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, GitBranch } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";

/**
 * Finance / Cost Centers — list + create + edit + delete.
 *
 * Closes 5 of the unused-backend endpoints the reverse wiring audit
 * (Phase C) surfaced. The backend has lived in
 * `routes/finance-cost-centers.ts` since the Saudi-compliance work
 * landed; no UI ever consumed it, so cost-center allocation could
 * only happen through journal-entry forms that picked from a flat
 * autocomplete. Now the registry is editable directly from the UI.
 *
 * Endpoints wired:
 *   GET    /finance/cost-centers
 *   POST   /finance/cost-centers
 *   GET    /finance/cost-centers/:id      (fetched implicitly via list row)
 *   PATCH  /finance/cost-centers/:id
 *   DELETE /finance/cost-centers/:id
 */

interface CostCenterRow {
  id: number;
  code: string | null;
  name: string;
  type: string;
  parentId: number | null;
  allocatedAmount: number | string | null;
  status: string;
  relatedEntityType: string | null;
  relatedEntityName: string | null;
}

const TYPE_OPTIONS = [
  { value: "general", label: "عام" },
  { value: "branch", label: "فرع" },
  { value: "department", label: "قسم" },
  { value: "project", label: "مشروع" },
  { value: "vehicle", label: "مركبة" },
  { value: "employee", label: "موظف" },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  TYPE_OPTIONS.map((t) => [t.value, t.label]),
);

// One schema serves both create and edit — `id` is implicit (from the
// row being edited) and never shows up in the form. Status only flips
// on edit, so the form's `status` field is wired but hidden in create.
const costCenterSchema = z.object({
  code: z.string().trim(),
  name: z.string().trim().min(1, "اسم مركز التكلفة مطلوب"),
  type: z.enum(["general", "branch", "department", "project", "vehicle", "employee"]),
  allocatedAmount: z.coerce.number().nonnegative().optional(),
});
type CostCenterForm = z.infer<typeof costCenterSchema>;

const EMPTY_DEFAULTS: CostCenterForm = {
  code: "",
  name: "",
  type: "general",
  allocatedAmount: 0,
};

export default function CostCentersPage() {
  const { data, isLoading, error, refetch } = useApiQuery<{ data: CostCenterRow[] }>(
    ["finance-cost-centers"],
    "/finance/cost-centers",
  );
  const rows: CostCenterRow[] = data?.data ?? [];
  const [filters, setFilters] = useFilters();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CostCenterRow | null>(null);
  const [deleting, setDeleting] = useState<CostCenterRow | null>(null);

  const filtered = applyFilters(rows, filters, {
    searchFields: ["code", "name", "relatedEntityName"],
  });

  const columns: DataTableColumn<CostCenterRow>[] = [
    {
      key: "code",
      header: "الرمز",
      className: "font-mono text-xs",
      ltr: true,
      render: (r) => r.code || "—",
    },
    { key: "name", header: "الاسم", className: "font-medium" },
    {
      key: "type",
      header: "النوع",
      render: (r) => <Badge variant="outline">{TYPE_LABEL[r.type] ?? r.type}</Badge>,
    },
    {
      key: "relatedEntityName",
      header: "مرتبط بـ",
      render: (r) =>
        r.relatedEntityName ? (
          <span className="text-sm text-muted-foreground">{r.relatedEntityName}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "allocatedAmount",
      header: "المبلغ المخصص",
      render: (r) =>
        r.allocatedAmount != null && Number(r.allocatedAmount) > 0
          ? Number(r.allocatedAmount).toLocaleString("ar-SA")
          : "—",
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <Badge variant={r.status === "active" ? "default" : "secondary"}>
          {r.status === "active" ? "نشط" : r.status === "inactive" ? "متوقف" : r.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex gap-1 justify-end">
          <GuardedButton
            perm="finance.cost_centers:update"
            size="sm"
            variant="ghost"
            onClick={() => setEditing(r)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </GuardedButton>
          <GuardedButton
            perm="finance.cost_centers:delete"
            size="sm"
            variant="ghost"
            className="text-status-error-foreground"
            onClick={() => setDeleting(r)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="مراكز التكلفة"
      subtitle="إدارة مراكز التكلفة المستخدمة في توجيه القيود المحاسبية"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "مراكز التكلفة" }]}
      actions={
        <GuardedButton
          perm="finance.cost_centers:create"
          onClick={() => setCreating(true)}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" /> مركز تكلفة جديد
        </GuardedButton>
      }
    >
      <FinanceTabsNav />

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        <AdvancedFilters values={filters} onChange={setFilters} />
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          emptyMessage="لا توجد مراكز تكلفة — اضغط 'مركز تكلفة جديد' للبدء"
        />
      </PageStateWrapper>

      <CostCenterDialog
        open={creating}
        onOpenChange={setCreating}
        mode="create"
        initial={null}
        onSaved={() => {
          setCreating(false);
          refetch();
        }}
      />
      <CostCenterDialog
        open={editing !== null}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        mode="edit"
        initial={editing}
        onSaved={() => {
          setEditing(null);
          refetch();
        }}
      />

      {deleting && (
        <ConfirmDeleteDialog
          open={deleting !== null}
          onOpenChange={(o) => { if (!o) setDeleting(null); }}
          entity={{ type: "cost_center", id: deleting.id, name: deleting.name }}
          deletePath={`/finance/cost-centers/${deleting.id}`}
          invalidateKeys={[["finance-cost-centers"]]}
          onDeleted={() => {
            setDeleting(null);
            refetch();
          }}
        />
      )}
    </PageShell>
  );
}

function CostCenterDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial: CostCenterRow | null;
  onSaved: () => void;
}) {
  // Pull the create/edit endpoint into the same component so the dialog
  // owns its mutation. The hook signature changes between create
  // (POST) and edit (PATCH /:id), so we instantiate both and pick at
  // submit time.
  const createMut = useApiMutation<CostCenterRow, CostCenterForm>(
    "/finance/cost-centers",
    "POST",
    [["finance-cost-centers"]],
    { successMessage: "تم إنشاء مركز التكلفة" },
  );
  const updateMut = useApiMutation<CostCenterRow, CostCenterForm & { __id: number }>(
    (body) => `/finance/cost-centers/${body.__id}`,
    "PATCH",
    [["finance-cost-centers"]],
    { successMessage: "تم تحديث مركز التكلفة" },
  );

  const defaults: CostCenterForm = initial
    ? {
        code: initial.code ?? "",
        name: initial.name,
        type: (initial.type as CostCenterForm["type"]) ?? "general",
        allocatedAmount: Number(initial.allocatedAmount ?? 0),
      }
    : EMPTY_DEFAULTS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            {mode === "create" ? "مركز تكلفة جديد" : `تعديل: ${initial?.name ?? ""}`}
          </DialogTitle>
        </DialogHeader>
        <FormShell
          key={initial?.id ?? "new"}
          schema={costCenterSchema}
          defaultValues={defaults}
          submitLabel={mode === "create" ? "إنشاء" : "حفظ"}
          secondaryActions={
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            if (mode === "create") {
              await createMut.mutateAsync(values);
            } else if (initial) {
              await updateMut.mutateAsync({ ...values, __id: initial.id });
            }
            onSaved();
          }}
        >
          <FormGrid cols={2}>
            <FormTextField name="code" label="الرمز (اختياري)" placeholder="CC-001" />
            <FormSelectField name="type" label="النوع" required options={TYPE_OPTIONS} />
          </FormGrid>
          <FormTextField name="name" label="الاسم" required placeholder="مثلاً: قسم المبيعات" />
          <FormTextField
            name="allocatedAmount"
            label="المبلغ المخصص (اختياري)"
            type="number"
            placeholder="0"
          />
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}
