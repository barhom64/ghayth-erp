import { useState } from "react";
import { useApiMutation, getErrorMessage } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuardedButton } from "@/components/shared/permission-gate";
import { CheckCircle2, FileCheck2, CalendarClock, AlertTriangle } from "lucide-react";
import { todayLocal, formatCurrency } from "@/lib/formatters";

/**
 * The 3-way-match → payment workflow actions for a purchase order.
 *
 * finance-purchase.ts exposed these state transitions with no UI (the PO page
 * only showed the match RESULTS). This renders the one action valid for the
 * PO's current status, matching the backend's state gates exactly:
 *
 *   pending|sent          → PATCH .../vendor-confirm    → confirmed
 *   received|part_received → POST  .../match-invoice    → invoice_matched | mismatch
 *   invoice_matched       → POST  .../schedule-payment  → payment_scheduled
 *
 * Anything else (or invoice_mismatch) renders an inert note instead of a wrong
 * action, so the UI can never offer a transition the API would reject.
 */
export function PurchaseOrderMatchSection({
  poId,
  poStatus,
  totalAmount,
}: {
  poId: number | string;
  poStatus: string | undefined;
  totalAmount: number;
}) {
  const keys = [["po-detail", String(poId)], ["po-match", String(poId)], ["purchase-orders"]];

  const [confirmDelivery, setConfirmDelivery] = useState("");
  const confirmMut = useApiMutation<unknown, { confirmedDelivery?: string }>(
    `/finance/purchase-orders/${poId}/vendor-confirm`,
    "PATCH",
    keys,
    { successMessage: "تم تأكيد أمر الشراء من المورد" },
  );

  const [inv, setInv] = useState({ supplierInvoiceRef: "", invoicedAmount: String(totalAmount || ""), invoicedDate: todayLocal() });
  const matchMut = useApiMutation<unknown, { supplierInvoiceRef: string; invoicedAmount: number; invoicedDate?: string }>(
    `/finance/purchase-orders/${poId}/match-invoice`,
    "POST",
    keys,
    { successMessage: "تمت مطابقة فاتورة المورد" },
  );

  const [pay, setPay] = useState({ paymentDate: todayLocal(), amount: String(totalAmount || ""), method: "bank_transfer", notes: "" });
  const scheduleMut = useApiMutation<unknown, { paymentDate: string; amount: number; method?: string; notes?: string }>(
    `/finance/purchase-orders/${poId}/schedule-payment`,
    "POST",
    keys,
    { successMessage: "تمت جدولة الدفع" },
  );

  // pending|sent → vendor confirmation
  if (["pending", "sent"].includes(poStatus || "")) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> تأكيد المورد</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">يؤكّد المورد استلام أمر الشراء؛ يمكنك تثبيت تاريخ التسليم المتوقّع.</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs">تاريخ التسليم المؤكَّد (اختياري)</Label>
              <Input type="date" value={confirmDelivery} onChange={(e) => setConfirmDelivery(e.target.value)} className="w-48" />
            </div>
            <GuardedButton
              perm="finance.purchase:update"
              size="sm"
              disabled={confirmMut.isPending}
              onClick={() => confirmMut.mutate(confirmDelivery ? { confirmedDelivery: confirmDelivery } : {})}
              rateLimitAware
            >
              تأكيد المورد
            </GuardedButton>
          </div>
          {confirmMut.isError && <p className="text-xs text-destructive">{getErrorMessage(confirmMut.error)}</p>}
        </CardContent>
      </Card>
    );
  }

  // received|partially_received → 3-way match against the supplier invoice
  if (["received", "partially_received"].includes(poStatus || "")) {
    const valid = inv.supplierInvoiceRef.trim().length > 0 && Number(inv.invoicedAmount) > 0;
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-status-info-foreground" /> مطابقة فاتورة المورد (3-way)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">طابِق فاتورة المورد مع أمر الشراء وسند الاستلام. يُرحَّل قيد GRNI/AP عند المطابقة.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">رقم فاتورة المورد</Label>
              <Input value={inv.supplierInvoiceRef} onChange={(e) => setInv({ ...inv, supplierInvoiceRef: e.target.value })} placeholder="INV-..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المبلغ المفوتر</Label>
              <Input type="number" inputMode="decimal" value={inv.invoicedAmount} onChange={(e) => setInv({ ...inv, invoicedAmount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">تاريخ الفاتورة</Label>
              <Input type="date" value={inv.invoicedDate} onChange={(e) => setInv({ ...inv, invoicedDate: e.target.value })} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">إجمالي أمر الشراء: {formatCurrency(totalAmount)}</p>
          <GuardedButton
            perm="finance.purchase:create"
            size="sm"
            disabled={!valid || matchMut.isPending}
            onClick={() => matchMut.mutate({
              supplierInvoiceRef: inv.supplierInvoiceRef.trim(),
              invoicedAmount: Number(inv.invoicedAmount),
              ...(inv.invoicedDate ? { invoicedDate: inv.invoicedDate } : {}),
            })}
            rateLimitAware
          >
            مطابقة الفاتورة
          </GuardedButton>
          {matchMut.isError && <p className="text-xs text-destructive">{getErrorMessage(matchMut.error)}</p>}
        </CardContent>
      </Card>
    );
  }

  // invoice_matched → schedule the payment
  if (poStatus === "invoice_matched") {
    const valid = pay.paymentDate.length >= 8 && Number(pay.amount) > 0;
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CalendarClock className="h-4 w-4 text-amber-600" /> جدولة الدفع</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">طُوبقت الفاتورة — جدوِل دفعتها. يُرحَّل القيد ولا يُسمح في فترة مُقفلة.</p>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">تاريخ الدفع</Label>
              <Input type="date" value={pay.paymentDate} onChange={(e) => setPay({ ...pay, paymentDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المبلغ</Label>
              <Input type="number" inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">طريقة الدفع</Label>
              <Select value={pay.method} onValueChange={(v) => setPay({ ...pay, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                  <SelectItem value="cash">نقداً</SelectItem>
                  <SelectItem value="cheque">شيك</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ملاحظات (اختياري)</Label>
              <Input value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} />
            </div>
          </div>
          <GuardedButton
            perm="finance.purchase:create"
            size="sm"
            disabled={!valid || scheduleMut.isPending}
            onClick={() => scheduleMut.mutate({
              paymentDate: pay.paymentDate,
              amount: Number(pay.amount),
              method: pay.method,
              ...(pay.notes.trim() ? { notes: pay.notes.trim() } : {}),
            })}
            rateLimitAware
          >
            جدولة الدفع
          </GuardedButton>
          {scheduleMut.isError && <p className="text-xs text-destructive">{getErrorMessage(scheduleMut.error)}</p>}
        </CardContent>
      </Card>
    );
  }

  // invoice_mismatch → no clean re-match transition; surface, don't offer a wrong action
  if (poStatus === "invoice_mismatch") {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-3 flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
          <span>تعذّرت مطابقة الفاتورة (فرق في المبلغ) — يلزم مراجعة يدوية قبل جدولة الدفع.</span>
        </CardContent>
      </Card>
    );
  }

  return null;
}
