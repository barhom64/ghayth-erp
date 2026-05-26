import { useState, useMemo } from "react";
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
import { PageStateWrapper } from "@/components/shared/page-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowRightCircle, Wallet, CheckCircle } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { ClientSelect } from "@/components/shared/entity-selects";
import { SearchableSelectField } from "@/components/shared/searchable-select";
import { useFormContext } from "react-hook-form";

/**
 * Finance / Customer Advances — list + create + apply to invoice.
 *
 * Phase D / Finance gap. Closes 3 unused-backend endpoints:
 *   GET  /finance/customer-advances
 *   POST /finance/customer-advances           — receive an advance
 *   POST /finance/customer-advances/:id/apply — apply to an invoice
 *
 * Why this matters: customer advances ("دفعة مقدمة") are a
 * liability on the balance sheet (CR 2400) until the customer
 * actually issues an invoice we can apply them against, at which
 * point the liability clears and AR drops by the applied amount.
 * The backend has handled the double-entry side since FIN-CADV,
 * but with no UI ops had to either (a) post the advance as a
 * miscellaneous receipt and manually adjust later, or (b) park
 * it on the wrong account and chase reconciliation. This page
 * lets the finance team capture the advance the moment money
 * arrives and then "apply" it row-by-row as invoices come in.
 *
 * Apply dialog is constrained: it only lists OPEN invoices for
 * the same client as the advance, with the per-row remaining
 * cap shown. The backend enforces both caps server-side (against
 * the invoice's open balance and the advance's unapplied
 * amount), but doing the math client-side keeps the operator
 * from staring at a "rejected" toast.
 */

interface CustomerAdvance {
  id: number;
  ref: string;
  clientName: string | null;
  clientId?: number;
  amount: number | string;
  appliedAmount: number | string;
  remaining: number | string;
  method: string | null;
  receivedDate: string;
  status: "open" | "applied" | "cancelled" | string;
  journalId: number | null;
  createdAt: string;
}

interface OpenInvoice {
  id: number;
  ref: string;
  total: number | string;
  paidAmount: number | string;
  clientId: number;
  status: string;
}

const STATUS_OPTIONS = [
  { value: "open", label: "مفتوحة" },
  { value: "applied", label: "مُطبَّقة بالكامل" },
  { value: "cancelled", label: "ملغاة" },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label]),
);

const METHOD_OPTIONS = [
  { value: "bank_transfer", label: "حوالة بنكية" },
  { value: "cash", label: "نقدي" },
  { value: "cheque", label: "شيك" },
  { value: "card", label: "بطاقة" },
];

const METHOD_LABEL: Record<string, string> = Object.fromEntries(
  METHOD_OPTIONS.map((m) => [m.value, m.label]),
);

