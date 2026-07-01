import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiMutation, useApiQuery, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreatePageLayout } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Wallet, FileText } from "lucide-react";

interface CustomerAdvance {
  id: number;
  ref: string;
  amount: number | string;
  appliedAmount: number | string;
  remaining: number | string;
  method: string | null;
  receivedDate: string | null;
  status: string;
  clientName: string | null;
  clientId?: number;
}

interface InvoiceOption {
  id: number;
  ref?: string;
  invoiceNumber?: string;
  total: number | string;
  paidAmount: number | string;
  status: string;
  clientId: number;
  dueDate?: string | null;
}

export default function CustomerAdvancesApply() {
  const [, params] = useRoute("/finance/customer-advances/:id/apply");
  const id = params?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: advancesResp, isLoading, isError } = useApiQuery<{ data: CustomerAdvance[] }>(
    ["customer-advances"], "/finance/customer-advances",
  );
  const advance = advancesResp?.data.find((a) => String(a.id) === id);

  const { data: invoicesResp } = useApiQuery<{ data: InvoiceOption[] }>(
    ["invoices", "open", String(advance?.clientId ?? "")],
    advance ? `/finance/invoices` : null,
    !!advance,
  );

  const applyMut = useApiMutation(
    `/finance/customer-advances/${id}/apply`, "POST",
    [["customer-advances"], ["invoices"]],
  );

  const [invoiceId, setInvoiceId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError || !advance) return <ErrorState />;

  const remaining = Number(advance.remaining);
  const openInvoices = (invoicesResp?.data ?? []).filter(
    (inv) => String(inv.clientId) === String(advance.clientId)
      && inv.status !== "paid"
      && inv.status !== "cancelled"
      && (Number(inv.total) - Number(inv.paidAmount)) > 0,
  );

  const selectedInvoice = invoiceId ? openInvoices.find((i) => String(i.id) === invoiceId) : null;
  const invoiceRemaining = selectedInvoice
    ? Number(selectedInvoice.total) - Number(selectedInvoice.paidAmount)
    : 0;
  const maxApplicable = selectedInvoice ? Math.min(remaining, invoiceRemaining) : 0;
  const amountNum = Number(amount) || 0;

  const handleApply = async () => {
    const firstError = validate({
      invoiceId: invoiceId ? null : "اختر فاتورة لتطبيق الدفعة عليها",
      amount: !amount ? "المبلغ مطلوب"
        : amountNum <= 0 ? "المبلغ يجب أن يكون أكبر من صفر"
        : amountNum > remaining ? `المبلغ يتجاوز رصيد الدفعة المقدمة (${formatCurrency(remaining)})`
        : amountNum > invoiceRemaining ? `المبلغ يتجاوز رصيد الفاتورة (${formatCurrency(invoiceRemaining)})`
        : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await applyMut.mutateAsync({
        invoiceId: Number(invoiceId),
        amount: amountNum,
      });
      toast({ title: "تم تطبيق الدفعة المقدمة على الفاتورة" });
      setLocation("/finance/customer-advances");
    } catch (err: any) {
      setApiError(err);
      toast({
        variant: "destructive",
        title: "حدث خطأ",
        description: err?.fix ?? getErrorMessage(err),
      });
    }
  };

  return (
    <CreatePageLayout
      title={`تطبيق دفعة مقدمة — ${advance.ref}`}
      backPath="/finance/customer-advances"
    >
      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4" /> الدفعة المقدمة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">العميل</p>
              <p className="font-semibold">{advance.clientName ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">تاريخ الاستلام</p>
              <p>{advance.receivedDate ? formatDateAr(advance.receivedDate) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي</p>
              <p className="font-mono">{formatCurrency(Number(advance.amount))}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">المتبقي للتطبيق</p>
              <p className="font-mono font-bold text-status-warning-foreground">{formatCurrency(remaining)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormFieldWrapper label="الفاتورة المراد تطبيق الدفعة عليها" required error={fieldErrors.invoiceId}>
          {openInvoices.length === 0 ? (
            <div className="border rounded-md p-3 text-sm text-muted-foreground bg-muted/30">
              لا توجد فواتير مفتوحة لهذا العميل
            </div>
          ) : (
            <select
              value={invoiceId}
              onChange={(e) => { setInvoiceId(e.target.value); setAmount(""); }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— اختر فاتورة —</option>
              {openInvoices.map((inv) => {
                const rem = Number(inv.total) - Number(inv.paidAmount);
                return (
                  <option key={inv.id} value={String(inv.id)}>
                    {inv.ref || inv.invoiceNumber || `#${inv.id}`} — متبقي {formatCurrency(rem)}
                  </option>
                );
              })}
            </select>
          )}
        </FormFieldWrapper>

        <NumberField
          label="المبلغ المُطبَّق (ريال)" required
          value={amount}
          onChange={(v) => setAmount(v)}
          placeholder="0.00"
          step={0.01}
          min={0}
          max={maxApplicable}
          error={fieldErrors.amount}
        />
      </div>

      {selectedInvoice && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" /> تفاصيل الفاتورة المختارة
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">رقم الفاتورة</p>
                <p className="font-mono">{selectedInvoice.ref || selectedInvoice.invoiceNumber || `#${selectedInvoice.id}`}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">الإجمالي</p>
                <p className="font-mono">{formatCurrency(Number(selectedInvoice.total))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">المتبقي</p>
                <p className="font-mono font-bold text-status-warning-foreground">{formatCurrency(invoiceRemaining)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              الحد الأقصى للتطبيق: <span className="font-mono font-bold">{formatCurrency(maxApplicable)}</span>
              {" — "}
              <button
                type="button"
                className="text-status-info-foreground hover:underline"
                onClick={() => setAmount(maxApplicable.toFixed(2))}
              >
                تطبيق الحد الأقصى
              </button>
            </p>
          </CardContent>
        </Card>
      )}

      {amountNum > 0 && selectedInvoice && (
        <Card className="mt-4 bg-muted/30">
          <CardContent className="p-3">
            <p className="text-xs font-semibold mb-2">معاينة القيد المُولّد</p>
            <div className="text-xs space-y-1 font-mono">
              <div className="flex justify-between">
                <span>2160 — التزام دفعة مقدمة (العميل)</span>
                <span className="text-orange-700">مدين {formatCurrency(amountNum)}</span>
              </div>
              <div className="flex justify-between">
                <span>1131 — حسابات مدينة (AR)</span>
                <span className="text-emerald-700">دائن {formatCurrency(amountNum)}</span>
              </div>
              <p className="text-muted-foreground text-[10px] mt-2">
                نتيجة: رصيد الالتزام يقل بـ {formatCurrency(amountNum)}، ورصيد الفاتورة يقل بنفس المبلغ.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/customer-advances")}>إلغاء</Button>
        <Button
          onClick={handleApply}
          disabled={applyMut.isPending || !invoiceId || !amount || amountNum <= 0}
          rateLimitAware
        >
          {applyMut.isPending ? "جاري التطبيق..." : "تطبيق على الفاتورة"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
