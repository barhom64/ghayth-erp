import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Banknote, Send, AlertCircle } from "lucide-react";
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

export default function PaymentRunPage() {
  const [cutoffDate, setCutoffDate] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [confirming, setConfirming] = useState(false);

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
        setReference("");
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

  const submit = () => {
    if (selected.size === 0) return;
    executeMut.mutate({
      poIds: Array.from(selected),
      paymentDate: paymentDate || undefined,
      method,
      reference: reference.trim() || undefined,
    });
  };

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
              <CardContent className="p-4 space-y-3">
                <div className="text-sm font-semibold">تنفيذ الدفع لـ{selected.size} أمر — {formatCurrency(selectedTotal)}</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">تاريخ الدفع</Label>
                    <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">طريقة الدفع</Label>
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank_transfer">حوالة بنكية</SelectItem>
                        <SelectItem value="cash">نقدي</SelectItem>
                        <SelectItem value="cheque">شيك</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">المرجع</Label>
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="رقم الحوالة / الشيك" className="mt-1" />
                  </div>
                </div>
                {confirming ? (
                  <div className="flex items-center justify-between gap-3 bg-status-warning-surface border border-status-warning-surface rounded-md p-3">
                    <div className="flex items-center gap-2 text-sm text-status-warning-foreground">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>سيُرحَّل قيد GL واحد لكل مورد — لا يمكن التراجع.</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>إلغاء</Button>
                      <GuardedButton
                        perm="finance.purchase:create"
                        size="sm"
                        variant="default"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        disabled={executeMut.isPending}
                        onClick={submit}
                        rateLimitAware
                      >
                        {executeMut.isPending ? "جاري التنفيذ..." : "تأكيد التنفيذ"}
                      </GuardedButton>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <GuardedButton perm="finance.purchase:create" size="sm" onClick={() => setConfirming(true)} className="gap-1">
                      <Send className="h-4 w-4" /> تنفيذ الدفع
                    </GuardedButton>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PageShell>
  );
}