const createSchema = z.object({
  clientId: z.coerce.number().int().positive("اختر العميل"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون موجباً"),
  method: z.enum(["bank_transfer", "cash", "cheque", "card"]),
  reference: z.string().optional(),
  receivedDate: z.string().min(1, "تاريخ الاستلام مطلوب"),
  notes: z.string().optional(),
});
type CreateForm = z.infer<typeof createSchema>;

const applySchema = z.object({
  invoiceId: z.coerce.number().int().positive("اختر الفاتورة"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون موجباً"),
});
type ApplyForm = z.infer<typeof applySchema>;

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function CustomerAdvancesPage() {
  const { data, isLoading, error, refetch } = useApiQuery<{ data: CustomerAdvance[] }>(
    ["finance-customer-advances"],
    "/finance/customer-advances",
  );
  const rows = data?.data ?? [];
  const [filters, setFilters] = useFilters();
  const [creating, setCreating] = useState(false);
  const [applying, setApplying] = useState<CustomerAdvance | null>(null);

  const filtered = applyFilters(rows, filters, {
    searchFields: ["ref", "clientName"],
  });

  const totals = useMemo(() => {
    let open = 0;
    let applied = 0;
    let remaining = 0;
    for (const r of rows) {
      const amt = Number(r.amount) || 0;
      const app = Number(r.appliedAmount) || 0;
      open += r.status === "open" ? amt : 0;
      applied += app;
      remaining += Number(r.remaining) || amt - app;
    }
    return { open, applied, remaining };
  }, [rows]);

  const columns: DataTableColumn<CustomerAdvance>[] = [
    {
      key: "ref",
      header: "المرجع",
      className: "font-mono text-xs",
      ltr: true,
    },
    {
      key: "clientName",
      header: "العميل",
      className: "font-medium",
      render: (r) => r.clientName ?? "—",
    },
    {
      key: "amount",
      header: "المبلغ",
      render: (r) => Number(r.amount).toLocaleString("ar-SA"),
    },
    {
      key: "appliedAmount",
      header: "المُطبَّق",
      render: (r) => Number(r.appliedAmount).toLocaleString("ar-SA"),
    },
    {
      key: "remaining",
      header: "المتبقي",
      render: (r) => (
        <span
          className={
            Number(r.remaining) > 0 ? "font-semibold text-status-info-foreground" : "text-muted-foreground"
          }
        >
          {Number(r.remaining).toLocaleString("ar-SA")}
        </span>
      ),
    },
    {
      key: "method",
      header: "طريقة الاستلام",
      render: (r) => METHOD_LABEL[r.method ?? ""] ?? r.method ?? "—",
    },
    {
      key: "receivedDate",
      header: "تاريخ الاستلام",
      render: (r) => new Date(r.receivedDate).toLocaleDateString("ar-SA"),
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <Badge
          variant={
            r.status === "applied" ? "default" : r.status === "open" ? "outline" : "secondary"
          }
        >
          {STATUS_LABEL[r.status] ?? r.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) =>
        r.status === "open" && Number(r.remaining) > 0 ? (
          <GuardedButton
            perm="finance.invoices:create"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => setApplying(r)}
          >
            <ArrowRightCircle className="h-3.5 w-3.5" />
            تطبيق على فاتورة
          </GuardedButton>
        ) : null,
    },
  ];

  return (
    <PageShell
      title="الدفعات المقدمة من العملاء"
      subtitle="استلام الدفعات قبل إصدار الفواتير وتطبيقها لاحقاً على الفواتير الفعلية"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "الدفعات المقدمة" },
      ]}
      actions={
        <GuardedButton
          perm="finance.invoices:create"
          onClick={() => setCreating(true)}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" /> دفعة مقدمة جديدة
        </GuardedButton>
      }
    >
      <FinanceTabsNav />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <StatCard
          label="الرصيد المفتوح"
          value={totals.open}
          icon={<Wallet className="h-5 w-5" />}
          tone="info"
        />
        <StatCard
          label="المُطبَّق على الفواتير"
          value={totals.applied}
          icon={<CheckCircle className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="المتبقي للتطبيق"
          value={totals.remaining}
          icon={<ArrowRightCircle className="h-5 w-5" />}
          tone="warn"
        />
      </div>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        <AdvancedFilters values={filters} onChange={setFilters} />
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          emptyMessage="لا توجد دفعات مقدمة — اضغط 'دفعة مقدمة جديدة' للبدء"
        />
      </PageStateWrapper>

      <CreateAdvanceDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => {
          setCreating(false);
          refetch();
        }}
      />

      {applying && (
        <ApplyAdvanceDialog
          advance={applying}
          onOpenChange={(o) => {
            if (!o) setApplying(null);
          }}
          onApplied={() => {
            setApplying(null);
            refetch();
          }}
        />
      )}
    </PageShell>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "info" | "success" | "warn";
}) {
  const toneClass =
    tone === "info"
      ? "text-status-info-foreground bg-status-info-surface"
      : tone === "success"
        ? "text-status-success-foreground bg-status-success-surface"
        : "text-status-warning-foreground bg-status-warning-surface";
  return (
    <div className={`flex items-center gap-3 rounded-lg p-4 ${toneClass}`}>
      <div className="shrink-0">{icon}</div>
      <div className="space-y-0.5">
        <p className="text-xs">{label}</p>
        <p className="text-lg font-semibold">{value.toLocaleString("ar-SA")} ر.س</p>
      </div>
    </div>
  );
}

function CreateAdvanceDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const mut = useApiMutation<unknown, CreateForm>(
    "/finance/customer-advances",
    "POST",
    [["finance-customer-advances"]],
    { successMessage: "تم تسجيل الدفعة المقدمة" },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            دفعة مقدمة جديدة
          </DialogTitle>
        </DialogHeader>
        <FormShell
          schema={createSchema}
          defaultValues={{
            clientId: 0,
            amount: 0,
            method: "bank_transfer",
            reference: "",
            receivedDate: todayISO(),
            notes: "",
          }}
          submitLabel="تسجيل الدفعة"
          secondaryActions={
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
            onSaved();
          }}
        >
          <ClientPicker />
          <FormGrid cols={2}>
            <FormTextField name="amount" label="المبلغ" type="number" required />
            <FormSelectField
              name="method"
              label="طريقة الاستلام"
              required
              options={METHOD_OPTIONS}
            />
          </FormGrid>
          <FormGrid cols={2}>
            <FormTextField name="reference" label="رقم المرجع (اختياري)" placeholder="ADV-…" />
            <FormDateField name="receivedDate" label="تاريخ الاستلام" required />
          </FormGrid>
          <FormTextareaField name="notes" label="ملاحظات" rows={3} />
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function ClientPicker() {
  const { watch, setValue, formState } = useFormContext<CreateForm>();
  const clientId = watch("clientId");
  const err = formState.errors.clientId?.message;
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        العميل <span className="text-status-error-foreground">*</span>
      </label>
      <ClientSelect
        value={clientId ? String(clientId) : ""}
        onChange={(v) => setValue("clientId", Number(v) || 0, { shouldDirty: true, shouldValidate: true })}
        placeholder="ابحث عن عميل..."
      />
      {err && <p className="text-xs text-status-error-foreground">{String(err)}</p>}
    </div>
  );
}

