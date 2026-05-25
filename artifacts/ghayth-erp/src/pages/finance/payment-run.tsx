import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
  FormShell,
  FormGrid,
  FormDateField,
  FormSelectField,
  FormTextField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { usePermission } from "@/components/shared/permission-gate";
import { Banknote, AlertCircle } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { BulkCheckbox } from "@/components/shared/bulk-actions";

/**
 * FIN-016 — Payment-run batch UI.
 *
 * GET /finance/payment-run/pending lists every purchase order whose
 * 3-way match has completed (status='invoice_matched') so it's ready
 * to pay. The operator selects which POs to include, picks a payment
 * date / method, and POSTs to /finance/payment-run/execute which
 * (a) records the payment, (b) posts the AP-clearing GL entry, and
 * (c) flips each PO's status to 'paid'.
 *
 * Before this page, those endpoints existed but had no UI; AP had to
 * curl them, which they didn't.
 */

interface PendingPo {
  id: number;
  ref: string;
  totalAmount: number | string;
  createdAt: string;
  expectedDelivery: string | null;
  supplierId: number;
  supplierName: string;
}

interface VendorGroup {
  supplierId: number;
  supplierName: string;
  amount: number;
  count: number;
}

interface PendingResp {
  data: PendingPo[];
  totalDue: number;
  byVendor?: VendorGroup[];
}

const paymentRunSchema = z.object({
  paymentDate: z.string(),
  method: z.string(),
  reference: z.string(),
});

const PAYMENT_METHOD_OPTIONS = [
  { value: "bank_transfer", label: "حوالة بنكية" },
  { value: "cash", label: "نقدي" },
  { value: "cheque", label: "شيك" },
];

export default function PaymentRunPage() {
  const [cutoffDate, setCutoffDate] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const canPay = usePermission("finance.purchase:create");
  const today = new Date().toISOString().slice(0, 10);

  const query = new URLSearchParams();
  if (cutoffDate) query.set("cutoffDate", cutoffDate);
  if (supplierId) query.set("supplierId", supplierId);
  const qs = query.toString();
  const { data, isLoading, isError, refetch } = useApiQuery<PendingResp>(
    ["payment-run-pending", cutoffDate, supplierId],
    `/finance/payment-run/pending${qs ? `?${qs}` : ""}`,
  );

  const pos: PendingPo[] = asList(data?.data || []);
  const vendors: VendorGroup[] = data?.byVendor ?? [];
  const totalDue = Number(data?.totalDue ?? 0);

  const selectedTotal = pos
    .filter((p) => selected.has(p.id))
    .reduce((s, p) => s + Number(p.totalAmount || 0), 0);

  const toggleAll = () => {
    if (selected.size === pos.length && pos.length > 0) setSelected(new Set());
    else setSelected(new Set(pos.map((p) => p.id)));
  };
  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const executeMut = useApiMutation<unknown, { poIds: number[]; paymentDate?: string; method?: string; reference?: string }>(
    "/finance/payment-run/execute",
    "POST",
    [["payment-run-pending"], ["purchase-orders"]],
    {
      successMessage: "تم تنفيذ دفعة الدفع",
      onSuccess: () => {
        setSelected(new Set());
        setConfirming(false);
        refetch();
      },
    },
  );

  const columns: DataTableColumn<PendingPo>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (p) => (
        <span onClick={(e) => e.stopPropagation()}>
          <BulkCheckbox checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
        </span>
      ),
    },
    { key: "ref", header: "المرجع", className: "font-mono text-xs" },
    { key: "supplierName", header: "المورد" },
    { key: "expectedDelivery", header: "الاستحقاق", render: (p) => p.expectedDelivery ? formatDateAr(p.expectedDelivery) : formatDateAr(p.createdAt) },
    { key: "totalAmount", header: "المبلغ", render: (p) => <span className="font-bold">{formatCurrency(Number(p.totalAmount || 0))}</span> },
  ];


  return (
    <PageShell
      title="دفعة الدفع الجماعية"
      subtitle="جدول أوامر الشراء المُطابَقة الجاهزة للدفع — اختر ونفّذ دفعة واحدة"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "دفعة الدفع" }]}
    >
      {isLoading ? <LoadingSpinner /> : isError ? <ErrorState /> : (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">قابل للدفع</p>
              <p className="text-xl font-bold">{pos.length}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">الإجمالي المُستحَق</p>
              <p className="text-xl font-bold">{formatCurrency(totalDue)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">عدد الموردين</p>
              <p className="text-xl font-bold">{vendors.length}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">المُختار للدفع</p>
              <p className="text-xl font-bold text-emerald-600">{formatCurrency(selectedTotal)}</p>
            </CardContent></Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-4 flex gap-3 items-end flex-wrap">
              <div>
                <Label className="text-xs">تاريخ الاستحقاق حتى</Label>
                <Input type="date" value={cutoffDate} onChange={(e) => setCutoffDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">المورد (اختياري)</Label>
                <Select value={supplierId || "all"} onValueChange={(v) => setSupplierId(v === "all" ? "" : v)}>
                  <SelectTrigger className="mt-1 w-44"><SelectValue placeholder="كل الموردين" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الموردين</SelectItem>
                    {vendors.map((v) => <SelectItem key={v.supplierId} value={String(v.supplierId)}>{v.supplierName} ({v.count})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs">
                {selected.size === pos.length && pos.length > 0 ? "إلغاء التحديد" : "تحديد الكل"}
              </Button>
            </CardContent>
          </Card>

          {/* Pending POs */}
          <DataTable
            columns={columns}
            data={pos}
            emptyMessage="لا توجد أوامر شراء جاهزة للدفع"
            emptyIcon={<Banknote className="h-6 w-6 text-slate-400" />}
            noToolbar
          />

          {/* Execute block */}
          {selected.size > 0 && (
            <Card className="border-emerald-200 bg-emerald-50/40">
              <CardContent className="p-4">
                <div className="text-sm font-semibold mb-3">تنفيذ الدفع لـ{selected.size} أمر — {formatCurrency(selectedTotal)}</div>
                <FormShell
                  schema={paymentRunSchema}
                  defaultValues={{ paymentDate: today, method: "bank_transfer", reference: "" }}
                  submitLabel={confirming ? "تأكيد التنفيذ" : "تنفيذ الدفع"}
                  disabled={!canPay}
                  secondaryActions={confirming ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>إلغاء</Button>
                  ) : null}
                  onSubmit={async (values) => {
                    if (!confirming) {
                      setConfirming(true);
                      return;
                    }
                    await executeMut.mutateAsync({
                      poIds: Array.from(selected),
                      paymentDate: values.paymentDate || undefined,
                      method: values.method,
                      reference: values.reference?.trim() || undefined,
                    });
                  }}
                >
                  <FormGrid cols={3}>
                    <FormDateField name="paymentDate" label="تاريخ الدفع" />
                    <FormSelectField name="method" label="طريقة الدفع" options={PAYMENT_METHOD_OPTIONS} />
                    <FormTextField name="reference" label="المرجع" placeholder="رقم الحوالة / الشيك" />
                  </FormGrid>
                  {confirming && (
                    <div className="flex items-center gap-2 bg-status-warning-surface border border-status-warning-surface rounded-md p-3">
                      <AlertCircle className="h-4 w-4 shrink-0 text-status-warning-foreground" />
                      <span className="text-sm text-status-warning-foreground">سيُرحَّل قيد GL واحد لكل مورد — لا يمكن التراجع.</span>
                    </div>
                  )}
                </FormShell>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PageShell>
  );
}
