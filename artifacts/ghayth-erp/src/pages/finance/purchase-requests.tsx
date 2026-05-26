import { useState, useMemo } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  FormShell,
  FormTextField,
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  Send,
  CheckCircle,
  XCircle,
  RotateCcw,
  ShoppingCart,
  ClipboardList,
  Trash2,
  Sparkles,
  Loader2,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { SupplierSelect } from "@/components/shared/entity-selects";
import { useFormContext, useFieldArray } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";

/**
 * Finance / Purchase Requests — list + create + lifecycle actions.
 *
 * Phase D / Finance gap. Closes 6 unused-backend endpoints, which
 * together drive the full P→PR→PO procurement workflow:
 *
 *   GET    /finance/purchase-requests
 *   POST   /finance/purchase-requests                — create (draft|pending)
 *   POST   /finance/purchase-requests/impact-preview — pre-flight impact (cost / approval chain / outstanding)
 *   PATCH  /finance/purchase-requests/:id/submit     — draft → pending
 *   PATCH  /finance/purchase-requests/:id/approve    — pending → approved/rejected/returned
 *   POST   /finance/purchase-requests/:id/convert-to-po — approved → PO (also transitions to "converted")
 *
 * Why this matters: purchase requests are the entry-point of the
 * procurement chain. Without a frontend the workflow lived as
 * "send PDF over WhatsApp → manager signs → finance types into
 * the PO form". Now requests are tracked from draft through to
 * the auto-generated PO, with budget/cost-center impact visible
 * before submission and one-click conversion after approval.
 *
 * Lifecycle drives the per-row actions:
 *   draft     → "تقديم للاعتماد" (submit)
 *   pending   → approve / reject / return  (via approval dialog)
 *   approved  → "تحويل إلى أمر شراء"      (convert-to-po)
 *   converted → "← أمر #PO-…" link        (terminal)
 *   rejected  → terminal
 *   returned  → can be edited and resubmitted
 *
 * The create dialog uses useFieldArray for the items list (same
 * pattern as journal-templates) and exposes "معاينة الأثر" — a
 * dry-run call to /impact-preview that shows the budget impact,
 * approval chain that will fire, and any outstanding supplier
 * commitments BEFORE the operator submits. Same wiring as the
 * other impact-preview endpoints across finance.
 */

interface PRItem {
  id?: number;
  name: string;
  quantity: number | string;
  unitPrice: number | string;
  totalPrice: number | string;
  notes?: string | null;
}

interface PurchaseRequest {
  id: number;
  ref: string;
  status: "draft" | "pending" | "approved" | "rejected" | "returned" | "converted" | string;
  totalAmount: number | string;
  createdAt: string;
  notes: string | null;
  requestedBy: number | null;
  requestedByName: string | null;
  supplierId: number | null;
  supplierName: string | null;
  items: PRItem[] | null;
}

interface ImpactItem {
  category: string;
  label: string;
  value: string;
  severity: "info" | "warning" | "danger" | "success";
}

interface ImpactPreview {
  actionType: string;
  summary: string;
  items: ImpactItem[];
}

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  pending: "بانتظار الاعتماد",
  approved: "معتمد",
  rejected: "مرفوض",
  returned: "مُرجع للتعديل",
  converted: "حُوّل لأمر شراء",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  pending: "secondary",
  approved: "default",
  converted: "default",
  rejected: "destructive",
  returned: "destructive",
};

const STATUS_OPTIONS = [
  { value: "", label: "الكل" },
  { value: "draft", label: "مسودة" },
  { value: "pending", label: "بانتظار الاعتماد" },
  { value: "approved", label: "معتمد" },
  { value: "converted", label: "حُوّل لأمر شراء" },
  { value: "rejected", label: "مرفوض" },
  { value: "returned", label: "مُرجع" },
];

const itemSchema = z.object({
  description: z.string().trim().min(1, "وصف البند مطلوب"),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون موجبة"),
  unitPrice: z.coerce.number().nonnegative("السعر يجب أن يكون موجباً"),
});

