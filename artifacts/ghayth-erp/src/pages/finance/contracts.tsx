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
  FormDateField,
  FormTextareaField,
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
import { Plus, Pencil, Trash2, FileSignature, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { VendorSelect } from "@/components/shared/entity-selects";
import { useFormContext } from "react-hook-form";

/**
 * Finance / Vendor Contracts — list + create + edit + delete.
 *
 * Phase D / Finance gap #4. Closes 5 unused-backend endpoints:
 *   GET    /finance/contracts
 *   POST   /finance/contracts
 *   GET    /finance/contracts/:id
 *   PATCH  /finance/contracts/:id
 *   DELETE /finance/contracts/:id
 *
 * Why this matters: vendor contracts (maintenance, supply,
 * advisory) drive a chain of business rules — purchase orders
 * routed against an active contract bypass extra approvals,
 * expired contracts trigger renewal reminders, contract value
 * vs. PO total feeds the budget-vs-commitment dashboard. The
 * backend has had `vendor_contracts` since FIN-019 but the UI
 * never shipped, so contracts were maintained in Excel.
 *
 * Filter by status (active / expired / terminated / pending) +
 * by vendor (via the embedded VendorSelect in the dialog).
 * Expiry-soon highlight in the table puts ≤30-day renewals at
 * the top of mind.
 */

interface VendorContract {
  id: number;
  vendorId: number;
  vendorName: string | null;
  title: string;
  startDate: string | null;
  endDate: string;
  status: "active" | "expired" | "terminated" | "pending";
  contractValue: number | string | null;
  currency: string | null;
  notes: string | null;
}

const STATUS_OPTIONS = [
  { value: "active", label: "نشط" },
  { value: "pending", label: "قيد التفعيل" },
  { value: "expired", label: "منتهي" },
  { value: "terminated", label: "مُلغى" },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label]),
);

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  pending: "outline",
  expired: "destructive",
  terminated: "secondary",
};

const contractSchema = z.object({
  vendorId: z.coerce.number().int().positive("اختر المورد"),
  title: z.string().trim().min(1, "عنوان العقد مطلوب").max(500),
  startDate: z.string().optional(),
  endDate: z.string().min(1, "تاريخ النهاية مطلوب"),
  status: z.enum(["active", "expired", "terminated", "pending"]),
  contractValue: z.coerce.number().nonnegative().optional(),
  currency: z.string().length(3),
  notes: z.string().optional(),
});
type ContractForm = z.infer<typeof contractSchema>;

const today = () => new Date().toISOString().slice(0, 10);
const isExpiringSoon = (endDate: string): boolean => {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  return end - now < 30 * 24 * 60 * 60 * 1000 && end > now;
};

export default function VendorContractsPage() {
  const { data, isLoading, error, refetch } = useApiQuery<{ data: VendorContract[] }>(
    ["finance-vendor-contracts"],
    "/finance/contracts",
  );
  const rows: VendorContract[] = data?.data ?? [];
  const [filters, setFilters] = useFilters();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<VendorContract | null>(null);
  const [deleting, setDeleting] = useState<VendorContract | null>(null);

  const filtered = applyFilters(rows, filters, {
    searchFields: ["title", "vendorName", "notes"],
    statusField: "status",
  });

  const columns: DataTableColumn<VendorContract>[] = [
    {
      key: "title",
      header: "عنوان العقد",
      className: "font-medium",
      render: (r) => (
        <div className="flex items-center gap-2">
          <span>{r.title}</span>
          {r.status === "active" && isExpiringSoon(r.endDate) && (
            <AlertTriangle
              className="h-3.5 w-3.5 text-status-warning-foreground"
              aria-label="ينتهي خلال 30 يوماً"
            />
          )}
        </div>
      ),
    },
    {
      key: "vendorName",
      header: "المورد",
      render: (r) => r.vendorName ?? `مورد #${r.vendorId}`,
    },
    {
      key: "startDate",
      header: "البداية",
      render: (r) => (r.startDate ? formatDateAr(r.startDate) : "—"),
    },
    {
      key: "endDate",
      header: "النهاية",
      render: (r) => (
        <span className={isExpiringSoon(r.endDate) && r.status === "active"
          ? "text-status-warning-foreground font-semibold"
          : ""}>
          {formatDateAr(r.endDate)}
        </span>
      ),
    },
    {
      key: "contractValue",
      header: "قيمة العقد",
      render: (r) =>
        r.contractValue != null && Number(r.contractValue) > 0 ? (
          <span className="font-mono">
            {formatCurrency(Number(r.contractValue))} {r.currency ?? ""}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
          {STATUS_LABEL[r.status] ?? r.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex gap-1 justify-end">
          <GuardedButton
            perm="finance.contracts:update"
            size="sm"
            variant="ghost"
            onClick={() => setEditing(r)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </GuardedButton>
          <GuardedButton
            perm="finance.contracts:delete"
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

  const stats = {
    active: rows.filter((r) => r.status === "active").length,
    expiringSoon: rows.filter((r) => r.status === "active" && isExpiringSoon(r.endDate)).length,
    expired: rows.filter((r) => r.status === "expired").length,
  };

  return (
    <PageShell
      title="عقود الموردين"
      subtitle="إدارة العقود التجارية مع الموردين والتجديدات السنوية"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "عقود الموردين" }]}
      actions={
        <GuardedButton
          perm="finance.contracts:create"
          onClick={() => setCreating(true)}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" /> عقد جديد
        </GuardedButton>
      }
    >
      <FinanceTabsNav />

      {stats.expiringSoon > 0 && (
        <div className="flex items-center gap-2 p-3 border border-status-warning-surface bg-status-warning-surface/30 rounded">
          <AlertTriangle className="h-4 w-4 text-status-warning-foreground shrink-0" />
          <span className="text-sm text-status-warning-foreground">
            {stats.expiringSoon} عقد نشط ينتهي خلال 30 يوماً — يلزم التجديد أو الإنهاء.
          </span>
        </div>
      )}

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        <AdvancedFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
        />
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          emptyMessage="لا توجد عقود — اضغط 'عقد جديد' للبدء"
        />
      </PageStateWrapper>

      <ContractDialog
        open={creating}
        onOpenChange={setCreating}
        mode="create"
        initial={null}
        onSaved={() => {
          setCreating(false);
          refetch();
        }}
      />
      <ContractDialog
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
          entity={{ type: "vendor_contract", id: deleting.id, name: deleting.title }}
          deletePath={`/finance/contracts/${deleting.id}`}
          invalidateKeys={[["finance-vendor-contracts"]]}
          onDeleted={() => {
            setDeleting(null);
            refetch();
          }}
        />
      )}
    </PageShell>
  );
}

function ContractDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial: VendorContract | null;
  onSaved: () => void;
}) {
  const createMut = useApiMutation<{ data: VendorContract }, ContractForm>(
    "/finance/contracts",
    "POST",
    [["finance-vendor-contracts"]],
    { successMessage: "تم إنشاء العقد" },
  );
  const updateMut = useApiMutation<{ data: VendorContract }, ContractForm & { __id: number }>(
    (b) => `/finance/contracts/${b.__id}`,
    "PATCH",
    [["finance-vendor-contracts"]],
    { successMessage: "تم تحديث العقد" },
  );

  const defaults: ContractForm = initial
    ? {
        vendorId: initial.vendorId,
        title: initial.title,
        startDate: initial.startDate ?? "",
        endDate: initial.endDate.split("T")[0] ?? "",
        status: initial.status,
        contractValue: Number(initial.contractValue ?? 0),
        currency: initial.currency ?? "SAR",
        notes: initial.notes ?? "",
      }
    : {
        vendorId: 0,
        title: "",
        startDate: today(),
        endDate: "",
        status: "active" as const,
        contractValue: 0,
        currency: "SAR",
        notes: "",
      };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-4 w-4" />
            {mode === "create" ? "عقد جديد" : `تعديل: ${initial?.title ?? ""}`}
          </DialogTitle>
        </DialogHeader>
        <FormShell
          key={initial?.id ?? "new"}
          schema={contractSchema}
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
          <VendorPicker />
          <FormTextField name="title" label="عنوان العقد" required placeholder="مثلاً: عقد صيانة سنوي" />
          <FormGrid cols={2}>
            <FormDateField name="startDate" label="تاريخ البداية" />
            <FormDateField name="endDate" label="تاريخ النهاية" required />
          </FormGrid>
          <FormGrid cols={3}>
            <FormTextField name="contractValue" label="قيمة العقد" type="number" />
            <FormSelectField
              name="currency"
              label="العملة"
              options={[
                { value: "SAR", label: "SAR" },
                { value: "USD", label: "USD" },
                { value: "EUR", label: "EUR" },
                { value: "AED", label: "AED" },
              ]}
            />
            <FormSelectField name="status" label="الحالة" required options={STATUS_OPTIONS} />
          </FormGrid>
          <FormTextareaField name="notes" label="ملاحظات" rows={3} />
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

// VendorSelect from entity-selects wraps the searchable picker that
// already exists in the codebase. RHF binding via useFormContext +
// setValue keeps the value in sync with the rest of the form state.
function VendorPicker() {
  const { watch, setValue, formState } = useFormContext<ContractForm>();
  const vendorId = watch("vendorId");
  const err = formState.errors.vendorId?.message;
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        المورد <span className="text-status-error-foreground">*</span>
      </label>
      <VendorSelect
        value={vendorId ? String(vendorId) : ""}
        onChange={(v) => setValue("vendorId", Number(v) || 0, { shouldDirty: true })}
        placeholder="ابحث عن مورد..."
      />
      {err && <p className="text-xs text-status-error-foreground">{String(err)}</p>}
    </div>
  );
}