function ApplyAdvanceDialog({
  advance,
  onOpenChange,
  onApplied,
}: {
  advance: CustomerAdvance;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  // Hard-pinned to the advance's client; clientId is required to
  // filter the invoice list down to invoices we are actually
  // allowed to apply against (the backend enforces the same rule
  // server-side but pre-filtering avoids a guaranteed-to-fail
  // rejection round-trip).
  const clientId = advance.clientId;
  const { data: invoicesData } = useApiQuery<{ data: OpenInvoice[] }>(
    ["finance-invoices", "open", String(clientId ?? "no-client")],
    clientId ? `/finance/invoices?clientId=${clientId}&status=open` : "/finance/invoices?status=open",
  );

  const openInvoices = useMemo(
    () =>
      (invoicesData?.data ?? []).filter((inv) => {
        const open = Number(inv.total) - Number(inv.paidAmount);
        return open > 0 && (!clientId || inv.clientId === clientId);
      }),
    [invoicesData, clientId],
  );

  const remaining = Number(advance.remaining);
  const mut = useApiMutation<unknown, ApplyForm>(
    `/finance/customer-advances/${advance.id}/apply`,
    "POST",
    [["finance-customer-advances"], ["finance-invoices"]],
    { successMessage: "تم تطبيق الدفعة" },
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightCircle className="h-4 w-4" />
            تطبيق الدفعة {advance.ref} على فاتورة
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-md bg-surface-subtle p-3 text-sm space-y-1 mb-3">
          <div>
            العميل: <span className="font-medium">{advance.clientName ?? "—"}</span>
          </div>
          <div>
            المتبقي للتطبيق:{" "}
            <span className="font-semibold text-status-info-foreground">
              {remaining.toLocaleString("ar-SA")} ر.س
            </span>
          </div>
        </div>
        <FormShell
          schema={applySchema}
          defaultValues={{ invoiceId: 0, amount: Math.min(remaining, 0) }}
          submitLabel="تطبيق"
          secondaryActions={
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
            onApplied();
          }}
        >
          <InvoicePicker invoices={openInvoices} maxAmount={remaining} />
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function InvoicePicker({ invoices, maxAmount }: { invoices: OpenInvoice[]; maxAmount: number }) {
  const { watch, setValue, formState } = useFormContext<ApplyForm>();
  const invoiceId = watch("invoiceId");
  const invoiceErr = formState.errors.invoiceId?.message;
  const amountErr = formState.errors.amount?.message;

  const selected = useMemo(
    () => invoices.find((i) => i.id === invoiceId),
    [invoices, invoiceId],
  );
  const invoiceOpen = selected
    ? Number(selected.total) - Number(selected.paidAmount)
    : 0;
  const cap = Math.min(maxAmount, invoiceOpen);

  const options = useMemo(
    () =>
      invoices.map((inv) => {
        const open = Number(inv.total) - Number(inv.paidAmount);
        return {
          value: String(inv.id),
          label: `${inv.ref} — متبقي ${open.toLocaleString("ar-SA")}`,
        };
      }),
    [invoices],
  );

  return (
    <>
      <div className="space-y-1.5">
        <SearchableSelectField
          label="الفاتورة"
          required
          options={options}
          value={invoiceId ? String(invoiceId) : ""}
          onValueChange={(v) =>
            setValue("invoiceId", Number(v) || 0, { shouldDirty: true, shouldValidate: true })
          }
          placeholder="اختر فاتورة مفتوحة..."
          searchPlaceholder="رقم الفاتورة..."
          emptyText="لا توجد فواتير مفتوحة لهذا العميل"
        />
        {invoiceErr && <p className="text-xs text-status-error-foreground">{String(invoiceErr)}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          المبلغ <span className="text-status-error-foreground">*</span>
        </label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          max={cap || undefined}
          value={watch("amount") || ""}
          onChange={(e) =>
            setValue("amount", Number(e.target.value) || 0, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          placeholder="0.00"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        {selected && (
          <p className="text-xs text-muted-foreground">
            الحد الأقصى للتطبيق على هذه الفاتورة:{" "}
            <span className="font-medium">{cap.toLocaleString("ar-SA")}</span> ر.س
          </p>
        )}
        {amountErr && <p className="text-xs text-status-error-foreground">{String(amountErr)}</p>}
      </div>
    </>
  );
}