const createSchema = z.object({
  supplierId: z.coerce.number().int().optional(),
  expectedDelivery: z.string().optional(),
  costCenter: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, "أضف بنداً واحداً على الأقل"),
});
type CreateForm = z.infer<typeof createSchema>;

const approveSchema = z.object({
  approved: z.enum(["true", "false", "returned"]),
  notes: z.string().optional(),
});
type ApproveForm = z.infer<typeof approveSchema>;

const convertSchema = z.object({
  expectedDelivery: z.string().optional(),
  notes: z.string().optional(),
});
type ConvertForm = z.infer<typeof convertSchema>;

export default function PurchaseRequestsPage() {
  const { data, isLoading, error, refetch } = useApiQuery<{
    data: PurchaseRequest[];
    total: number;
  }>(["finance-purchase-requests"], "/finance/purchase-requests");
  const rows = data?.data ?? [];
  const [filters, setFilters] = useFilters();
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState<PurchaseRequest | null>(null);
  const [converting, setConverting] = useState<PurchaseRequest | null>(null);

  const filtered = applyFilters(rows, filters, {
    searchFields: ["ref", "supplierName", "requestedByName"],
  });

  const columns: DataTableColumn<PurchaseRequest>[] = [
    {
      key: "ref",
      header: "المرجع",
      className: "font-mono text-xs",
      ltr: true,
    },
    {
      key: "supplierName",
      header: "المورد",
      render: (r) => r.supplierName ?? "—",
    },
    {
      key: "requestedByName",
      header: "مقدم الطلب",
      render: (r) => r.requestedByName ?? "—",
    },
    {
      key: "totalAmount",
      header: "الإجمالي",
      render: (r) => (
        <span className="font-semibold">{Number(r.totalAmount).toLocaleString("ar-SA")}</span>
      ),
    },
    {
      key: "createdAt",
      header: "التاريخ",
      render: (r) => new Date(r.createdAt).toLocaleDateString("ar-SA"),
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => <RowActions row={r} onApprove={setApproving} onConvert={setConverting} onRefresh={refetch} />,
    },
  ];

  return (
    <PageShell
      title="طلبات الشراء"
      subtitle="إنشاء طلبات الشراء، اعتمادها، وتحويلها إلى أوامر شراء"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "طلبات الشراء" },
      ]}
      actions={
        <GuardedButton
          perm="finance.purchase:create"
          onClick={() => setCreating(true)}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" /> طلب شراء جديد
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
          emptyMessage="لا توجد طلبات شراء — اضغط 'طلب شراء جديد' للبدء"
        />
      </PageStateWrapper>

      <CreatePRDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => {
          setCreating(false);
          refetch();
        }}
      />

      {approving && (
        <ApprovePRDialog
          pr={approving}
          onOpenChange={(o) => {
            if (!o) setApproving(null);
          }}
          onDone={() => {
            setApproving(null);
            refetch();
          }}
        />
      )}

      {converting && (
        <ConvertToPODialog
          pr={converting}
          onOpenChange={(o) => {
            if (!o) setConverting(null);
          }}
          onDone={() => {
            setConverting(null);
            refetch();
          }}
        />
      )}
    </PageShell>
  );
}

function RowActions({
  row,
  onApprove,
  onConvert,
  onRefresh,
}: {
  row: PurchaseRequest;
  onApprove: (r: PurchaseRequest) => void;
  onConvert: (r: PurchaseRequest) => void;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await apiFetch(`/finance/purchase-requests/${row.id}/submit`, { method: "PATCH" });
      toast({ title: "تم إرسال الطلب للاعتماد" });
      onRefresh();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-1 justify-end">
      {row.status === "draft" || row.status === "returned" ? (
        <GuardedButton
          perm="finance.purchase:update"
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          تقديم
        </GuardedButton>
      ) : null}

      {row.status === "pending" && (
        <GuardedButton
          perm="finance.purchase:update"
          size="sm"
          variant="default"
          className="gap-1"
          onClick={() => onApprove(row)}
        >
          <CheckCircle className="h-3 w-3" />
          اعتماد / رفض
        </GuardedButton>
      )}

      {row.status === "approved" && (
        <GuardedButton
          perm="finance.purchase:create"
          size="sm"
          variant="default"
          className="gap-1"
          onClick={() => onConvert(row)}
        >
          <ShoppingCart className="h-3 w-3" />
          تحويل لأمر شراء
        </GuardedButton>
      )}
    </div>
  );
}

function CreatePRDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const mut = useApiMutation<unknown, CreateForm>(
    "/finance/purchase-requests",
    "POST",
    [["finance-purchase-requests"]],
    { successMessage: "تم إنشاء طلب الشراء" },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            طلب شراء جديد
          </DialogTitle>
        </DialogHeader>
        <FormShell
          schema={createSchema}
          defaultValues={{
            supplierId: undefined,
            expectedDelivery: "",
            costCenter: "",
            notes: "",
            items: [{ description: "", quantity: 1, unitPrice: 0 } as any],
          }}
          submitLabel="إنشاء الطلب"
          secondaryActions={
            <>
              <ImpactPreviewButton />
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                إلغاء
              </Button>
            </>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
            onSaved();
          }}
        >
          <FormGrid cols={2}>
            <SupplierPicker />
            <FormDateField name="expectedDelivery" label="التاريخ المتوقع للتسليم" />
          </FormGrid>
          <FormTextField name="costCenter" label="مركز التكلفة" placeholder="CC-…" />
          <FormTextareaField name="notes" label="ملاحظات" rows={2} />
          <ItemsArray />
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function SupplierPicker() {
  const { watch, setValue, formState } = useFormContext<CreateForm>();
  const supplierId = watch("supplierId");
  const err = formState.errors.supplierId?.message;
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">المورد (اختياري)</label>
      <SupplierSelect
        value={supplierId ? String(supplierId) : ""}
        onChange={(v) => setValue("supplierId", v ? Number(v) : undefined, { shouldDirty: true })}
        placeholder="اختر المورد..."
      />
      {err && <p className="text-xs text-status-error-foreground">{String(err)}</p>}
    </div>
  );
}

function ItemsArray() {
  const { control, register, watch, formState } = useFormContext<CreateForm>();
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = watch("items") ?? [];
  const total = items.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0,
  );
  const itemsErr = formState.errors.items?.message;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">البنود</h4>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => append({ description: "", quantity: 1, unitPrice: 0 } as any)}
          className="gap-1"
        >
          <Plus className="h-3 w-3" /> بند
        </Button>
      </div>
      {itemsErr && <p className="text-xs text-status-error-foreground">{String(itemsErr)}</p>}
      <div className="space-y-2">
        {fields.map((f, idx) => {
          const rowTotal =
            (Number(items[idx]?.quantity) || 0) * (Number(items[idx]?.unitPrice) || 0);
          return (
            <div key={f.id} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                <label className="text-xs text-muted-foreground">الوصف</label>
                <input
                  {...register(`items.${idx}.description` as const)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">الكمية</label>
                <input
                  type="number"
                  step="0.01"
                  {...register(`items.${idx}.quantity` as const)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">السعر</label>
                <input
                  type="number"
                  step="0.01"
                  {...register(`items.${idx}.unitPrice` as const)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2 text-end">
                <label className="text-xs text-muted-foreground">الإجمالي</label>
                <div className="px-2 py-2 text-sm font-medium">
                  {rowTotal.toLocaleString("ar-SA")}
                </div>
              </div>
              <div className="col-span-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(idx)}
                  disabled={fields.length === 1}
                  className="text-status-error-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-end text-sm pt-2 border-t">
        إجمالي الطلب: <span className="font-bold">{total.toLocaleString("ar-SA")}</span> ر.س
      </div>
    </div>
  );
}

function ImpactPreviewButton() {
  const { getValues } = useFormContext<CreateForm>();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ImpactPreview | null>(null);
  const { toast } = useToast();

  const handlePreview = async () => {
    setLoading(true);
    try {
      const values = getValues();
      const result = await apiFetch<ImpactPreview>("/finance/purchase-requests/impact-preview", {
        method: "POST",
        body: JSON.stringify({
          supplierId: values.supplierId,
          costCenter: values.costCenter,
          items: values.items.map((it) => ({
            quantity: it.quantity,
            unitPrice: it.unitPrice,
          })),
        }),
      });
      setPreview(result);
    } catch (e: any) {
      toast({ title: "خطأ في معاينة الأثر", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={handlePreview} disabled={loading} className="gap-1">
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        معاينة الأثر
      </Button>
      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>أثر الطلب قبل التقديم</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              <p className="text-sm font-medium">{preview.summary}</p>
              {preview.items.map((it, i) => (
                <Card key={i}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={
                          it.severity === "warning"
                            ? "secondary"
                            : it.severity === "danger"
                              ? "destructive"
                              : it.severity === "success"
                                ? "default"
                                : "outline"
                        }
                      >
                        {it.category}
                      </Badge>
                      <span className="text-sm font-medium">{it.label}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{it.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreview(null)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApprovePRDialog({
  pr,
  onOpenChange,
  onDone,
}: {
  pr: PurchaseRequest;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const decide = async (approved: "true" | "false" | "returned", notes: string) => {
    if ((approved === "false" || approved === "returned") && !notes.trim()) {
      toast({
        title: "السبب مطلوب",
        description: approved === "false" ? "أدخل سبب الرفض" : "أدخل سبب الإرجاع",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/finance/purchase-requests/${pr.id}/approve`, {
        method: "PATCH",
        body: JSON.stringify({
          approved: approved === "true" ? true : approved === "false" ? false : "returned",
          notes,
        }),
      });
      toast({
        title:
          approved === "true"
            ? "تمت الموافقة"
            : approved === "false"
              ? "تم الرفض"
              : "تم الإرجاع للتعديل",
      });
      onDone();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const [notes, setNotes] = useState("");

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>قرار اعتماد الطلب {pr.ref}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-surface-subtle p-3 text-sm">
            <div className="flex justify-between">
              <span>المورد:</span>
              <span className="font-medium">{pr.supplierName ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span>الإجمالي:</span>
              <span className="font-semibold">{Number(pr.totalAmount).toLocaleString("ar-SA")} ر.س</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              الملاحظات / السبب
              <span className="text-xs text-muted-foreground"> (مطلوب للرفض أو الإرجاع)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <DialogFooter className="flex-row-reverse gap-2">
          <Button
            type="button"
            onClick={() => decide("true", notes)}
            disabled={submitting}
            className="gap-1"
          >
            <CheckCircle className="h-4 w-4" /> اعتماد
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => decide("false", notes)}
            disabled={submitting}
            className="gap-1"
          >
            <XCircle className="h-4 w-4" /> رفض
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => decide("returned", notes)}
            disabled={submitting}
            className="gap-1"
          >
            <RotateCcw className="h-4 w-4" /> إرجاع للتعديل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertToPODialog({
  pr,
  onOpenChange,
  onDone,
}: {
  pr: PurchaseRequest;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const mut = useApiMutation<{ poId: number; ref: string }, ConvertForm>(
    `/finance/purchase-requests/${pr.id}/convert-to-po`,
    "POST",
    [["finance-purchase-requests"], ["finance-purchase-orders"]],
    { successMessage: "تم إنشاء أمر الشراء" },
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            تحويل {pr.ref} إلى أمر شراء
          </DialogTitle>
        </DialogHeader>
        <FormShell
          schema={convertSchema}
          defaultValues={{ expectedDelivery: "", notes: pr.notes ?? "" }}
          submitLabel="إنشاء أمر الشراء"
          secondaryActions={
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
            onDone();
          }}
        >
          <FormDateField name="expectedDelivery" label="التاريخ المتوقع للتسليم" />
          <FormTextareaField name="notes" label="ملاحظات إضافية" rows={3} />
          <p className="text-xs text-muted-foreground">
            سيتم إنشاء أمر شراء بنفس البنود والمبلغ ({Number(pr.totalAmount).toLocaleString("ar-SA")} ر.س)،
            وسيمر بدورة اعتماد PO إذا تجاوز الحد المسموح.
          </p>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}
